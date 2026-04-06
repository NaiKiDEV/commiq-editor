import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Square,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Circle,
  Settings,
  List,
  Radio,
  ArrowLeft,
  Send,
  Unplug,
  Plug,
  Megaphone,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { JsonEditor } from "./mock-server/JsonEditor";
import type {
  MockServerConfig,
  MockRoute,
  MockHeader,
  MockResponseRule,
  MockHttpMethod,
  MockServerState,
  MockRequestLog,
  MockWsEndpoint,
  MockWsMessage,
  MockWsClient,
} from "../../shared/mock-server-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HTTP_METHODS: MockHttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400",
  POST: "text-blue-400",
  PUT: "text-amber-400",
  PATCH: "text-orange-400",
  DELETE: "text-red-400",
  HEAD: "text-purple-400",
  OPTIONS: "text-gray-400",
};

const STATUS_PRESETS = [
  200, 201, 204, 301, 302, 400, 401, 403, 404, 405, 409, 422, 429, 500, 502,
  503,
];

function emptyRoute(): MockRoute {
  return {
    id: crypto.randomUUID(),
    method: "GET",
    path: "/api/",
    name: "",
    enabled: true,
    status: 200,
    headers: [
      { key: "Content-Type", value: "application/json", enabled: true },
    ],
    body: "{\n  \n}",
    delay: 0,
    rules: [],
  };
}

function emptyRule(): MockResponseRule {
  return {
    condition: {},
    status: 200,
    headers: [
      { key: "Content-Type", value: "application/json", enabled: true },
    ],
    body: "{}",
    delay: 0,
  };
}

function emptyWsEndpoint(): MockWsEndpoint {
  return {
    id: crypto.randomUUID(),
    path: "/ws",
    name: "",
    enabled: true,
  };
}

function emptyConfig(): MockServerConfig {
  return {
    id: crypto.randomUUID(),
    name: "My Mock Server",
    port: 8080,
    corsOrigin: "*",
    routes: [],
    wsEndpoints: [],
  };
}

function statusColor(status: number): string {
  if (status < 300) return "text-emerald-400";
  if (status < 400) return "text-amber-400";
  return "text-red-400";
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        }
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {copied ? "Copied!" : "Copy"}
      </TooltipContent>
    </Tooltip>
  );
}

function MethodBadge({ method, small }: { method: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "font-mono font-semibold shrink-0",
        METHOD_COLORS[method] ?? "text-muted-foreground",
        small ? "text-[10px]" : "text-xs",
      )}
    >
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Headers editor
// ---------------------------------------------------------------------------

