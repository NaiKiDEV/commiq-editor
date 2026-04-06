// Shared mock server types — imported by both main process (ipc/mock-server.ts) and renderer (MockServerPanel.tsx)

export type MockHttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type MockHeader = {
  key: string;
  value: string;
  enabled: boolean;
};

export type MockResponseRule = {
  /** Match condition — only applies when all specified fields match the incoming request */
  condition: {
    /** JSONPath-like key in request body to match (e.g. "user.role") */
    bodyContains?: string;
    /** Header that must be present with a specific value */
    headerMatch?: { key: string; value: string };
    /** Query param that must be present with a specific value */
    queryMatch?: { key: string; value: string };
  };
  /** Response to send when condition matches */
  status: number;
  headers: MockHeader[];
  body: string;
  /** Artificial delay in ms before responding */
  delay: number;
};

export type MockRoute = {
  id: string;
  /** e.g. GET, POST */
  method: MockHttpMethod;
  /** e.g. /api/users/:id */
  path: string;
  /** Human-readable label */
  name: string;
  /** Whether this route is active when server is running */
  enabled: boolean;
  /** Default response */
  status: number;
  headers: MockHeader[];
  body: string;
  /** Artificial delay in ms before responding */
  delay: number;
  /** Conditional response rules — first matching rule wins, else default */
  rules: MockResponseRule[];
};

export type MockWsEndpoint = {
  id: string;
  /** Path to accept WebSocket upgrades on, e.g. /ws or /ws/chat */
  path: string;
  /** Human-readable label */
  name: string;
  /** Whether this endpoint is active when server is running */
  enabled: boolean;
};

export type MockWsMessage = {
  id: string;
  endpointId: string;
  /** Which client sent/received this message (auto-assigned id) */
  clientId: string;
  direction: "received" | "sent" | "broadcast";
  payload: string;
  timestamp: number;
};

export type MockWsClient = {
  id: string;
  endpointId: string;
  connectedAt: number;
  remoteAddress: string;
};

export type MockServerConfig = {
  id: string;
  name: string;
  port: number;
  /** Optional CORS origin — empty string means disabled */
  corsOrigin: string;
  /**
   * When set, requests that don't match any route are forwarded to this URL.
   * e.g. "https://api.example.com" — the request path is appended.
   */
  proxyBaseUrl: string;
  /** Routes defined for this server */
  routes: MockRoute[];
  /** WebSocket endpoints */
  wsEndpoints: MockWsEndpoint[];
};

export type MockServerStatus = "stopped" | "starting" | "running" | "error";

export type MockRequestLog = {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  /** Which route matched (null if 404) */
  matchedRouteId: string | null;
  /** Which rule index matched (-1 for default, null for 404) */
  matchedRuleIndex: number | null;
  /** Response that was sent */
  responseStatus: number;
  responseBody: string;
  /** Time taken to respond in ms (including artificial delay) */
  duration: number;
  /** Whether this request was forwarded to the proxy */
  proxied?: boolean;
};

export type MockServerState = {
  configId: string;
  status: MockServerStatus;
  error?: string;
  /** How many requests have been served since last start */
  requestCount: number;
  /** Recent request log (kept in memory, capped) */
  recentRequests: MockRequestLog[];
  /** Currently connected WebSocket clients */
  wsClients: MockWsClient[];
  /** Recent WebSocket messages (kept in memory, capped) */
  wsMessages: MockWsMessage[];
};
