import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, X, Check, Skull } from 'lucide-react';

type PortEntry = {
  protocol: 'TCP' | 'UDP';
  localPort: number;
  localAddress: string;
  state: string;
  pid: number;
  processName: string;
};

const INTERVALS = [1, 3, 5, 10, 30] as const;
type IntervalValue = typeof INTERVALS[number];

export function PortMonitorPanel({ panelId: _panelId }: { panelId: string }) {
  const [entries, setEntries] = useState<PortEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<'listening' | 'all'>('listening');
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
      // Preserve kill confirmation only if the row still exists in fresh results
      setConfirmingPid((prev) => {
        if (prev === null) return null;
        return data.some((e) => e.pid === prev) ? prev : null;
      });
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to list ports');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  // Auto-refresh interval — only runs when autoRefresh is enabled
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

  const handleManualRefresh = () => {
    fetchPorts();
  };

  const handleKillConfirm = async (pid: number) => {
    setConfirmingPid(null);
    setEntries((prev) => prev.filter((e) => e.pid !== pid));
    const result = await window.electronAPI.ports.kill(pid);
    if (!result.success) {
      setError(result.error ?? 'Kill failed');
    }
    fetchPorts();
  };

  const filtered = entries.filter((e) => {
    if (stateFilter === 'listening' && e.state !== 'LISTEN' && e.state !== 'LISTENING') return false;
    if (!filter) return true;
    return (
      String(e.localPort).includes(filter) ||
      e.processName.toLowerCase().includes(filter.toLowerCase())
    );
  });

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">Port Monitor</span>

        <input
          className="flex-1 min-w-32 h-7 rounded-md bg-muted px-2 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          placeholder="Filter by port or process..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <select
          className="h-7 rounded-md bg-muted px-2 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as 'listening' | 'all')}
        >
          <option value="listening">Listening</option>
          <option value="all">All</option>
        </select>

        <button
          onClick={() => setAutoRefresh((v) => !v)}
          className={`h-7 px-2 rounded-md text-xs transition-colors ${
            autoRefresh
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
        >
          Auto
        </button>

        {autoRefresh && (
          <select
            className="h-7 rounded-md bg-muted px-2 text-xs outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            value={intervalSecs}
            onChange={(e) => setIntervalSecs(Number(e.target.value) as IntervalValue)}
          >
            {INTERVALS.map((s) => (
              <option key={s} value={s}>{s}s</option>
            ))}
          </select>
        )}

        <button
          onClick={handleManualRefresh}
          disabled={loading}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70">
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {initialLoad && loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw className="size-4 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No ports found
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border">
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
              {filtered.map((entry, idx) => {
                const isConfirming = confirmingPid === entry.pid;
                const isListening = entry.state === 'LISTEN' || entry.state === 'LISTENING';
                return (
                  <tr
                    key={`${entry.protocol}-${entry.localPort}-${entry.pid}-${idx}`}
                    className={[
                      'group border-b border-border/50 hover:bg-muted/40 transition-colors',
                      isConfirming ? 'bg-destructive/10' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="px-4 py-1.5">
                      <span className={`px-1 py-0.5 rounded text-[10px] font-mono font-medium ${
                        entry.protocol === 'TCP'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {entry.protocol}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 font-mono font-medium">{entry.localPort}</td>
                    <td className="px-4 py-1.5 font-mono text-muted-foreground">{entry.localAddress}</td>
                    <td className="px-4 py-1.5">
                      <span className={isListening ? 'text-green-400' : 'text-muted-foreground'}>
                        {entry.state || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 font-mono text-muted-foreground">{entry.pid}</td>
                    <td className="px-4 py-1.5 text-foreground">{entry.processName}</td>
                    <td className="px-4 py-1.5">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleKillConfirm(entry.pid)}
                            className="p-1 rounded text-destructive hover:bg-destructive/20 transition-colors"
                            title="Confirm kill"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmingPid(null)}
                            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                            title="Cancel"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingPid(entry.pid)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                          title={`Kill PID ${entry.pid}`}
                        >
                          <Skull className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
