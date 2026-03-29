import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Wifi, WifiOff, Loader2,
  ChevronDown, BookMarked, RefreshCw, Activity,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '@/lib/utils';
import { MessageLog } from './MessageLog';
import { MessageComposer } from './MessageComposer';

// ─── Types ────────────────────────────────────────────────────────────────────

type WsProfile = {
  id: string;
  name: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  subprotocol: string;
  autoReconnect: boolean;
  reconnectDelay: number;
};

type WsTemplate = { id: string; name: string; payload: string };

type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

// Only status info — message stats live in MessageLog
type WsLiveStatus = {
  status: WsStatus;
  connectedAt: number | null;
  error: string | null;
  latency: number | null;
};

const DEFAULT_STATUS: WsLiveStatus = {
  status: 'idle',
  connectedAt: null,
  error: null,
  latency: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newProfile(): WsProfile {
  return {
    id: crypto.randomUUID(),
    name: 'New Connection',
    url: 'ws://',
    headers: [],
    subprotocol: '',
    autoReconnect: false,
    reconnectDelay: 2000,
  };
}

function useUptime(connectedAt: number | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!connectedAt) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);
  if (!connectedAt) return '';
  const secs = Math.floor((Date.now() - connectedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WebSocketPanel({ panelId: _panelId }: { panelId: string }) {
  const [profiles, setProfiles] = useState<WsProfile[]>([]);
  const [templates, setTemplates] = useState<WsTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WsProfile | null>(null);
  const [configTab, setConfigTab] = useState<'headers' | 'options'>('headers');
  const [configOpen, setConfigOpen] = useState(false);

  // Status-only live state — messages live in MessageLog instances
  const [liveStatuses, setLiveStatuses] = useState<Record<string, WsLiveStatus>>({});

  // Per-connection clear tokens driven by the "Clear" button
  const [clearTokens, setClearTokens] = useState<Record<string, number>>({});

  // Always-current draft ref — avoids stale-closure bugs in async callbacks
  const draftRef = useRef<WsProfile | null>(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Keep sidebar in sync with form edits in real-time
  useEffect(() => {
    if (!draft) return;
    setProfiles(prev => {
      if (!prev.some(p => p.id === draft.id)) return prev;
      return prev.map(p => p.id === draft.id ? draft : p);
    });
  }, [draft]);

  // IPC subscription tracking
  const subscribedRef = useRef<Set<string>>(new Set());
  const unsubscribersRef = useRef<Map<string, () => void>>(new Map());

  // Subscribe to status + frame events only — NOT messages (those go to MessageLog)
  const subscribeToConnection = useCallback((connId: string) => {
    const unsubStatus = window.electronAPI.ws.onStatus(connId, (event) => {
      setLiveStatuses(prev => {
        const cur = prev[connId] ?? { ...DEFAULT_STATUS };
        if (event.status === 'connected') {
          return { ...prev, [connId]: { ...cur, status: 'connected', connectedAt: event.at ?? Date.now(), error: null } };
        }
        if (event.status === 'connecting') {
          return { ...prev, [connId]: { ...cur, status: 'connecting' } };
        }
        if (event.status === 'disconnected') {
          return { ...prev, [connId]: { ...cur, status: 'disconnected', connectedAt: null } };
        }
        if (event.status === 'error') {
          return { ...prev, [connId]: { ...cur, status: 'error', error: event.error ?? null } };
        }
        return prev;
      });
    });

    const unsubFrame = window.electronAPI.ws.onFrame(connId, (frame) => {
      if (frame.type === 'pong' && frame.latency != null) {
        setLiveStatuses(prev => {
          const cur = prev[connId] ?? { ...DEFAULT_STATUS };
          return { ...prev, [connId]: { ...cur, latency: frame.latency ?? null } };
        });
      }
    });

    return () => { unsubStatus(); unsubFrame(); };
  }, []);

  // Load persisted data on mount
  useEffect(() => {
    Promise.all([
      window.electronAPI.ws.profilesList(),
      window.electronAPI.ws.templatesList(),
    ]).then(([profs, tmpls]) => {
      setProfiles(profs as WsProfile[]);
      setTemplates(tmpls as WsTemplate[]);
    });
  }, []);

  // Subscribe to events for newly loaded profiles
  useEffect(() => {
    for (const profile of profiles) {
      if (!subscribedRef.current.has(profile.id)) {
        const unsub = subscribeToConnection(profile.id);
        subscribedRef.current.add(profile.id);
        unsubscribersRef.current.set(profile.id, unsub);
      }
    }
  }, [profiles, subscribeToConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const unsub of unsubscribersRef.current.values()) unsub();
    };
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const selectProfile = (id: string) => {
    setSelectedId(id);
    const p = profiles.find(p => p.id === id);
    if (p) setDraft({ ...p });
  };

  const createProfile = async () => {
    const p = newProfile();
    const saved = await window.electronAPI.ws.profilesSave(p) as WsProfile;
    setProfiles(prev => [...prev, saved]);
    if (!subscribedRef.current.has(saved.id)) {
      unsubscribersRef.current.set(saved.id, subscribeToConnection(saved.id));
      subscribedRef.current.add(saved.id);
    }
    // Set draft directly — can't use selectProfile here because setProfiles is async
    // and profiles.find would miss the just-added entry
    setSelectedId(saved.id);
    setDraft({ ...saved });
    setConfigOpen(true);
  };

  const deleteProfile = async (id: string) => {
    const live = liveStatuses[id];
    if (live?.status === 'connected' || live?.status === 'connecting') {
      await window.electronAPI.ws.disconnect(id);
    }
    await window.electronAPI.ws.profilesDelete(id);
    setProfiles(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) { setSelectedId(null); setDraft(null); }
    const unsub = unsubscribersRef.current.get(id);
    if (unsub) { unsub(); unsubscribersRef.current.delete(id); }
    subscribedRef.current.delete(id);
    setLiveStatuses(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const updateDraft = useCallback((patch: Partial<WsProfile>) => {
    const d = draftRef.current;
    if (!d) return;
    const updated = { ...d, ...patch };
    setDraft(updated);
    window.electronAPI.ws.profilesSave(updated);
  }, []);

  const connect = async () => {
    const d = draftRef.current;
    if (!d) return;
    await window.electronAPI.ws.connect(d.id, d);
    setLiveStatuses(prev => ({ ...prev, [d.id]: { ...DEFAULT_STATUS, status: 'connecting' } }));
  };

  const disconnect = async () => {
    if (!draft) return;
    await window.electronAPI.ws.disconnect(draft.id);
  };

  const handleSend = useCallback(async (payload: string) => {
    if (!selectedId) return;
    await window.electronAPI.ws.send(selectedId, payload);
  }, [selectedId]);

  const handleSaveTemplate = useCallback(async (name: string, payload: string) => {
    const tpl: WsTemplate = { id: crypto.randomUUID(), name, payload };
    const saved = await window.electronAPI.ws.templatesSave(tpl) as WsTemplate;
    setTemplates(prev => [...prev, saved]);
  }, []);

  const deleteTemplate = async (id: string) => {
    await window.electronAPI.ws.templatesDelete(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const clearLog = () => {
    if (!selectedId) return;
    setClearTokens(prev => ({ ...prev, [selectedId]: (prev[selectedId] ?? 0) + 1 }));
  };

  const sendPing = async () => {
    if (!selectedId) return;
    await window.electronAPI.ws.ping(selectedId);
  };

  // ─── Derived ────────────────────────────────────────────────────────────────

  const selectedStatus = selectedId ? (liveStatuses[selectedId] ?? DEFAULT_STATUS) : DEFAULT_STATUS;
  const isConnected = selectedStatus.status === 'connected';
  const isConnecting = selectedStatus.status === 'connecting';
  const uptime = useUptime(selectedStatus.connectedAt);

  return (
    <div className="flex h-full bg-background text-foreground text-sm">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connections</span>
          <Button variant="ghost" size="icon-xs" title="New Connection" onClick={createProfile}>
            <Plus />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-1 min-h-0">
          {profiles.length === 0 && (
            <div className="px-3 py-6 flex flex-col items-center gap-3 text-center">
              <Wifi className="size-6 opacity-30" />
              <p className="text-xs text-muted-foreground">No connections yet</p>
              <Button variant="outline" size="xs" onClick={createProfile} className="w-full">
                <Plus /> New Connection
              </Button>
            </div>
          )}
          {profiles.map(profile => {
            const live = liveStatuses[profile.id] ?? DEFAULT_STATUS;
            return (
              <div
                key={profile.id}
                className={cn(
                  'group flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50',
                  selectedId === profile.id && 'bg-muted',
                )}
                onClick={() => selectProfile(profile.id)}
              >
                <StatusDot status={live.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{profile.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">{profile.url}</div>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div className="border-t border-border">
            <div className="px-3 py-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Templates</span>
            </div>
            <div className="overflow-y-auto max-h-36">
              {templates.map(tpl => (
                <div
                  key={tpl.id}
                  className="group flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 cursor-default"
                >
                  <BookMarked className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-xs truncate">{tpl.name}</span>
                  <Button
                    variant="ghost" size="icon"
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={() => deleteTemplate(tpl.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right workspace ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!draft && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <Wifi className="size-8 mx-auto opacity-30" />
              <p className="text-sm">Select or create a connection</p>
              <Button variant="outline" size="sm" onClick={createProfile}>
                <Plus /> New Connection
              </Button>
            </div>
          </div>
        )}

        {draft && (
          <>
            {/* Connection name */}
            <div className="px-3 pt-2 pb-1">
              <Input
                className="border-transparent bg-transparent focus-visible:border-transparent focus-visible:ring-0 px-0 h-7 text-sm font-medium"
                placeholder="Connection name"
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
              />
            </div>

            {/* URL bar */}
            <div className="flex items-center gap-2 px-3 pb-2">
              <div className="flex items-center border border-border rounded-md text-xs text-muted-foreground px-2 h-8 font-mono font-bold shrink-0">
                {draft.url.startsWith('wss') ? 'WSS' : 'WS'}
              </div>
              <Input
                className="flex-1 text-xs font-mono"
                placeholder="ws://localhost:8080/path"
                value={draft.url}
                onChange={(e) => updateDraft({ url: e.target.value })}
                disabled={isConnected || isConnecting}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isConnected && !isConnecting) connect(); }}
              />
              {isConnected || isConnecting ? (
                <Button variant="destructive" size="default" className="shrink-0" onClick={disconnect} disabled={isConnecting}>
                  {isConnecting
                    ? <><Loader2 className="animate-spin" /> Connecting</>
                    : <><WifiOff /> Disconnect</>}
                </Button>
              ) : (
                <Button size="default" className="shrink-0" onClick={connect}>
                  <Wifi /> Connect
                </Button>
              )}
            </div>

            {/* Collapsible config */}
            <div className="border-b border-border">
              <button
                className="flex items-center gap-1 px-3 py-1 text-xs text-muted-foreground hover:text-foreground w-full text-left"
                onClick={() => setConfigOpen(o => !o)}
              >
                <ChevronDown className={cn('size-3 transition-transform', configOpen && 'rotate-180')} />
                Configuration
                {draft.headers.filter(h => h.enabled && h.key).length > 0 && (
                  <span className="ml-1 text-[10px]">
                    ({draft.headers.filter(h => h.enabled && h.key).length} headers)
                  </span>
                )}
                {draft.subprotocol && (
                  <span className="ml-1 text-[10px] font-mono">{draft.subprotocol}</span>
                )}
              </button>
              {configOpen && (
                <div className="px-3 pb-3">
                  <div className="flex gap-3 border-b border-border mb-2">
                    {(['headers', 'options'] as const).map(tab => (
                      <button key={tab} onClick={() => setConfigTab(tab)}
                        className={cn('pb-1 text-xs capitalize border-b-2 -mb-px transition-colors',
                          configTab === tab
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground')}>
                        {tab}
                      </button>
                    ))}
                  </div>

                  {configTab === 'headers' && (
                    <div className="space-y-1">
                      {draft.headers.map((h, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <input type="checkbox" checked={h.enabled}
                            onChange={(e) => {
                              const headers = draft.headers.map((hh, ii) =>
                                ii === i ? { ...hh, enabled: e.target.checked } : hh);
                              updateDraft({ headers });
                            }}
                            className="h-3 w-3 shrink-0 accent-primary" />
                          <Input className="flex-1 h-6 text-xs font-mono" placeholder="Key"
                            value={h.key}
                            onChange={(e) => {
                              const headers = draft.headers.map((hh, ii) =>
                                ii === i ? { ...hh, key: e.target.value } : hh);
                              updateDraft({ headers });
                            }} />
                          <Input className="flex-1 h-6 text-xs font-mono" placeholder="Value"
                            value={h.value}
                            onChange={(e) => {
                              const headers = draft.headers.map((hh, ii) =>
                                ii === i ? { ...hh, value: e.target.value } : hh);
                              updateDraft({ headers });
                            }} />
                          <Button variant="ghost" size="icon-xs"
                            onClick={() => updateDraft({ headers: draft.headers.filter((_, ii) => ii !== i) })}>
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                      <Button variant="ghost" size="xs" className="mt-1"
                        onClick={() => updateDraft({ headers: [...draft.headers, { key: '', value: '', enabled: true }] })}>
                        <Plus /> Add Header
                      </Button>
                    </div>
                  )}

                  {configTab === 'options' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-32 shrink-0">Subprotocol</label>
                        <Input className="flex-1 h-6 text-xs font-mono" placeholder="e.g. chat, mqtt"
                          value={draft.subprotocol}
                          onChange={(e) => updateDraft({ subprotocol: e.target.value })} />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-32 shrink-0">Auto-reconnect</label>
                        <input type="checkbox" checked={draft.autoReconnect}
                          onChange={(e) => updateDraft({ autoReconnect: e.target.checked })}
                          className="h-3 w-3 accent-primary" />
                      </div>
                      {draft.autoReconnect && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground w-32 shrink-0">Reconnect delay</label>
                          <div className="flex items-center gap-1">
                            <Input className="w-20 h-6 text-xs font-mono" type="number"
                              min={500} max={30000}
                              value={draft.reconnectDelay}
                              onChange={(e) => updateDraft({ reconnectDelay: parseInt(e.target.value) || 2000 })} />
                            <span className="text-xs text-muted-foreground">ms</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
              <StatusBadge status={selectedStatus.status} error={selectedStatus.error} />
              {isConnected && uptime && (
                <span className="text-xs text-muted-foreground">{uptime}</span>
              )}
              {selectedStatus.latency != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="size-3 shrink-0" /> {selectedStatus.latency}ms
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {isConnected && (
                  <Button variant="ghost" size="xs" onClick={sendPing} title="Send WebSocket ping frame">
                    <Activity className="size-3" /> Ping
                  </Button>
                )}
                <Button variant="ghost" size="xs" onClick={clearLog} title="Clear message log">
                  <RefreshCw className="size-3" /> Clear
                </Button>
              </div>
            </div>

            {/* All MessageLogs mounted — only selected one visible via CSS.
                This preserves message history when switching connections. */}
            {profiles.map(profile => (
              <div
                key={profile.id}
                className={cn(
                  'flex flex-col flex-1 min-h-0',
                  selectedId !== profile.id && 'hidden',
                )}
              >
                <MessageLog
                  connId={profile.id}
                  isConnected={liveStatuses[profile.id]?.status === 'connected'}
                  clearToken={clearTokens[profile.id] ?? 0}
                />
              </div>
            ))}

            {/* Memoized composer — only re-renders when connection status or templates change */}
            <MessageComposer
              isConnected={isConnected}
              templates={templates}
              onSend={handleSend}
              onSaveTemplate={handleSaveTemplate}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: WsStatus }) {
  return (
    <div className={cn(
      'size-2 rounded-full shrink-0',
      status === 'connected' && 'bg-green-400',
      status === 'connecting' && 'bg-yellow-400 animate-pulse',
      status === 'error' && 'bg-red-400',
      (status === 'idle' || status === 'disconnected') && 'bg-muted-foreground/40',
    )} />
  );
}

function StatusBadge({ status, error }: { status: WsStatus; error: string | null }) {
  const label =
    status === 'idle' ? 'Idle' :
    status === 'connecting' ? 'Connecting...' :
    status === 'connected' ? 'Connected' :
    status === 'disconnected' ? 'Disconnected' :
    `Error${error ? ': ' + error : ''}`;

  return (
    <div className="flex items-center gap-1.5">
      <StatusDot status={status} />
      <span className={cn(
        'text-xs',
        status === 'connected' && 'text-green-400',
        status === 'connecting' && 'text-yellow-400',
        status === 'error' && 'text-red-400',
        (status === 'idle' || status === 'disconnected') && 'text-muted-foreground',
      )}>
        {label}
      </span>
    </div>
  );
}
