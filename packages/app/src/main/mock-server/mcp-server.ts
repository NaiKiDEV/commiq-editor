import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type Server } from "http";
import { z } from "zod/v3";
import type {
  MockServerConfig,
  MockRoute,
  MockResponseRule,
  MockHeader,
  MockHttpMethod,
  MockWsEndpoint,
} from "../../shared/mock-server-types";

// ---------------------------------------------------------------------------
// The MCP server reads/writes configs through these callbacks so it stays
// decoupled from the Electron IPC layer.  The callbacks are injected once
// from the IPC registration module.
// ---------------------------------------------------------------------------

export type MockServerMcpBridge = {
  listConfigs: () => Promise<MockServerConfig[]>;
  saveConfig: (config: MockServerConfig) => Promise<MockServerConfig>;
  deleteConfig: (configId: string) => Promise<void>;
  startServer: (configId: string) => Promise<{ status: string; error?: string }>;
  stopServer: (configId: string) => Promise<{ status: string }>;
  getServerState: (configId: string) => Promise<{
    status: string;
    error?: string;
    requestCount: number;
    recentRequests: unknown[];
  }>;
};

let bridge: MockServerMcpBridge | null = null;

export function setMockServerMcpBridge(b: MockServerMcpBridge): void {
  bridge = b;
}

// ---------------------------------------------------------------------------
// Zod schemas for reusable validation
// ---------------------------------------------------------------------------

const headerSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().optional().default(true),
});

const ruleConditionSchema = z.object({
  bodyContains: z.string().optional(),
  headerMatch: z.object({ key: z.string(), value: z.string() }).optional(),
  queryMatch: z.object({ key: z.string(), value: z.string() }).optional(),
});

const ruleSchema = z.object({
  condition: ruleConditionSchema,
  status: z.number().int().min(100).max(599),
  headers: z.array(headerSchema).optional().default([]),
  body: z.string().optional().default(""),
  delay: z.number().int().min(0).optional().default(0),
});

const HTTP_METHODS: MockHttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

// ---------------------------------------------------------------------------
// Helper — find config + route by id
// ---------------------------------------------------------------------------

async function getConfig(configId: string): Promise<MockServerConfig | null> {
  if (!bridge) return null;
  const configs = await bridge.listConfigs();
  return configs.find((c) => c.id === configId) ?? null;
}

