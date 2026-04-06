import { ipcMain, app, dialog, type BrowserWindow } from "electron";
import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import type {
  MockServerConfig,
  MockRoute,
  MockServerState,
  MockRequestLog,
  MockHeader,
  MockWsClient,
  MockWsMessage,
} from "../../shared/mock-server-types";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function getConfigsPath(): string {
  return path.join(app.getPath("userData"), "mock-server-configs.json");
}

async function readConfigs(): Promise<MockServerConfig[]> {
  try {
    return JSON.parse(await fsp.readFile(getConfigsPath(), "utf-8"));
  } catch {
    return [];
  }
}

async function writeConfigs(configs: MockServerConfig[]): Promise<void> {
  await fsp.writeFile(getConfigsPath(), JSON.stringify(configs, null, 2));
}

// ---------------------------------------------------------------------------
// Running servers
// ---------------------------------------------------------------------------

type WsClientEntry = {
  ws: WebSocket;
  clientId: string;
  endpointId: string;
  connectedAt: number;
  remoteAddress: string;
};

type RunningServer = {
  server: http.Server;
  wss: WebSocketServer;
  state: MockServerState;
  config: MockServerConfig;
  wsClients: Map<string, WsClientEntry>;
};

const servers = new Map<string, RunningServer>();
const MAX_LOG_ENTRIES = 200;
const MAX_WS_MESSAGES = 200;

let mainWindow: BrowserWindow | null = null;

function pushState(configId: string): void {
  const entry = servers.get(configId);
  if (!entry || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("mock-server:state-changed", entry.state);
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

/**
 * Match a request path against a route pattern that supports :param segments.
 * Returns null on no match, or a Record of captured params on match.
 */
function matchPath(
  pattern: string,
  requestPath: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const requestParts = requestPath.split("/").filter(Boolean);

  if (patternParts.length !== requestParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = requestParts[i];
    } else if (patternParts[i] !== requestParts[i]) {
      return null;
    }
  }
  return params;
}

function findMatchingRoute(
  config: MockServerConfig,
  method: string,
  pathname: string,
): MockRoute | null {
  return (
    config.routes.find((r) => {
      if (!r.enabled) return false;
      if (r.method !== method) return false;
      return matchPath(r.path, pathname) !== null;
    }) ?? null
  );
}

/**
 * Check a single rule condition against the request.
 */
function ruleMatches(
  rule: MockRoute["rules"][number],
  bodyStr: string,
  headers: Record<string, string>,
  query: Record<string, string>,
): boolean {
  const c = rule.condition;
  if (c.bodyContains && !bodyStr.includes(c.bodyContains)) return false;
  if (c.headerMatch) {
    const headerVal = headers[c.headerMatch.key.toLowerCase()];
    if (headerVal !== c.headerMatch.value) return false;
  }
  if (c.queryMatch) {
    if (query[c.queryMatch.key] !== c.queryMatch.value) return false;
  }
  return true;
}

function headersToObject(
  raw: http.IncomingHttpHeaders,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
  }
  return out;
}

function mockHeadersToEntries(headers: MockHeader[]): [string, string][] {
  return headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h) => [h.key, h.value]);
}

// ---------------------------------------------------------------------------
// Template variable processing
// ---------------------------------------------------------------------------

/**
 * Process template variables in a response body string.
 *
 * Supported variables:
 *   {{params.name}}    — URL path parameter (e.g. :id)
 *   {{query.name}}     — Query string parameter
 *   {{header.name}}    — Request header value
 *   {{body}}           — Raw request body
 *   {{body.key}}       — JSON-parsed request body field (dot notation)
 *   {{now}}            — ISO 8601 timestamp
 *   {{timestamp}}      — Unix timestamp in ms
 *   {{randomUUID}}     — Random UUID v4
 *   {{randomInt min max}} — Random integer in [min, max]
 */