function HeadersEditor({
  headers,
  onChange,
  compact,
}: {
  headers: MockHeader[];
  onChange: (h: MockHeader[]) => void;
  compact?: boolean;
}) {
  const update = (idx: number, patch: Partial<MockHeader>) => {
    const next = headers.map((h, i) => (i === idx ? { ...h, ...patch } : h));
    onChange(next);
  };
  const add = () =>
    onChange([...headers, { key: "", value: "", enabled: true }]);
  const remove = (idx: number) => onChange(headers.filter((_, i) => i !== idx));

  const h = compact ? "h-6" : "h-7";

  return (
    <div className="space-y-1">
      {headers.map((hdr, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={hdr.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
            className="h-3 w-3 shrink-0 accent-primary"
          />
          <Input
            placeholder="Header"
            value={hdr.key}
            onChange={(e) => update(i, { key: e.target.value })}
            className={cn(
              `flex-1 min-w-0 ${h} text-xs font-mono`,
              !hdr.enabled && "opacity-40",
            )}
          />
          <Input
            placeholder="Value"
            value={hdr.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className={cn(
              `flex-1 min-w-0 ${h} text-xs font-mono`,
              !hdr.enabled && "opacity-40",
            )}
          />
          <Button variant="ghost" size="icon-xs" onClick={() => remove(i)}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" className="mt-1" onClick={add}>
        <Plus className="size-3" /> Add header
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route editor
// ---------------------------------------------------------------------------

function RouteEditor({
  route,
  onChange,
}: {
  route: MockRoute;
  onChange: (r: MockRoute) => void;
}) {
  const [activeTab, setActiveTab] = useState<"response" | "headers" | "rules">(
    "response",
  );

  const patch = (p: Partial<MockRoute>) => onChange({ ...route, ...p });

  const updateRule = (idx: number, r: MockResponseRule) => {
    const next = [...route.rules];
    next[idx] = r;
    patch({ rules: next });
  };

  const removeRule = (idx: number) => {
    patch({ rules: route.rules.filter((_, i) => i !== idx) });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Route identity */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Route name (optional)"
            value={route.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="flex-1 h-7 text-xs"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={route.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="h-3 w-3 accent-primary"
            />
            {route.enabled ? "Enabled" : "Disabled"}
          </label>
        </div>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="default"
                  className={cn(
                    "font-mono font-bold shrink-0 w-24 justify-between h-7",
                    METHOD_COLORS[route.method],
                  )}
                />
              }
            >
              {route.method} <ChevronDown className="size-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {HTTP_METHODS.map((m) => (
                <DropdownMenuItem
                  key={m}
                  onClick={() => patch({ method: m })}
                  className={METHOD_COLORS[m]}
                >
                  <span className="font-mono font-bold">{m}</span>
                  {m === route.method && <Check className="ml-auto size-3" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            placeholder="/api/users/:id"
            value={route.path}
            onChange={(e) => patch({ path: e.target.value })}
            className="flex-1 h-7 text-xs font-mono"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 border-b border-border px-0">
        {(["response", "headers", "rules"] as const).map((tab) => (
          <button
            key={tab}
            className={cn(
              "pb-1 text-xs capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === "rules" && route.rules.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({route.rules.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "response" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-12 shrink-0">
              Status
            </label>
            <Select
              value={String(route.status)}
              onValueChange={(v) =>
                v !== null && patch({ status: parseInt(v, 10) })
              }
            >
              <SelectTrigger size="sm" className="w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_PRESETS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    <span className={cn("font-mono", statusColor(s))}>{s}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-xs text-muted-foreground ml-auto">
              Delay (ms)
            </label>
            <Input
              type="number"
              min={0}
              step={100}
              value={route.delay}
              onChange={(e) =>
                patch({ delay: Math.max(0, parseInt(e.target.value, 10) || 0) })
              }
              className="w-20 h-7 text-xs text-right"
            />
          </div>
          <JsonEditor
            value={route.body}
            onChange={(val) => patch({ body: val })}
            minLines={8}
          />
        </div>
      )}

      {activeTab === "headers" && (
        <HeadersEditor
          headers={route.headers}
          onChange={(h) => patch({ headers: h })}
        />
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Conditional rules are evaluated top-to-bottom. First match wins,
            otherwise the default response is used.
          </p>
          {route.rules.map((rule, i) => (
            <RuleEditor
              key={i}
              index={i}
              rule={rule}
              onChange={(r) => updateRule(i, r)}
              onRemove={() => removeRule(i)}
            />
          ))}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => patch({ rules: [...route.rules, emptyRule()] })}
          >
            <Plus className="size-3" /> Add conditional rule
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule editor
// ---------------------------------------------------------------------------

function RuleEditor({
  index,
  rule,
  onChange,
  onRemove,
}: {
  index: number;
  rule: MockResponseRule;
  onChange: (r: MockResponseRule) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const patch = (p: Partial<MockResponseRule>) => onChange({ ...rule, ...p });
  const patchCondition = (c: Partial<MockResponseRule["condition"]>) =>
    patch({ condition: { ...rule.condition, ...c } });

  return (
    <div className="border border-border rounded-lg p-2 space-y-2 bg-muted/20">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <span className="text-xs font-medium">Rule #{index + 1}</span>
        <span className={cn("text-xs font-mono", statusColor(rule.status))}>
          {rule.status}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2 pl-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Conditions
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground w-24 shrink-0">
                Body contains
              </label>
              <Input
                value={rule.condition.bodyContains ?? ""}
                onChange={(e) =>
                  patchCondition({ bodyContains: e.target.value || undefined })
                }
                placeholder="substring to match"
                className="flex-1 h-6 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground w-24 shrink-0">
                Header match
              </label>
              <Input
                value={rule.condition.headerMatch?.key ?? ""}
                onChange={(e) =>
                  patchCondition({
                    headerMatch: e.target.value
                      ? {
                          key: e.target.value,
                          value: rule.condition.headerMatch?.value ?? "",
                        }
                      : undefined,
                  })
                }
                placeholder="key"
                className="w-28 h-6 text-xs"
              />
              <Input
                value={rule.condition.headerMatch?.value ?? ""}
                onChange={(e) =>
                  patchCondition({
                    headerMatch: rule.condition.headerMatch
                      ? { ...rule.condition.headerMatch, value: e.target.value }
                      : undefined,
                  })
                }
                placeholder="value"
                className="flex-1 h-6 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground w-24 shrink-0">
                Query match
              </label>
              <Input
                value={rule.condition.queryMatch?.key ?? ""}
                onChange={(e) =>
                  patchCondition({
                    queryMatch: e.target.value
                      ? {
                          key: e.target.value,
                          value: rule.condition.queryMatch?.value ?? "",
                        }
                      : undefined,
                  })
                }
                placeholder="key"
                className="w-28 h-6 text-xs"
              />
              <Input
                value={rule.condition.queryMatch?.value ?? ""}
                onChange={(e) =>
                  patchCondition({
                    queryMatch: rule.condition.queryMatch
                      ? { ...rule.condition.queryMatch, value: e.target.value }
                      : undefined,
                  })
                }
                placeholder="value"
                className="flex-1 h-6 text-xs"
              />
            </div>
          </div>

          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold pt-1">
            Response
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(rule.status)}
              onValueChange={(v) =>
                v !== null && patch({ status: parseInt(v, 10) })
              }
            >
              <SelectTrigger size="sm" className="w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_PRESETS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    <span className={cn("font-mono", statusColor(s))}>{s}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-xs text-muted-foreground ml-auto">
              Delay
            </label>
            <Input
              type="number"
              min={0}
              step={100}
              value={rule.delay}
              onChange={(e) =>
                patch({ delay: Math.max(0, parseInt(e.target.value, 10) || 0) })
              }
              className="w-16 h-6 text-xs text-right"
            />
          </div>
          <JsonEditor
            value={rule.body}
            onChange={(val) => patch({ body: val })}
            minLines={3}
          />
          <HeadersEditor
            headers={rule.headers}
            onChange={(h) => patch({ headers: h })}
            compact
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request log viewer
// ---------------------------------------------------------------------------

function RequestLogViewer({
  logs,
  routes,
  onClear,
}: {
  logs: MockRequestLog[];
  routes: MockRoute[];
  onClear: () => void;
}) {
  const [selectedLog, setSelectedLog] = useState<MockRequestLog | null>(null);
  const [filter, setFilter] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);

  const filtered = filter
    ? logs.filter(
        (l) =>
          l.method.toLowerCase().includes(filter.toLowerCase()) ||
          l.path.toLowerCase().includes(filter.toLowerCase()) ||
          String(l.responseStatus).includes(filter),
      )
    : logs;

  if (selectedLog) {
    const matchedRoute = selectedLog.matchedRouteId
      ? routes.find((r) => r.id === selectedLog.matchedRouteId)
      : null;

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSelectedLog(null)}
                />
              }
            >
              <ArrowLeft className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to log</TooltipContent>
          </Tooltip>
          <MethodBadge method={selectedLog.method} />
          <span className="text-xs font-mono truncate">{selectedLog.path}</span>
          <span
            className={cn(
              "text-xs font-mono ml-auto",
              statusColor(selectedLog.responseStatus),
            )}
          >
            {selectedLog.responseStatus}
          </span>
          <span className="text-xs text-muted-foreground">
            {selectedLog.duration}ms
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          <div>
            <p className="text-muted-foreground font-semibold mb-1">
              Request Info
            </p>
            <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5">
              <span className="text-muted-foreground">Time</span>
              <span>{formatTimestamp(selectedLog.timestamp)}</span>
              <span className="text-muted-foreground">Route</span>
              <span>
                {matchedRoute
                  ? `${matchedRoute.name || matchedRoute.path}`
                  : "(no match — 404)"}
              </span>
              {selectedLog.matchedRuleIndex !== null &&
                selectedLog.matchedRuleIndex >= 0 && (
                  <>
                    <span className="text-muted-foreground">Rule</span>
                    <span>#{selectedLog.matchedRuleIndex + 1}</span>
                  </>
                )}
            </div>
          </div>
          {Object.keys(selectedLog.query).length > 0 && (
            <div>
              <p className="text-muted-foreground font-semibold mb-1">
                Query Parameters
              </p>
              <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 font-mono">
                {Object.entries(selectedLog.query).map(([k, v]) => (
                  <span key={k} className="contents">
                    <span className="text-muted-foreground">{k}</span>
                    <span>{v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-muted-foreground font-semibold mb-1">
              Request Headers
            </p>
            <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
              {Object.entries(selectedLog.headers).map(([k, v]) => (
                <span key={k} className="contents">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="truncate">{v}</span>
                </span>
              ))}
            </div>
          </div>
          {selectedLog.body && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-muted-foreground font-semibold">
                  Request Body
                </p>
                <CopyButton text={selectedLog.body} />
              </div>
              <pre className="p-2 bg-muted/50 border border-border rounded-lg font-mono text-[11px] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {selectedLog.body}
              </pre>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-muted-foreground font-semibold">
                Response Body
              </p>
              <CopyButton text={selectedLog.responseBody} />
            </div>
            <pre className="p-2 bg-muted/50 border border-border rounded-lg font-mono text-[11px] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
              {selectedLog.responseBody}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Input
          placeholder="Filter requests..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 h-6 text-xs"
        />
        <span className="text-xs text-muted-foreground">{filtered.length}</span>
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon-xs" onClick={onClear} />}
          >
            <Trash2 className="size-3" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear log</TooltipContent>
        </Tooltip>
      </div>
      <div ref={logContainerRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {logs.length === 0
              ? "No requests yet — waiting for incoming traffic..."
              : "No requests match filter"}
          </div>
        ) : (
          filtered.map((log) => (
            <button
              key={log.id}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 border-b border-border/50 text-left"
              onClick={() => setSelectedLog(log)}
            >
              <span className="text-[10px] text-muted-foreground font-mono w-20 shrink-0">
                {formatTimestamp(log.timestamp)}
              </span>
              <MethodBadge method={log.method} small />
              <span className="font-mono truncate flex-1 min-w-0">
                {log.path}
              </span>
              <span
                className={cn(
                  "font-mono shrink-0",
                  statusColor(log.responseStatus),
                )}
              >
                {log.responseStatus}
              </span>
              <span className="text-muted-foreground shrink-0 w-12 text-right">
                {log.duration}ms
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebSocket endpoints editor
// ---------------------------------------------------------------------------

function WsEndpointsEditor({
  endpoints,
  onChange,
}: {
  endpoints: MockWsEndpoint[];
  onChange: (eps: MockWsEndpoint[]) => void;
}) {
  const add = () => onChange([...endpoints, emptyWsEndpoint()]);
  const remove = (idx: number) =>
    onChange(endpoints.filter((_, i) => i !== idx));
  const update = (idx: number, patch: Partial<MockWsEndpoint>) => {
    onChange(endpoints.map((ep, i) => (i === idx ? { ...ep, ...patch } : ep)));
  };

  return (
    <div className="space-y-2">
      {endpoints.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No WebSocket endpoints defined.
        </p>
      ) : (
        endpoints.map((ep, i) => (
          <div
            key={ep.id}
            className="flex items-center gap-2 border border-border rounded-lg p-2 bg-muted/20"
          >
            <input
              type="checkbox"
              checked={ep.enabled}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              className="h-3 w-3 shrink-0 accent-primary"
            />
            <Plug
              className={cn(
                "size-3 shrink-0",
                ep.enabled ? "text-purple-400" : "text-muted-foreground",
              )}
            />
            <Input
              value={ep.path}
              onChange={(e) => update(i, { path: e.target.value })}
              placeholder="/ws"
              className={cn(
                "w-36 h-6 text-xs font-mono",
                !ep.enabled && "opacity-40",
              )}
            />
            <Input
              value={ep.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Name (optional)"
              className={cn("flex-1 h-6 text-xs", !ep.enabled && "opacity-40")}
            />
            <Button variant="ghost" size="icon-xs" onClick={() => remove(i)}>
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))
      )}
      <Button variant="ghost" size="xs" onClick={add}>
        <Plus className="size-3" /> Add WebSocket endpoint
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebSocket live panel
// ---------------------------------------------------------------------------

function WsLivePanel({
  configId,
  wsEndpoints,
  wsClients,
  wsMessages,
  isRunning,
}: {
  configId: string;
  wsEndpoints: MockWsEndpoint[];
  wsClients: MockWsClient[];
  wsMessages: MockWsMessage[];
  isRunning: boolean;
}) {
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    null,
  );
  const [sendTarget, setSendTarget] = useState<"broadcast" | string>(
    "broadcast",
  );
  const [payload, setPayload] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const enabledEndpoints = wsEndpoints.filter((ep) => ep.enabled);
  const activeEndpointId =
    selectedEndpointId ?? enabledEndpoints[0]?.id ?? null;

  const endpointClients = wsClients.filter(
    (c) => c.endpointId === activeEndpointId,
  );
  const endpointMessages = wsMessages.filter(
    (m) => m.endpointId === activeEndpointId,
  );

  const activeEndpoint = wsEndpoints.find((ep) => ep.id === activeEndpointId);

  const handleSend = async () => {
    if (!payload.trim() || !activeEndpointId) return;
    if (sendTarget === "broadcast") {
      await window.electronAPI.mockServer.wsBroadcast(
        configId,
        activeEndpointId,
        payload,
      );
    } else {
      await window.electronAPI.mockServer.wsSend(configId, sendTarget, payload);
    }
    setPayload("");
  };

  const handleClearLog = async () => {
    await window.electronAPI.mockServer.clearWsLog(configId);
  };

  const handleDisconnectClient = async (clientId: string) => {
    await window.electronAPI.mockServer.wsDisconnectClient(configId, clientId);
  };

  if (!isRunning) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Start the server to use WebSocket endpoints
      </div>
    );
  }

  if (enabledEndpoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        No WebSocket endpoints enabled — add one in Settings
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Endpoint selector + client count */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        {enabledEndpoints.length > 1 ? (
          <Select
            value={activeEndpointId ?? ""}
            onValueChange={(v) => v !== null && setSelectedEndpointId(v)}
          >
            <SelectTrigger size="sm" className="w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {enabledEndpoints.map((ep) => (
                <SelectItem key={ep.id} value={ep.id}>
                  <span className="font-mono">{ep.path}</span>
                  {ep.name && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({ep.name})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs font-mono text-purple-400">
            {activeEndpoint?.path}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          <Plug className="size-3 inline mr-1" />
          {endpointClients.length} client
          {endpointClients.length !== 1 ? "s" : ""}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" onClick={handleClearLog} />
            }
          >
            <Trash2 className="size-3" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear messages</TooltipContent>
        </Tooltip>
      </div>

      {/* Connected clients bar */}
      {endpointClients.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/50 overflow-x-auto shrink-0">
          <span className="text-[10px] text-muted-foreground shrink-0 mr-1">
            Clients:
          </span>
          {endpointClients.map((client) => (
            <div
              key={client.id}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono shrink-0 group"
            >
              <Circle className="size-1.5 text-emerald-400 fill-current" />
              <span className="text-muted-foreground">
                {client.remoteAddress}
              </span>
              <span className="text-muted-foreground/60">
                {client.id.slice(0, 6)}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100 h-3 w-3"
                      onClick={() => handleDisconnectClient(client.id)}
                    />
                  }
                >
                  <Unplug className="size-2.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Disconnect</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {endpointMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            No messages yet — waiting for WebSocket activity...
          </div>
        ) : (
          <div className="space-y-0">
            {[...endpointMessages].reverse().map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-2 px-3 py-1.5 text-xs border-b border-border/50",
                  msg.direction === "received" && "bg-blue-400/5",
                  msg.direction === "sent" && "bg-emerald-400/5",
                  msg.direction === "broadcast" && "bg-purple-400/5",
                )}
              >
                <span className="text-[10px] text-muted-foreground font-mono w-20 shrink-0 pt-0.5">
                  {formatTimestamp(msg.timestamp)}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase w-14 shrink-0 pt-0.5",
                    msg.direction === "received"
                      ? "text-blue-400"
                      : msg.direction === "broadcast"
                        ? "text-purple-400"
                        : "text-emerald-400",
                  )}
                >
                  {msg.direction === "broadcast"
                    ? "bcast"
                    : msg.direction === "received"
                      ? "recv"
                      : "sent"}
                </span>
                <pre className="flex-1 min-w-0 font-mono text-[11px] whitespace-pre-wrap break-all">
                  {msg.payload}
                </pre>
                <CopyButton text={msg.payload} />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Send bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border shrink-0">
        <Select
          value={sendTarget}
          onValueChange={(v) => v !== null && setSendTarget(v)}
        >
          <SelectTrigger size="sm" className="w-36 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="broadcast">
              <span className="flex items-center gap-1">
                <Megaphone className="size-3" /> Broadcast all
              </span>
            </SelectItem>
            {endpointClients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="font-mono text-[10px]">
                  {c.id.slice(0, 8)}...
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Message payload..."
          className="flex-1 h-7 text-xs font-mono"
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="default"
                size="icon-xs"
                onClick={handleSend}
                disabled={!payload.trim() || endpointClients.length === 0}
              />
            }
          >
            <Send className="size-3" />
          </TooltipTrigger>
          <TooltipContent side="top">Send</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server settings
// ---------------------------------------------------------------------------

function ServerSettings({
  config,
  onChange,
}: {
  config: MockServerConfig;
  onChange: (c: MockServerConfig) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          General
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20 shrink-0">
            Name
          </label>
          <Input
            value={config.name}
            onChange={(e) => onChange({ ...config, name: e.target.value })}
            className="flex-1 h-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20 shrink-0">
            Port
          </label>
          <Input
            type="number"
            min={1}
            max={65535}
            value={config.port}
            onChange={(e) =>
              onChange({
                ...config,
                port: parseInt(e.target.value, 10) || 8080,
              })
            }
            className="w-24 h-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20 shrink-0">
            CORS Origin
          </label>
          <Input
            value={config.corsOrigin}
            onChange={(e) =>
              onChange({ ...config, corsOrigin: e.target.value })
            }
            placeholder="* or https://example.com (empty = disabled)"
            className="flex-1 h-7 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          WebSocket Endpoints
        </p>
        <WsEndpointsEditor
          endpoints={config.wsEndpoints ?? []}
          onChange={(eps) => onChange({ ...config, wsEndpoints: eps })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

type View = "servers" | "editor";
type EditorSection = "routes" | "settings" | "logs" | "websocket";

export function MockServerPanel({ panelId: _panelId }: { panelId: string }) {
  const [configs, setConfigs] = useState<MockServerConfig[]>([]);
  const [serverStates, setServerStates] = useState<
    Map<string, MockServerState>
  >(new Map());
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [view, setView] = useState<View>("servers");
  const [editorSection, setEditorSection] = useState<EditorSection>("routes");
  const [loading, setLoading] = useState(true);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;
  const activeState = activeConfigId ? serverStates.get(activeConfigId) : null;
  const selectedRoute =
    activeConfig?.routes.find((r) => r.id === selectedRouteId) ?? null;

  // ---------------------------------------------------------------------------
  // Data loading & subscriptions
  // ---------------------------------------------------------------------------

  const loadConfigs = useCallback(async () => {
    const list = await window.electronAPI.mockServer.configsList();
    setConfigs(list as MockServerConfig[]);

    const stateMap = new Map<string, MockServerState>();
    for (const c of list) {
      const s = await window.electronAPI.mockServer.getState(c.id);
      stateMap.set(c.id, s as MockServerState);
    }
    setServerStates(stateMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.mockServer.onStateChanged(
      (state) => {
        setServerStates((prev) => {
          const next = new Map(prev);
          next.set(state.configId, state as MockServerState);
          return next;
        });
      },
    );
    return () => {
      unsubscribe();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  const saveConfig = useCallback((config: MockServerConfig) => {
    setConfigs((prev) => prev.map((c) => (c.id === config.id ? config : c)));
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      window.electronAPI.mockServer.configsSave(config);
    }, 400);
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const createConfig = async () => {
    const config = emptyConfig();
    await window.electronAPI.mockServer.configsSave(config);
    setConfigs((prev) => [...prev, config]);
    setActiveConfigId(config.id);
    setView("editor");
    setEditorSection("settings");
  };

  const deleteConfig = async (id: string) => {
    const state = serverStates.get(id);
    if (state?.status === "running") {
      await window.electronAPI.mockServer.stop(id);
    }
    await window.electronAPI.mockServer.configsDelete(id);
    setConfigs((prev) => prev.filter((c) => c.id !== id));
    if (activeConfigId === id) {
      setActiveConfigId(null);
      setView("servers");
    }
  };

  const toggleServer = async (configId: string) => {
    const state = serverStates.get(configId);
    if (state?.status === "running") {
      const result = await window.electronAPI.mockServer.stop(configId);
      setServerStates((prev) => {
        const next = new Map(prev);
        next.set(configId, result as MockServerState);
        return next;
      });
    } else {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const config = configs.find((c) => c.id === configId);
        if (config) await window.electronAPI.mockServer.configsSave(config);
      }
      const result = await window.electronAPI.mockServer.start(configId);
      setServerStates((prev) => {
        const next = new Map(prev);
        next.set(configId, result as MockServerState);
        return next;
      });
    }
  };

  const addRoute = () => {
    if (!activeConfig) return;
    const route = emptyRoute();
    const updated = {
      ...activeConfig,
      routes: [...activeConfig.routes, route],
    };
    saveConfig(updated);
    setSelectedRouteId(route.id);
  };

  const deleteRoute = (routeId: string) => {
    if (!activeConfig) return;
    const updated = {
      ...activeConfig,
      routes: activeConfig.routes.filter((r) => r.id !== routeId),
    };
    saveConfig(updated);
    if (selectedRouteId === routeId) setSelectedRouteId(null);
  };

  const updateRoute = (route: MockRoute) => {
    if (!activeConfig) return;
    const updated = {
      ...activeConfig,
      routes: activeConfig.routes.map((r) => (r.id === route.id ? route : r)),
    };
    saveConfig(updated);
  };

  const clearLog = async () => {
    if (!activeConfigId) return;
    await window.electronAPI.mockServer.clearLog(activeConfigId);
  };

  const openConfig = (id: string) => {
    setActiveConfigId(id);
    setSelectedRouteId(null);
    setView("editor");
    setEditorSection("routes");
  };

  // ---------------------------------------------------------------------------
  // Render — Server list
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-background text-sm items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (view === "servers") {
    return (
      <div className="flex flex-col h-full bg-background text-foreground text-sm">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <Radio className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Mock Servers</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  onClick={createConfig}
                />
              }
            >
              <Plus className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom">Create server</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1 overflow-y-auto">
          {configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-6">
              <Radio className="size-8 opacity-30" />
              <p className="text-xs text-center">
                No mock servers yet. Create one to start defining API endpoints.
              </p>
              <Button variant="outline" size="sm" onClick={createConfig}>
                <Plus className="size-3" />
                Create Mock Server
              </Button>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {configs.map((config) => {
                const state = serverStates.get(config.id);
                const isRunning = state?.status === "running";
                const isError = state?.status === "error";
                const wsCount =
                  config.wsEndpoints?.filter((ep) => ep.enabled).length ?? 0;

                return (
                  <div
                    key={config.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border"
                    onClick={() => openConfig(config.id)}
                  >
                    <Circle
                      className={cn(
                        "size-2.5 shrink-0 fill-current",
                        isRunning
                          ? "text-emerald-400"
                          : isError
                            ? "text-red-400"
                            : "text-muted-foreground/40",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">
                          {config.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          :{config.port}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {config.routes.length} route
                        {config.routes.length !== 1 ? "s" : ""}
                        {wsCount > 0 && ` · ${wsCount} ws`}
                        {isRunning && state
                          ? ` · ${state.requestCount} req`
                          : ""}
                        {isRunning && state && state.wsClients.length > 0
                          ? ` · ${state.wsClients.length} ws client${state.wsClients.length !== 1 ? "s" : ""}`
                          : ""}
                        {isError ? ` · ${state?.error}` : ""}
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className={cn(
                              isRunning
                                ? "text-emerald-400 hover:text-red-400"
                                : "text-muted-foreground hover:text-emerald-400",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleServer(config.id);
                            }}
                          />
                        }
                      >
                        {isRunning ? (
                          <Square className="size-3.5" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {isRunning ? "Stop" : "Start"}
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConfig(config.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — Editor view
  // ---------------------------------------------------------------------------

  if (!activeConfig) {
    setView("servers");
    return null;
  }

  const isRunning = activeState?.status === "running";
  const hasWsEndpoints = (activeConfig.wsEndpoints ?? []).some(
    (ep) => ep.enabled,
  );

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setView("servers");
                  setSelectedRouteId(null);
                }}
              />
            }
          >
            <ArrowLeft className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom">All servers</TooltipContent>
        </Tooltip>
        <Circle
          className={cn(
            "size-2 shrink-0 fill-current",
            isRunning ? "text-emerald-400" : "text-muted-foreground/40",
          )}
        />
        <span className="text-xs font-semibold truncate">
          {activeConfig.name}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          :{activeConfig.port}
        </span>

        {isRunning && (
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-400/10 text-emerald-400 rounded font-mono">
            http://127.0.0.1:{activeConfig.port}
          </span>
        )}

        {isRunning && (
          <CopyButton text={`http://127.0.0.1:${activeConfig.port}`} />
        )}

        {activeState?.status === "error" && (
          <span className="text-[10px] text-red-400 flex items-center gap-1">
            <AlertCircle className="size-3" />
            {activeState.error}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={isRunning ? "destructive" : "default"}
            size="xs"
            onClick={() => toggleServer(activeConfig.id)}
          >
            {isRunning ? (
              <Square className="size-3" />
            ) : (
              <Play className="size-3" />
            )}
            {isRunning ? "Stop" : "Start"}
          </Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-3 px-3 border-b border-border shrink-0">
        {[
          { key: "routes" as const, label: "Routes", icon: List },
          { key: "logs" as const, label: "Logs", icon: Radio },
          ...(hasWsEndpoints || (activeConfig.wsEndpoints ?? []).length > 0
            ? [{ key: "websocket" as const, label: "WebSocket", icon: Plug }]
            : []),
          { key: "settings" as const, label: "Settings", icon: Settings },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={cn(
              "flex items-center gap-1.5 px-1 py-2 text-xs transition-colors border-b-2 -mb-px",
              editorSection === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setEditorSection(key)}
          >
            <Icon className="size-3" />
            {label}
            {key === "routes" && (
              <span className="text-[10px] text-muted-foreground">
                ({activeConfig.routes.length})
              </span>
            )}
            {key === "logs" &&
              isRunning &&
              activeState &&
              activeState.requestCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({activeState.requestCount})
                </span>
              )}
            {key === "websocket" &&
              isRunning &&
              activeState &&
              activeState.wsClients.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({activeState.wsClients.length})
                </span>
              )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {editorSection === "settings" && (
          <div className="p-4 overflow-y-auto h-full">
            <ServerSettings config={activeConfig} onChange={saveConfig} />
          </div>
        )}

        {editorSection === "logs" && (
          <RequestLogViewer
            logs={activeState?.recentRequests ?? []}
            routes={activeConfig.routes}
            onClear={clearLog}
          />
        )}

        {editorSection === "websocket" && (
          <WsLivePanel
            configId={activeConfig.id}
            wsEndpoints={activeConfig.wsEndpoints ?? []}
            wsClients={activeState?.wsClients ?? []}
            wsMessages={activeState?.wsMessages ?? []}
            isRunning={isRunning}
          />
        )}

        {editorSection === "routes" && (
          <div className="flex h-full">
            {/* Route list sidebar */}
            <div className="w-56 shrink-0 border-r border-border flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground flex-1">
                  Endpoints
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={addRoute}
                      />
                    }
                  >
                    <Plus className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Add route</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex-1 overflow-y-auto">
                {activeConfig.routes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground px-4">
                    <p className="text-xs text-center">No routes yet</p>
                    <Button variant="ghost" size="xs" onClick={addRoute}>
                      <Plus className="size-3" /> Add route
                    </Button>
                  </div>
                ) : (
                  activeConfig.routes.map((route) => (
                    <button
                      key={route.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border/50 hover:bg-muted/50 group",
                        selectedRouteId === route.id && "bg-muted",
                        !route.enabled && "opacity-50",
                      )}
                      onClick={() => setSelectedRouteId(route.id)}
                    >
                      <MethodBadge method={route.method} small />
                      <span className="flex-1 min-w-0 text-xs font-mono truncate">
                        {route.path}
                      </span>
                      {route.rules.length > 0 && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          +{route.rules.length}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRoute(route.id);
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Route detail editor */}
            <div className="flex-1 overflow-y-auto">
              {selectedRoute ? (
                <div className="p-4">
                  <RouteEditor route={selectedRoute} onChange={updateRoute} />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                  {activeConfig.routes.length > 0
                    ? "Select a route to edit"
                    : "Add a route to get started"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
