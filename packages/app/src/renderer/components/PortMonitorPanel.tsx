import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { RefreshCw, X, Check, Skull, ChevronDown } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";

type PortEntry = {
  protocol: "TCP" | "UDP";
  localPort: number;
  localAddress: string;
  state: string;
  pid: number;
  processName: string;
};

const INTERVALS = [1, 3, 5, 10, 30] as const;
type IntervalValue = (typeof INTERVALS)[number];

interface PortRowProps {
  entry: PortEntry;
  isConfirming: boolean;
  onKillClick: (pid: number) => void;
  onConfirm: (pid: number) => void;
  onCancel: () => void;
}

const PortRow = memo(
  function PortRow({
    entry,
    isConfirming,
    onKillClick,
    onConfirm,
    onCancel,
  }: PortRowProps) {
    const isListening = entry.state === "LISTEN" || entry.state === "LISTENING";
    return (
      <tr
        className={[
          "group border-b border-border/50 hover:bg-muted/40 transition-colors",
          isConfirming ? "bg-destructive/10" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <td className="px-4 py-1.5">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${entry.protocol === "TCP" ? "bg-blue-500/10 text-blue-400" : "bg-amber-500/10 text-amber-400"}`}
          >
            {entry.protocol}
          </span>
        </td>
        <td className="px-4 py-1.5 font-mono font-medium">{entry.localPort}</td>
        <td className="px-4 py-1.5 font-mono text-muted-foreground">
          {entry.localAddress}
        </td>
        <td className="px-4 py-1.5">
          <span
            className={isListening ? "text-green-400" : "text-muted-foreground"}
          >
            {entry.state || "—"}
          </span>
        </td>
        <td className="px-4 py-1.5 font-mono text-muted-foreground">
          {entry.pid}
        </td>
        <td className="px-4 py-1.5 text-foreground">{entry.processName}</td>
        <td className="px-4 py-1.5">
          {isConfirming ? (
            <div className="flex items-center gap-1">
              <Button
                size="icon-xs"
                variant="destructive"
                onClick={() => onConfirm(entry.pid)}
                title="Confirm kill"
              >
                <Check />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onCancel}
                title="Cancel"
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => onKillClick(entry.pid)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title={`Kill PID ${entry.pid}`}
            >
              <Skull />
            </Button>
          )}
        </td>
      </tr>
    );
  },
  (prev, next) =>
    prev.entry.protocol === next.entry.protocol &&
    prev.entry.localPort === next.entry.localPort &&
    prev.entry.localAddress === next.entry.localAddress &&
    prev.entry.state === next.entry.state &&
    prev.entry.pid === next.entry.pid &&
    prev.entry.processName === next.entry.processName &&
    prev.isConfirming === next.isConfirming,
);

export function PortMonitorPanel({ panelId: _panelId }: { panelId: string }) {
  const [entries, setEntries] = useState<PortEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<"listening" | "all">(
    "listening",
  );
  const [intervalSecs, setIntervalSecs] = useState<IntervalValue>(3);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [confirmingPid, setConfirmingPid] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await window.electronAPI.ports.list();
      const data = raw as PortEntry[];
      setEntries(data);
      setConfirmingPid((prev) => {
        if (prev === null) return null;
        return data.some((e) => e.pid === prev) ? prev : null;
      });
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to list ports");
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!autoRefresh) return;
    intervalRef.current = setInterval(fetchPorts, intervalSecs * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchPorts, intervalSecs]);

  useEffect(() => {
    fetchPorts();
  }, [fetchPorts]);

  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return entries.filter((e) => {
      if (
        stateFilter === "listening" &&
        e.state !== "LISTEN" &&
        e.state !== "LISTENING"
      )
        return false;
      if (!filter) return true;
      return (
        String(e.localPort).includes(filter) ||
        e.processName.toLowerCase().includes(lowerFilter)
      );
    });
  }, [entries, filter, stateFilter]);

  const stableOnKillClick = useCallback(
    (pid: number) => setConfirmingPid(pid),
    [],
  );
  const stableOnCancel = useCallback(() => setConfirmingPid(null), []);
  const stableOnConfirm = useCallback(
    (pid: number) => {
      setConfirmingPid(null);
      setEntries((prev) => prev.filter((e) => e.pid !== pid));
      window.electronAPI.ports
        .kill(pid)
        .then((result: { success: boolean; error?: string }) => {
          if (!result.success) setError(result.error ?? "Kill failed");
          fetchPorts();
        });
    },
    [fetchPorts],
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
          Port Monitor
        </span>
        <Input
          className="flex-1 min-w-32 h-7 text-xs"
          placeholder="Filter by port or process..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex rounded-md border border-border overflow-hidden text-xs shrink-0">
          <button
            className={cn(
              "px-2.5 py-1 transition-colors",
              stateFilter === "listening"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            onClick={() => setStateFilter("listening")}
          >
            Listening
          </button>
          <button
            className={cn(
              "px-2.5 py-1 transition-colors border-l border-border",
              stateFilter === "all"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            onClick={() => setStateFilter("all")}
          >
            All
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAutoRefresh((v) => !v)}
          className={
            autoRefresh
              ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              : ""
          }
        >
          Auto
        </Button>
        {autoRefresh && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 font-mono"
                />
              }
            >
              {intervalSecs}s <ChevronDown className="size-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {INTERVALS.map((s) => (
                <DropdownMenuItem key={s} onClick={() => setIntervalSecs(s)}>
                  {s}s
                  {s === intervalSecs && <Check className="ml-auto size-3" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={fetchPorts}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 flex items-center justify-between gap-2">
          <span>{error}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setError(null)}>
            <X />
          </Button>
        </div>
      )}

      {initialLoad && loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          <RefreshCw className="size-4 animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          No ports found
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 border-b border-border z-10 bg-background/70 backdrop-blur-sm">
              <tr className="text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium w-16">Proto</th>
                <th className="text-left px-4 py-2 font-medium w-16">Port</th>
                <th className="text-left px-4 py-2 font-medium">Address</th>
                <th className="text-left px-4 py-2 font-medium w-28">State</th>
                <th className="text-left px-4 py-2 font-medium w-16">PID</th>
                <th className="text-left px-4 py-2 font-medium">Process</th>
                <th className="w-20 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => (
                <PortRow
                  key={`${entry.protocol}-${entry.localPort}-${entry.pid}-${idx}`}
                  entry={entry}
                  isConfirming={confirmingPid === entry.pid}
                  onKillClick={stableOnKillClick}
                  onConfirm={stableOnConfirm}
                  onCancel={stableOnCancel}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