function processTemplate(
  template: string,
  ctx: {
    params: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: string;
  },
): string {
  let parsedBody: unknown = undefined;
  function getBody(): unknown {
    if (parsedBody === undefined) {
      try {
        parsedBody = JSON.parse(ctx.body);
      } catch {
        parsedBody = null;
      }
    }
    return parsedBody;
  }

  return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();

    if (trimmed === "now") return new Date().toISOString();
    if (trimmed === "timestamp") return String(Date.now());
    if (trimmed === "randomUUID") return crypto.randomUUID();
    if (trimmed === "body") return ctx.body;

    if (trimmed.startsWith("randomInt")) {
      const parts = trimmed.split(/\s+/);
      const min = parseInt(parts[1], 10) || 0;
      const max = parseInt(parts[2], 10) || 100;
      return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    if (trimmed.startsWith("params.")) {
      const key = trimmed.slice(7);
      return ctx.params[key] ?? "";
    }

    if (trimmed.startsWith("query.")) {
      const key = trimmed.slice(6);
      return ctx.query[key] ?? "";
    }

    if (trimmed.startsWith("header.")) {
      const key = trimmed.slice(7).toLowerCase();
      return ctx.headers[key] ?? "";
    }

    if (trimmed.startsWith("body.")) {
      const path = trimmed.slice(5).split(".");
      let val: unknown = getBody();
      for (const seg of path) {
        if (val == null || typeof val !== "object") return "";
        val = (val as Record<string, unknown>)[seg];
      }
      if (val === undefined || val === null) return "";
      return typeof val === "string" ? val : JSON.stringify(val);
    }

    return _match; // Leave unknown variables untouched
  });
}

// ---------------------------------------------------------------------------
// Proxy fallback
// ---------------------------------------------------------------------------

async function proxyRequest(
  baseUrl: string,
  req: http.IncomingMessage,
  bodyStr: string,
  pathname: string,
  searchParams: string,
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string>;
}> {
  const targetUrl = `${baseUrl.replace(/\/+$/, "")}${pathname}${searchParams ? `?${searchParams}` : ""}`;

  const url = new URL(targetUrl);
  const isHttps = url.protocol === "https:";
  const mod = isHttps ? await import("node:https") : await import("node:http");

  const fwdHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === "host" || k === "connection") continue;
    fwdHeaders[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
  }

  return new Promise((resolve, reject) => {
    const proxyReq = mod.request(
      targetUrl,
      {
        method: req.method,
        headers: fwdHeaders,
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", () => {
          const resHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            resHeaders[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
          }
          resolve({
            status: proxyRes.statusCode ?? 502,
            body: Buffer.concat(chunks).toString("utf-8"),
            headers: resHeaders,
          });
        });
      },
    );
    proxyReq.on("error", reject);
    if (bodyStr) proxyReq.write(bodyStr);
    proxyReq.end();
  });
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