async function getConfigAndRoute(
  configId: string,
  routeId: string,
): Promise<{ config: MockServerConfig; route: MockRoute; routeIndex: number } | null> {
  const config = await getConfig(configId);
  if (!config) return null;
  const routeIndex = config.routes.findIndex((r) => r.id === routeId);
  if (routeIndex === -1) return null;
  return { config, route: config.routes[routeIndex], routeIndex };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function ok(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// MCP server factory
// ---------------------------------------------------------------------------

function createConfiguredMcpServer(): McpServer {
  const mcp = new McpServer({
    name: "commiq-mock-server",
    version: "1.0.0",
  });

  // =========================================================================
  // CONFIG tools
  // =========================================================================

  mcp.tool(
    "list_configs",
    "List all mock server configurations with their routes and settings",
    {},
    async () => {
      if (!bridge) return err("Bridge not initialised");
      const configs = await bridge.listConfigs();
      const summary = configs.map((c) => ({
        id: c.id,
        name: c.name,
        port: c.port,
        corsOrigin: c.corsOrigin,
        proxyBaseUrl: c.proxyBaseUrl,
        routes: c.routes.length,
        wsEndpoints: c.wsEndpoints?.length ?? 0,
      }));
      return ok(summary);
    },
  );

  mcp.tool(
    "get_config",
    "Get full mock server configuration including all routes, rules and WS endpoints",
    { configId: z.string() },
    async ({ configId }) => {
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      return ok(config);
    },
  );

  mcp.tool(
    "create_config",
    "Create a new mock server configuration",
    {
      name: z.string(),
      port: z.number().int().min(1).max(65535),
      corsOrigin: z.string().optional().default(""),
      proxyBaseUrl: z.string().optional().default(""),
    },
    async ({ name, port, corsOrigin, proxyBaseUrl }) => {
      if (!bridge) return err("Bridge not initialised");
      const config: MockServerConfig = {
        id: crypto.randomUUID(),
        name,
        port,
        corsOrigin: corsOrigin ?? "",
        proxyBaseUrl: proxyBaseUrl ?? "",
        routes: [],
        wsEndpoints: [],
      };
      const saved = await bridge.saveConfig(config);
      return ok(saved);
    },
  );

  mcp.tool(
    "update_config",
    "Update mock server configuration settings (name, port, CORS, proxy). Does not modify routes.",
    {
      configId: z.string(),
      name: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      corsOrigin: z.string().optional(),
      proxyBaseUrl: z.string().optional(),
    },
    async ({ configId, ...patch }) => {
      if (!bridge) return err("Bridge not initialised");
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      if (patch.name !== undefined) config.name = patch.name;
      if (patch.port !== undefined) config.port = patch.port;
      if (patch.corsOrigin !== undefined) config.corsOrigin = patch.corsOrigin;
      if (patch.proxyBaseUrl !== undefined) config.proxyBaseUrl = patch.proxyBaseUrl;
      const saved = await bridge.saveConfig(config);
      return ok(saved);
    },
  );

  mcp.tool(
    "delete_config",
    "Delete a mock server configuration and stop its server if running",
    { configId: z.string() },
    async ({ configId }) => {
      if (!bridge) return err("Bridge not initialised");
      await bridge.deleteConfig(configId);
      return ok("Deleted");
    },
  );

  // =========================================================================
  // ROUTE tools
  // =========================================================================

  mcp.tool(
    "list_routes",
    "List all routes for a mock server configuration",
    { configId: z.string() },
    async ({ configId }) => {
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      const summary = config.routes.map((r) => ({
        id: r.id,
        method: r.method,
        path: r.path,
        name: r.name,
        enabled: r.enabled,
        status: r.status,
        delay: r.delay,
        rulesCount: r.rules.length,
      }));
      return ok(summary);
    },
  );

  mcp.tool(
    "get_route",
    "Get full details of a specific route including its response body, headers and rules",
    { configId: z.string(), routeId: z.string() },
    async ({ configId, routeId }) => {
      const found = await getConfigAndRoute(configId, routeId);
      if (!found) return err("Config or route not found");
      return ok(found.route);
    },
  );

  mcp.tool(
    "create_route",
    "Create a new route (endpoint) on a mock server. The route will return the specified status/body when its method+path matches an incoming request. Supports template variables like {{params.id}}, {{query.name}}, {{body.field}}, {{randomUUID}}, {{now}}, {{randomInt min max}} in the response body.",
    {
      configId: z.string(),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
      path: z.string().describe("URL path pattern, e.g. /api/users/:id"),
      name: z.string().optional().default(""),
      enabled: z.boolean().optional().default(true),
      status: z.number().int().min(100).max(599).optional().default(200),
      headers: z.array(headerSchema).optional(),
      body: z.string().optional().default(""),
      delay: z.number().int().min(0).optional().default(0),
    },
    async ({ configId, method, path, name, enabled, status, headers, body, delay }) => {
      if (!bridge) return err("Bridge not initialised");
      const config = await getConfig(configId);
      if (!config) return err("Config not found");

      const route: MockRoute = {
        id: crypto.randomUUID(),
        method: method as MockHttpMethod,
        path,
        name: name ?? "",
        enabled: enabled ?? true,
        status: status ?? 200,
        headers: (headers as MockHeader[] | undefined) ?? [
          { key: "Content-Type", value: "application/json", enabled: true },
        ],
        body: body ?? "",
        delay: delay ?? 0,
        rules: [],
      };
      config.routes.push(route);
      await bridge.saveConfig(config);
      return ok(route);
    },
  );

  mcp.tool(
    "update_route",
    "Update an existing route's properties (method, path, status, body, headers, delay, enabled)",
    {
      configId: z.string(),
      routeId: z.string(),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
      path: z.string().optional(),
      name: z.string().optional(),
      enabled: z.boolean().optional(),
      status: z.number().int().min(100).max(599).optional(),
      headers: z.array(headerSchema).optional(),
      body: z.string().optional(),
      delay: z.number().int().min(0).optional(),
    },
    async ({ configId, routeId, ...patch }) => {
      if (!bridge) return err("Bridge not initialised");
      const found = await getConfigAndRoute(configId, routeId);
      if (!found) return err("Config or route not found");
      const { config, route } = found;
      if (patch.method !== undefined) route.method = patch.method as MockHttpMethod;
      if (patch.path !== undefined) route.path = patch.path;
      if (patch.name !== undefined) route.name = patch.name;
      if (patch.enabled !== undefined) route.enabled = patch.enabled;
      if (patch.status !== undefined) route.status = patch.status;
      if (patch.headers !== undefined) route.headers = patch.headers as MockHeader[];
      if (patch.body !== undefined) route.body = patch.body;
      if (patch.delay !== undefined) route.delay = patch.delay;
      await bridge.saveConfig(config);
      return ok(route);
    },
  );

  mcp.tool(
    "delete_route",
    "Delete a route from a mock server configuration",
    { configId: z.string(), routeId: z.string() },
    async ({ configId, routeId }) => {
      if (!bridge) return err("Bridge not initialised");
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      const before = config.routes.length;
      config.routes = config.routes.filter((r) => r.id !== routeId);
      if (config.routes.length === before) return err("Route not found");
      await bridge.saveConfig(config);
      return ok("Deleted");
    },
  );

  // =========================================================================
  // RULE tools (conditional response rules within a route)
  // =========================================================================

  mcp.tool(
    "add_rule",
    "Add a conditional response rule to a route. Rules are evaluated in order — first matching rule wins. If no rule matches, the route's default response is used. Conditions can match on request body content, headers, or query params.",
    {
      configId: z.string(),
      routeId: z.string(),
      condition: ruleConditionSchema,
      status: z.number().int().min(100).max(599),
      headers: z.array(headerSchema).optional().default([]),
      body: z.string().optional().default(""),
      delay: z.number().int().min(0).optional().default(0),
    },
    async ({ configId, routeId, condition, status, headers, body, delay }) => {
      if (!bridge) return err("Bridge not initialised");
      const found = await getConfigAndRoute(configId, routeId);
      if (!found) return err("Config or route not found");
      const { config, route } = found;
      const rule: MockResponseRule = {
        condition,
        status,
        headers: (headers as MockHeader[]) ?? [],
        body: body ?? "",
        delay: delay ?? 0,
      };
      route.rules.push(rule);
      await bridge.saveConfig(config);
      return ok({ ruleIndex: route.rules.length - 1, rule });
    },
  );

  mcp.tool(
    "update_rule",
    "Update a conditional response rule at a given index within a route",
    {
      configId: z.string(),
      routeId: z.string(),
      ruleIndex: z.number().int().min(0),
      condition: ruleConditionSchema.optional(),
      status: z.number().int().min(100).max(599).optional(),
      headers: z.array(headerSchema).optional(),
      body: z.string().optional(),
      delay: z.number().int().min(0).optional(),
    },
    async ({ configId, routeId, ruleIndex, ...patch }) => {
      if (!bridge) return err("Bridge not initialised");
      const found = await getConfigAndRoute(configId, routeId);
      if (!found) return err("Config or route not found");
      const { config, route } = found;
      if (ruleIndex >= route.rules.length) return err("Rule index out of range");
      const rule = route.rules[ruleIndex];
      if (patch.condition !== undefined) rule.condition = patch.condition;
      if (patch.status !== undefined) rule.status = patch.status;
      if (patch.headers !== undefined) rule.headers = patch.headers as MockHeader[];
      if (patch.body !== undefined) rule.body = patch.body;
      if (patch.delay !== undefined) rule.delay = patch.delay;
      await bridge.saveConfig(config);
      return ok({ ruleIndex, rule });
    },
  );

  mcp.tool(
    "delete_rule",
    "Delete a conditional response rule at a given index from a route",
    {
      configId: z.string(),
      routeId: z.string(),
      ruleIndex: z.number().int().min(0),
    },
    async ({ configId, routeId, ruleIndex }) => {
      if (!bridge) return err("Bridge not initialised");
      const found = await getConfigAndRoute(configId, routeId);
      if (!found) return err("Config or route not found");
      const { config, route } = found;
      if (ruleIndex >= route.rules.length) return err("Rule index out of range");
      route.rules.splice(ruleIndex, 1);
      await bridge.saveConfig(config);
      return ok("Deleted");
    },
  );

  // =========================================================================
  // WS ENDPOINT tools
  // =========================================================================

  mcp.tool(
    "list_ws_endpoints",
    "List WebSocket endpoints for a mock server configuration",
    { configId: z.string() },
    async ({ configId }) => {
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      return ok(config.wsEndpoints ?? []);
    },
  );

  mcp.tool(
    "create_ws_endpoint",
    "Add a WebSocket endpoint to a mock server configuration",
    {
      configId: z.string(),
      path: z.string().describe("WebSocket path, e.g. /ws or /ws/chat"),
      name: z.string().optional().default(""),
      enabled: z.boolean().optional().default(true),
    },
    async ({ configId, path, name, enabled }) => {
      if (!bridge) return err("Bridge not initialised");
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      if (!config.wsEndpoints) config.wsEndpoints = [];
      const endpoint: MockWsEndpoint = {
        id: crypto.randomUUID(),
        path,
        name: name ?? "",
        enabled: enabled ?? true,
      };
      config.wsEndpoints.push(endpoint);
      await bridge.saveConfig(config);
      return ok(endpoint);
    },
  );

  mcp.tool(
    "update_ws_endpoint",
    "Update a WebSocket endpoint (path, name, enabled)",
    {
      configId: z.string(),
      endpointId: z.string(),
      path: z.string().optional(),
      name: z.string().optional(),
      enabled: z.boolean().optional(),
    },
    async ({ configId, endpointId, ...patch }) => {
      if (!bridge) return err("Bridge not initialised");
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      const ep = (config.wsEndpoints ?? []).find((e) => e.id === endpointId);
      if (!ep) return err("Endpoint not found");
      if (patch.path !== undefined) ep.path = patch.path;
      if (patch.name !== undefined) ep.name = patch.name;
      if (patch.enabled !== undefined) ep.enabled = patch.enabled;
      await bridge.saveConfig(config);
      return ok(ep);
    },
  );

  mcp.tool(
    "delete_ws_endpoint",
    "Delete a WebSocket endpoint from a mock server configuration",
    { configId: z.string(), endpointId: z.string() },
    async ({ configId, endpointId }) => {
      if (!bridge) return err("Bridge not initialised");
      const config = await getConfig(configId);
      if (!config) return err("Config not found");
      const before = (config.wsEndpoints ?? []).length;
      config.wsEndpoints = (config.wsEndpoints ?? []).filter((e) => e.id !== endpointId);
      if (config.wsEndpoints.length === before) return err("Endpoint not found");
      await bridge.saveConfig(config);
      return ok("Deleted");
    },
  );

  // =========================================================================
  // SERVER LIFECYCLE tools
  // =========================================================================

  mcp.tool(
    "start_server",
    "Start a mock server so it begins listening for HTTP requests on its configured port",
    { configId: z.string() },
    async ({ configId }) => {
      if (!bridge) return err("Bridge not initialised");
      const result = await bridge.startServer(configId);
      return result.status === "error" ? err(result.error ?? "Failed to start") : ok(result);
    },
  );

  mcp.tool(
    "stop_server",
    "Stop a running mock server",
    { configId: z.string() },
    async ({ configId }) => {
      if (!bridge) return err("Bridge not initialised");
      const result = await bridge.stopServer(configId);
      return ok(result);
    },
  );

  mcp.tool(
    "get_server_state",
    "Get runtime state of a mock server (status, request count, recent request log)",
    { configId: z.string() },
    async ({ configId }) => {
      if (!bridge) return err("Bridge not initialised");
      const state = await bridge.getServerState(configId);
      return ok(state);
    },
  );

  // =========================================================================
  // RESOURCES — read-only browseable views
  // =========================================================================

  mcp.resource(
    "all-configs",
    "mock://configs",
    {
      description: "List all mock server configurations with summary info",
    },
    async (uri) => {
      if (!bridge) return { contents: [{ uri: uri.href, text: "Bridge not initialised" }] };
      const configs = await bridge.listConfigs();
      const summary = configs.map((c) => ({
        id: c.id,
        name: c.name,
        port: c.port,
        routes: c.routes.length,
        wsEndpoints: c.wsEndpoints?.length ?? 0,
      }));
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(summary, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  mcp.resource(
    "config-routes",
    new ResourceTemplate("mock://{configId}/routes", {
      list: async () => {
        if (!bridge) return { resources: [] };
        const configs = await bridge.listConfigs();
        return {
          resources: configs.map((c) => ({
            uri: `mock://${c.id}/routes`,
            name: `${c.name} — Routes`,
          })),
        };
      },
    }),
    async (uri, { configId }) => {
      const config = await getConfig(configId as string);
      if (!config)
        return { contents: [{ uri: uri.href, text: "Config not found" }] };
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(config.routes, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  mcp.resource(
    "config-detail",
    new ResourceTemplate("mock://{configId}", {
      list: async () => {
        if (!bridge) return { resources: [] };
        const configs = await bridge.listConfigs();
        return {
          resources: configs.map((c) => ({
            uri: `mock://${c.id}`,
            name: c.name,
          })),
        };
      },
    }),
    async (uri, { configId }) => {
      const config = await getConfig(configId as string);
      if (!config)
        return { contents: [{ uri: uri.href, text: "Config not found" }] };
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(config, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  return mcp;
}

// ---------------------------------------------------------------------------
// HTTP server lifecycle (same dual-transport pattern as whiteboard)
// ---------------------------------------------------------------------------

let httpServer: Server | null = null;
const sessions = new Map<
  string,
  {
    transport: SSEServerTransport | StreamableHTTPServerTransport;
    server: McpServer;
  }
>();

export async function startMockServerMcp(
  port: number,
): Promise<{ success: boolean; error?: string }> {
  if (httpServer) return { success: false, error: "MCP server already running" };

  return new Promise((resolve) => {
    httpServer = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);

      // --- Streamable HTTP transport on /mcp ---
      if (url.pathname === "/mcp") {
        let parsedBody: unknown;
        if (req.method === "POST") {
          parsedBody = await new Promise<unknown>((r) => {
            let data = "";
            req.on("data", (chunk: Buffer) => {
              data += chunk.toString();
            });
            req.on("end", () => {
              try {
                r(JSON.parse(data));
              } catch {
                r(undefined);
              }
            });
          });
        }

        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        const existing = sessionId ? sessions.get(sessionId) : undefined;

        if (
          existing &&
          existing.transport instanceof StreamableHTTPServerTransport
        ) {
          await existing.transport.handleRequest(
            req as IncomingMessage & { auth?: undefined },
            res,
            parsedBody,
          );
        } else if (!sessionId && req.method === "POST") {
          const mcp = createConfiguredMcpServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          await mcp.connect(transport);
          await transport.handleRequest(
            req as IncomingMessage & { auth?: undefined },
            res,
            parsedBody,
          );
          if (transport.sessionId) {
            sessions.set(transport.sessionId, { transport, server: mcp });
            transport.onclose = () => {
              if (transport.sessionId) sessions.delete(transport.sessionId);
            };
          }
        } else if (req.method === "DELETE" && existing) {
          await existing.transport.close?.();
          if (sessionId) sessions.delete(sessionId);
          res.writeHead(200).end();
        } else {
          res.writeHead(400).end("Bad request");
        }
        return;
      }

      // --- Legacy SSE transport on /sse + /messages ---
      if (url.pathname === "/sse" && req.method === "GET") {
        const mcp = createConfiguredMcpServer();
        const transport = new SSEServerTransport("/messages", res);
        sessions.set(transport.sessionId, { transport, server: mcp });
        res.on("close", () => sessions.delete(transport.sessionId));
        await mcp.connect(transport);
      } else if (url.pathname === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId");
        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (session && session.transport instanceof SSEServerTransport) {
          await session.transport.handlePostMessage(req, res);
        } else {
          res.writeHead(404).end("Session not found");
        }
      } else {
        res.writeHead(404).end("Not found");
      }
    });

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        httpServer = null;
        resolve({ success: false, error: `Port ${port} is already in use` });
      }
    });

    httpServer.listen(port, "127.0.0.1", () => {
      resolve({ success: true });
    });
  });
}

export async function stopMockServerMcp(): Promise<void> {
  if (!httpServer) return;
  for (const { transport } of sessions.values()) {
    await transport.close().catch(() => {});
  }
  sessions.clear();
  return new Promise((resolve) => {
    httpServer!.close(() => {
      httpServer = null;
      resolve();
    });
  });
}

export function getMockServerMcpStatus(): {
  running: boolean;
  port: number | null;
} {
  if (!httpServer) return { running: false, port: null };
  const addr = httpServer.address();
  return {
    running: true,
    port: typeof addr === "object" && addr ? addr.port : null,
  };
}
