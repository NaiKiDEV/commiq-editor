import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, X, Check, Skull, ChevronUp, ChevronDown } from 'lucide-react';


type ProcessEntry = {
  pid: number;
  name: string;
  status: string;
  user: string;
  cpuPercent: number;
  memoryMB: number;
  virtualMB: number;
  started: string;
  command: string;
};

type SortKey = 'name' | 'pid' | 'memoryMB' | 'virtualMB' | 'cpuPercent' | 'started';
type SortDir = 'asc' | 'desc';

const INTERVALS = [1, 3, 5, 10] as const;
type IntervalValue = typeof INTERVALS[number];


function formatRelativeTime(isoString: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sortEntries(entries: ProcessEntry[], key: SortKey, dir: SortDir): ProcessEntry[] {
  return [...entries].sort((a, b) => {
    let cmp = 0;
    if (key === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (key === 'started') {
      cmp = new Date(a.started).getTime() - new Date(b.started).getTime();
    } else {
      cmp = (a[key] as number) - (b[key] as number);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}


export function ProcessMonitorPanel({ panelId: _panelId }: { panelId: string }) {
  const [entries, setEntries] = useState<ProcessEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [live, setLive] = useState(false);
  const [intervalSecs, setIntervalSecs] = useState<IntervalValue>(3);
  const [confirmingPid, setConfirmingPid] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('memoryMB');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [liveSampleCount, setLiveSampleCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProcesses = useCallback(async (isLiveFetch = false) => {
    setLoading(true);
    setError(null);
    try {
      const raw = await window.electronAPI.process.list();
      const data = raw as ProcessEntry[];
      setEntries(data);
      if (isLiveFetch) {
        setLiveSampleCount((n) => n + 1);
      }
      setConfirmingPid((prev) => {
        if (prev === null) return null;
        return data.some((e) => e.pid === prev) ? prev : null;
      });
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to list processes');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    if (!live) setLiveSampleCount(0);
  }, [live]);

  // Auto-sampling interval — only when Live is enabled
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!live) return;
    intervalRef.current = setInterval(() => fetchProcesses(true), intervalSecs * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [live, fetchProcesses, intervalSecs]);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const handleKillConfirm = async (pid: number) => {
    setConfirmingPid(null);
    setEntries((prev) => prev.filter((e) => e.pid !== pid));
    const result = await window.electronAPI.process.kill(pid);
    if (!result.success) {
      setError(result.error ?? 'Kill failed');
    }
    fetchProcesses();
  };

  const filtered = sortEntries(
    entries.filter((e) => {
      if (!filter) return true;
      return (
        e.name.toLowerCase().includes(filter.toLowerCase()) ||
        String(e.pid).includes(filter)
      );
    }),
    sortKey,
    sortDir,
  );

  const showCpu = live && liveSampleCount >= 2;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">Process Monitor</span>

        <input
          className="flex-1 min-w-32 h-7 rounded-md bg-muted px-2 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          placeholder="Filter by name or PID..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <button
          onClick={() => setLive((v) => !v)}
          className={`h-7 px-2 rounded-md text-xs transition-colors ${
            live
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          title={live ? 'Disable live CPU sampling' : 'Enable live CPU sampling'}
        >
          Live
        </button>

        {live && (
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
          onClick={() => fetchProcesses(live)}
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
            No processes found
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr className="text-muted-foreground">
                <SortableHeader label="Name" sortKey="name" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHeader label="PID" sortKey="pid" active={sortKey} dir={sortDir} onSort={handleSort} className="w-16" />
                <th className="text-left px-4 py-2 font-medium w-20">Status</th>
                <th className="text-left px-4 py-2 font-medium w-24">User</th>
                <SortableHeader label="Memory" sortKey="memoryMB" active={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                <SortableHeader label="Virtual" sortKey="virtualMB" active={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                {live && (
                  <SortableHeader label="CPU %" sortKey="cpuPercent" active={sortKey} dir={sortDir} onSort={handleSort} className="w-16" />
                )}
                <SortableHeader label="Started" sortKey="started" active={sortKey} dir={sortDir} onSort={handleSort} className="w-20" />
                <th className="text-left px-4 py-2 font-medium">Command</th>
                <th className="w-16 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => {
                const isConfirming = confirmingPid === entry.pid;
                return (
                  <tr
                    key={`${entry.pid}-${idx}`}
                    className={[
                      'group border-b border-border/50 hover:bg-muted/40 transition-colors',
                      isConfirming ? 'bg-destructive/10' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="px-4 py-1.5 font-medium">{entry.name}</td>
                    <td className="px-4 py-1.5 font-mono text-muted-foreground">{entry.pid}</td>
                    <td className="px-4 py-1.5 text-muted-foreground">{entry.status || '—'}</td>
                    <td className="px-4 py-1.5 text-muted-foreground truncate max-w-[96px]">{entry.user || '—'}</td>
                    <td className="px-4 py-1.5 font-mono">{entry.memoryMB.toFixed(1)} MB</td>
                    <td className="px-4 py-1.5 font-mono text-muted-foreground">{entry.virtualMB.toFixed(1)} MB</td>
                    {live && (
                      <td className="px-4 py-1.5 font-mono">
                        {showCpu ? `${entry.cpuPercent.toFixed(1)}%` : '—'}
                      </td>
                    )}
                    <td className="px-4 py-1.5 text-muted-foreground">{formatRelativeTime(entry.started)}</td>
                    <td
                      className="px-4 py-1.5 text-muted-foreground max-w-[240px] truncate"
                      title={entry.command}
                    >
                      {entry.command || '—'}
                    </td>
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


function SortableHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={`text-left px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {isActive ? (
          dir === 'asc'
            ? <ChevronUp className="size-3" />
            : <ChevronDown className="size-3" />
        ) : (
          <ChevronDown className="size-3 opacity-20" />
        )}
      </span>
    </th>
  );
}