function createMockServer(config: MockServerConfig): http.Server {
  const server = http.createServer(async (req, res) => {
    const entry = servers.get(config.id);
    if (!entry) {
      res.writeHead(500).end();
      return;
    }

    const startTime = Date.now();
    const urlObj = new URL(req.url ?? "/", `http://localhost:${config.port}`);
    const pathname = urlObj.pathname;
    const query: Record<string, string> = {};
    urlObj.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    const reqHeaders = headersToObject(req.headers);

    // Collect body
    const bodyChunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      req.on("data", (chunk) => bodyChunks.push(chunk));
      req.on("end", resolve);
    });
    const bodyStr = Buffer.concat(bodyChunks).toString("utf-8");

    // CORS preflight
    if (config.corsOrigin) {
      res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        req.headers["access-control-request-headers"] ?? "*",
      );
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
    }

    const route = findMatchingRoute(
      entry.config,
      req.method ?? "GET",
      pathname,
    );

    let responseStatus: number;
    let responseBody: string;
    let responseHeaders: MockHeader[];
    let matchedRuleIndex: number | null = null;
    let delay = 0;
    let proxied = false;

    if (route) {
      // Extract URL params for template processing
      const params = matchPath(route.path, pathname) ?? {};

      // Check conditional rules first
      let matched = false;
      for (let i = 0; i < route.rules.length; i++) {
        if (ruleMatches(route.rules[i], bodyStr, reqHeaders, query)) {
          responseStatus = route.rules[i].status;
          responseBody = route.rules[i].body;
          responseHeaders = route.rules[i].headers;
          delay = route.rules[i].delay;
          matchedRuleIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) {
        responseStatus = route.status;
        responseBody = route.body;
        responseHeaders = route.headers;
        delay = route.delay;
        matchedRuleIndex = -1; // default response
      }

      // Process template variables in response body
      responseBody = processTemplate(responseBody!, {
        params,
        query,
        headers: reqHeaders,
        body: bodyStr,
      });
    } else if (entry.config.proxyBaseUrl) {
      // No route matched — proxy to real backend
      try {
        const proxyResult = await proxyRequest(
          entry.config.proxyBaseUrl,
          req,
          bodyStr,
          pathname,
          urlObj.search.slice(1),
        );
        responseStatus = proxyResult.status;
        responseBody = proxyResult.body;
        responseHeaders = [];
        proxied = true;
        matchedRuleIndex = null;

        // Write proxy response headers directly
        for (const [k, v] of Object.entries(proxyResult.headers)) {
          if (k === "transfer-encoding") continue; // we buffer the body
          res.setHeader(k, v);
        }
      } catch (err) {
        responseStatus = 502;
        responseBody = JSON.stringify({
          error: "Proxy error",
          message: err instanceof Error ? err.message : String(err),
        });
        responseHeaders = [
          { key: "Content-Type", value: "application/json", enabled: true },
        ];
        proxied = true;
        matchedRuleIndex = null;
      }
    } else {
      responseStatus = 404;
      responseBody = JSON.stringify({
        error: "Not found",
        path: pathname,
        method: req.method,
      });
      responseHeaders = [
        { key: "Content-Type", value: "application/json", enabled: true },
      ];
      matchedRuleIndex = null;
    }

    // Apply artificial delay
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    // Write response (skip setting headers for proxied responses — already set above)
    if (!proxied) {
      for (const [k, v] of mockHeadersToEntries(responseHeaders!)) {
        res.setHeader(k, v);
      }
    }
    res.writeHead(responseStatus!);
    res.end(responseBody!);

    const duration = Date.now() - startTime;

    // Log
    const logEntry: MockRequestLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      method: req.method ?? "GET",
      path: pathname,
      query,
      headers: reqHeaders,
      body: bodyStr,
      matchedRouteId: route?.id ?? null,
      matchedRuleIndex,
      responseStatus: responseStatus!,
      responseBody: responseBody!,
      duration,
      proxied,
    };

    entry.state.requestCount++;
    entry.state.recentRequests.unshift(logEntry);
    if (entry.state.recentRequests.length > MAX_LOG_ENTRIES) {
      entry.state.recentRequests = entry.state.recentRequests.slice(
        0,
        MAX_LOG_ENTRIES,
      );
    }

    pushState(config.id);
  });

  return server;
}

function setupWsUpgrade(entry: RunningServer): void {
  entry.server.on("upgrade", (req, socket, head) => {
    const urlObj = new URL(req.url ?? "/", `http://localhost`);
    const pathname = urlObj.pathname;

    // Find a matching WS endpoint
    const endpoint = entry.config.wsEndpoints?.find(
      (ep) => ep.enabled && ep.path === pathname,
    );

    if (!endpoint) {
      socket.destroy();
      return;
    }

    entry.wss.handleUpgrade(req, socket, head, (ws) => {
      const clientId = crypto.randomUUID();
      const remoteAddress = req.socket.remoteAddress ?? "unknown";

      const clientEntry: WsClientEntry = {
        ws,
        clientId,
        endpointId: endpoint.id,
        connectedAt: Date.now(),
        remoteAddress,
      };
      entry.wsClients.set(clientId, clientEntry);

      // Update state
      entry.state.wsClients = buildWsClientList(entry);
      pushState(entry.config.id);

      ws.on("message", (data) => {
        const payload =
          typeof data === "string"
            ? data
            : Buffer.isBuffer(data)
              ? data.toString("utf-8")
              : Buffer.from(data as ArrayBuffer).toString("utf-8");

        const msg: MockWsMessage = {
          id: crypto.randomUUID(),
          endpointId: endpoint.id,
          clientId,
          direction: "received",
          payload,
          timestamp: Date.now(),
        };

        entry.state.wsMessages.unshift(msg);
        if (entry.state.wsMessages.length > MAX_WS_MESSAGES) {
          entry.state.wsMessages = entry.state.wsMessages.slice(
            0,
            MAX_WS_MESSAGES,
          );
        }
        pushState(entry.config.id);
      });

      ws.on("close", () => {
        entry.wsClients.delete(clientId);
        entry.state.wsClients = buildWsClientList(entry);
        pushState(entry.config.id);
      });

      ws.on("error", () => {
        entry.wsClients.delete(clientId);
        entry.state.wsClients = buildWsClientList(entry);
        pushState(entry.config.id);
      });
    });
  });
}

