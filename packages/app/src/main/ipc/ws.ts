import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

export type WsProfile = {
  id: string;
  name: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  subprotocol: string;
  autoReconnect: boolean;
  reconnectDelay: number;
};

export type WsTemplate = {
  id: string;
  name: string;
  payload: string;
};

type LiveConn = {
  ws: WebSocket | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  shouldReconnect: boolean;
  profile: WsProfile;
  pingAt: number | null;
  sender: Electron.WebContents;
};

const liveConns = new Map<string, LiveConn>();

// --- Persistence ---

function getProfilesPath() { return path.join(app.getPath('userData'), 'ws-profiles.json'); }
function getTemplatesPath() { return path.join(app.getPath('userData'), 'ws-templates.json'); }

function readProfiles(): WsProfile[] {
  try { return JSON.parse(fs.readFileSync(getProfilesPath(), 'utf-8')); } catch { return []; }
}
function writeProfiles(p: WsProfile[]) { fs.writeFileSync(getProfilesPath(), JSON.stringify(p, null, 2)); }

function readTemplates(): WsTemplate[] {
  try { return JSON.parse(fs.readFileSync(getTemplatesPath(), 'utf-8')); } catch { return []; }
}
function writeTemplates(t: WsTemplate[]) { fs.writeFileSync(getTemplatesPath(), JSON.stringify(t, null, 2)); }

// --- Connection management ---

function doConnect(connId: string, live: LiveConn): void {
  const { profile, sender } = live;

  const headers: Record<string, string> = {};
  for (const h of profile.headers) {
    if (h.enabled && h.key.trim()) headers[h.key.trim()] = h.value;
  }

  live.status = 'connecting';
  sender.send(`ws:${connId}:status`, { status: 'connecting' });

  const wsOpts: WebSocket.ClientOptions = { headers };
  if (profile.subprotocol.trim()) wsOpts.protocol = profile.subprotocol.trim();

  let ws: WebSocket;
  try {
    ws = new WebSocket(profile.url, wsOpts);
  } catch (err) {
    live.status = 'error';
    sender.send(`ws:${connId}:status`, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  live.ws = ws;

  ws.on('open', () => {
    live.status = 'connected';
    sender.send(`ws:${connId}:status`, { status: 'connected', at: Date.now() });
  });

  ws.on('message', (data, isBinary) => {
    const buf = isBinary ? (data as Buffer) : Buffer.from(data.toString(), 'utf-8');
    const payload = isBinary ? `[binary: ${buf.byteLength} bytes]` : data.toString();
    sender.send(`ws:${connId}:message`, {
      id: crypto.randomUUID(),
      direction: 'received',
      payload,
      binary: isBinary,
      byteLen: buf.byteLength,
      timestamp: Date.now(),
    });
  });

  ws.on('ping', () => {
    sender.send(`ws:${connId}:frame`, { type: 'ping', timestamp: Date.now() });
  });

  ws.on('pong', () => {
    const latency = live.pingAt != null ? Date.now() - live.pingAt : null;
    live.pingAt = null;
    sender.send(`ws:${connId}:frame`, { type: 'pong', latency, timestamp: Date.now() });
  });

  ws.on('close', (code, reason) => {
    live.status = 'disconnected';
    live.ws = null;
    sender.send(`ws:${connId}:status`, {
      status: 'disconnected',
      code,
      reason: reason.toString(),
    });

    if (live.shouldReconnect && profile.autoReconnect && liveConns.has(connId)) {
      live.reconnectTimer = setTimeout(() => {
        if (liveConns.has(connId) && live.shouldReconnect) {
          doConnect(connId, live);
        }
      }, Math.max(500, profile.reconnectDelay));
    }
  });

  ws.on('error', (err) => {
    live.status = 'error';
    sender.send(`ws:${connId}:status`, { status: 'error', error: err.message });
  });
}

export function registerWsIpc(): void {
  // --- Profiles CRUD ---

  ipcMain.handle('ws:profiles:list', () => readProfiles());

  ipcMain.handle('ws:profiles:save', (_event, profile: WsProfile) => {
    const list = readProfiles();
    const idx = list.findIndex(p => p.id === profile.id);
    idx !== -1 ? (list[idx] = profile) : list.push(profile);
    writeProfiles(list);
    return profile;
  });

  ipcMain.handle('ws:profiles:delete', (_event, id: string) => {
    writeProfiles(readProfiles().filter(p => p.id !== id));
  });

  // --- Templates CRUD ---

  ipcMain.handle('ws:templates:list', () => readTemplates());

  ipcMain.handle('ws:templates:save', (_event, tpl: WsTemplate) => {
    const list = readTemplates();
    const idx = list.findIndex(t => t.id === tpl.id);
    idx !== -1 ? (list[idx] = tpl) : list.push(tpl);
    writeTemplates(list);
    return tpl;
  });

  ipcMain.handle('ws:templates:delete', (_event, id: string) => {
    writeTemplates(readTemplates().filter(t => t.id !== id));
  });

  // --- Connection lifecycle ---

  ipcMain.handle('ws:connect', (event, connId: string, profile: WsProfile) => {
    const existing = liveConns.get(connId);
    if (existing) {
      existing.shouldReconnect = false;
      if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
      existing.ws?.close();
    }

    const live: LiveConn = {
      ws: null,
      status: 'connecting',
      reconnectTimer: null,
      shouldReconnect: profile.autoReconnect,
      profile,
      pingAt: null,
      sender: event.sender,
    };
    liveConns.set(connId, live);
    doConnect(connId, live);
  });

  ipcMain.handle('ws:disconnect', (_event, connId: string) => {
    const live = liveConns.get(connId);
    if (!live) return;
    live.shouldReconnect = false;
    if (live.reconnectTimer) clearTimeout(live.reconnectTimer);
    live.ws?.close(1000, 'User disconnected');
    liveConns.delete(connId);
  });

  // --- Messaging ---

  ipcMain.handle('ws:send', (event, connId: string, payload: string) => {
    const live = liveConns.get(connId);
    if (!live?.ws || live.status !== 'connected') return { error: 'Not connected' };
    try {
      live.ws.send(payload);
      const byteLen = Buffer.byteLength(payload, 'utf-8');
      event.sender.send(`ws:${connId}:message`, {
        id: crypto.randomUUID(),
        direction: 'sent',
        payload,
        binary: false,
        byteLen,
        timestamp: Date.now(),
      });
      return { success: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ws:ping', (_event, connId: string) => {
    const live = liveConns.get(connId);
    if (!live?.ws || live.status !== 'connected') return { error: 'Not connected' };
    live.pingAt = Date.now();
    live.ws.ping();
    return { success: true };
  });
}

export function stopAllWsConnections(): void {
  for (const [, live] of liveConns) {
    live.shouldReconnect = false;
    if (live.reconnectTimer) clearTimeout(live.reconnectTimer);
    try { live.ws?.close(); } catch { /* ignore */ }
  }
  liveConns.clear();
}