function buildWsClientList(entry: RunningServer): MockWsClient[] {
  return Array.from(entry.wsClients.values()).map((c) => ({
    id: c.clientId,
    endpointId: c.endpointId,
    connectedAt: c.connectedAt,
    remoteAddress: c.remoteAddress,
  }));
}

function startServer(config: MockServerConfig): Promise<MockServerState> {
  return new Promise((resolve) => {
    // Stop any existing server for this config
    const existing = servers.get(config.id);
    if (existing) {
      existing.wss.close();
      existing.server.close();
      servers.delete(config.id);
    }

    const state: MockServerState = {
      configId: config.id,
      status: "starting",
      requestCount: 0,
      recentRequests: [],
      wsClients: [],
      wsMessages: [],
    };

    const server = createMockServer(config);
    const wss = new WebSocketServer({ noServer: true });
    const wsClients = new Map<string, WsClientEntry>();

    const entry: RunningServer = { server, wss, state, config, wsClients };

    setupWsUpgrade(entry);

    server.on("error", (err: NodeJS.ErrnoException) => {
      state.status = "error";
      state.error =
        err.code === "EADDRINUSE"
          ? `Port ${config.port} is already in use`
          : err.message;
      servers.set(config.id, entry);
      pushState(config.id);
      resolve(state);
    });

    server.listen(config.port, "127.0.0.1", () => {
      state.status = "running";
      servers.set(config.id, entry);
      pushState(config.id);
      resolve(state);
    });
  });
}

function stopServer(configId: string): MockServerState | null {
  const entry = servers.get(configId);
  if (!entry) return null;

  // Close all WebSocket clients
  for (const [, client] of entry.wsClients) {
    try {
      client.ws.close(1001, "Server stopped");
    } catch {
      /* ignore */
    }
  }
  entry.wsClients.clear();
  entry.wss.close();
  entry.server.close();
  entry.state.status = "stopped";
  entry.state.wsClients = [];
  const finalState = { ...entry.state };
  servers.delete(configId);
  return finalState;
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerMockServerIpc(win?: BrowserWindow): void {
  // --- Config CRUD ---

  ipcMain.handle("mock-server:configs:list", async () => {
    return readConfigs();
  });

  ipcMain.handle(
    "mock-server:configs:save",
    async (_event, config: MockServerConfig) => {
      const configs = await readConfigs();
      const idx = configs.findIndex((c) => c.id === config.id);
      if (idx !== -1) {
        configs[idx] = config;
      } else {
        configs.push(config);
      }
      await writeConfigs(configs);

      // Hot-reload: if this server is running, update its config in-memory
      const running = servers.get(config.id);
      if (running) {
        running.config = config;
      }

      return config;
    },
  );

  ipcMain.handle(
    "mock-server:configs:delete",
    async (_event, configId: string) => {
      stopServer(configId);
      await writeConfigs(
        (await readConfigs()).filter((c) => c.id !== configId),
      );
    },
  );

  // --- Server lifecycle ---

  ipcMain.handle("mock-server:start", async (_event, configId: string) => {
    const configs = await readConfigs();
    const config = configs.find((c) => c.id === configId);
    if (!config)
      return {
        configId,
        status: "error",
        error: "Config not found",
        requestCount: 0,
        recentRequests: [],
        wsClients: [],
        wsMessages: [],
      };
    return startServer(config);
  });

  ipcMain.handle("mock-server:stop", (_event, configId: string) => {
    return (
      stopServer(configId) ?? {
        configId,
        status: "stopped",
        requestCount: 0,
        recentRequests: [],
        wsClients: [],
        wsMessages: [],
      }
    );
  });

  ipcMain.handle("mock-server:state", (_event, configId: string) => {
    const entry = servers.get(configId);
    if (!entry)
      return {
        configId,
        status: "stopped",
        requestCount: 0,
        recentRequests: [],
        wsClients: [],
        wsMessages: [],
      } as MockServerState;
    return entry.state;
  });

  ipcMain.handle("mock-server:clear-log", (_event, configId: string) => {
    const entry = servers.get(configId);
    if (entry) {
      entry.state.recentRequests = [];
      entry.state.requestCount = 0;
      pushState(configId);
    }
  });

  // --- WebSocket ---

  ipcMain.handle(
    "mock-server:ws:send",
    (_event, configId: string, clientId: string, payload: string) => {
      const entry = servers.get(configId);
      if (!entry) return { error: "Server not running" };
      const client = entry.wsClients.get(clientId);
      if (!client) return { error: "Client not found" };
      try {
        client.ws.send(payload);
        const msg: MockWsMessage = {
          id: crypto.randomUUID(),
          endpointId: client.endpointId,
          clientId,
          direction: "sent",
          payload,
          timestamp: Date.now(),
        };
        entry.state.wsMessages.unshift(msg);
        if (entry.state.wsMessages.length > MAX_WS_MESSAGES) {
          entry.state.wsMessages = entry.state.wsMessages.slice(
            0,
            MAX_WS_MESSAGES,
          );
        }
        pushState(configId);
        return { success: true };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "mock-server:ws:broadcast",
    (_event, configId: string, endpointId: string, payload: string) => {
      const entry = servers.get(configId);
      if (!entry) return { error: "Server not running" };
      let sent = 0;
      for (const [, client] of entry.wsClients) {
        if (
          client.endpointId === endpointId &&
          client.ws.readyState === WebSocket.OPEN
        ) {
          try {
            client.ws.send(payload);
            sent++;
          } catch {
            /* ignore dead clients */
          }
        }
      }
      if (sent > 0) {
        const msg: MockWsMessage = {
          id: crypto.randomUUID(),
          endpointId,
          clientId: "*",
          direction: "broadcast",
          payload,
          timestamp: Date.now(),
        };
        entry.state.wsMessages.unshift(msg);
        if (entry.state.wsMessages.length > MAX_WS_MESSAGES) {
          entry.state.wsMessages = entry.state.wsMessages.slice(
            0,
            MAX_WS_MESSAGES,
          );
        }
        pushState(configId);
      }
      return { sent };
    },
  );

  ipcMain.handle(
    "mock-server:ws:disconnect-client",
    (_event, configId: string, clientId: string) => {
      const entry = servers.get(configId);
      if (!entry) return;
      const client = entry.wsClients.get(clientId);
      if (client) {
        try {
          client.ws.close(1000, "Disconnected by server");
        } catch {
          /* ignore */
        }
        entry.wsClients.delete(clientId);
        entry.state.wsClients = buildWsClientList(entry);
        pushState(configId);
      }
    },
  );

  ipcMain.handle("mock-server:clear-ws-log", (_event, configId: string) => {
    const entry = servers.get(configId);
    if (entry) {
      entry.state.wsMessages = [];
      pushState(configId);
    }
  });

  // --- Import / Export ---

  ipcMain.handle("mock-server:export", async (_event, configId: string) => {
    const configs = await readConfigs();
    const config = configs.find((c) => c.id === configId);
    if (!config) return { error: "Config not found" };

    const result = await dialog.showSaveDialog({
      title: "Export Mock Server",
      defaultPath: `${config.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.mock.json`,
      filters: [
        { name: "Mock Server Config", extensions: ["mock.json", "json"] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    await fsp.writeFile(result.filePath, JSON.stringify(config, null, 2));
    return { success: true, path: result.filePath };
  });

  ipcMain.handle("mock-server:import", async () => {
    const result = await dialog.showOpenDialog({
      title: "Import Mock Server",
      filters: [
        { name: "Mock Server Config", extensions: ["mock.json", "json"] },
      ],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0)
      return { canceled: true };

    try {
      const raw = await fsp.readFile(result.filePaths[0], "utf-8");
      const imported = JSON.parse(raw) as MockServerConfig;

      // Give it a fresh ID so it doesn't clash with existing configs
      imported.id = crypto.randomUUID();
      imported.name = `${imported.name} (imported)`;

      // Also regenerate route and WS endpoint IDs
      for (const route of imported.routes ?? []) {
        route.id = crypto.randomUUID();
      }
      for (const ep of imported.wsEndpoints ?? []) {
        ep.id = crypto.randomUUID();
      }

      const configs = await readConfigs();
      configs.push(imported);
      await writeConfigs(configs);

      return { success: true, config: imported };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}

export function registerMockServerPush(win: BrowserWindow): void {
  mainWindow = win;
}

export function stopAllMockServers(): void {
  for (const [id] of servers) {
    stopServer(id);
  }
}
