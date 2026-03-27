import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { RefreshCw, X, Check, Skull, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

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
    if (key === 'name') cmp = a.name.localeCompare(b.name);
    else if (key === 'started') cmp = new Date(a.started).getTime() - new Date(b.started).getTime();
    else cmp = (a[key] as number) - (b[key] as number);
    return dir === 'asc' ? cmp : -cmp;
  });
}

interface ProcessRowProps {
  entry: ProcessEntry;
  isConfirming: boolean;
  showCpu: boolean;
  live: boolean;
  onKillClick: (pid: number) => void;
  onConfirm: (pid: number) => void;
  onCancel: () => void;
}

const ProcessRow = memo(function ProcessRow({ entry, isConfirming, showCpu, live, onKillClick, onConfirm, onCancel }: ProcessRowProps) {
  return (
    <tr
      className={[
        'group border-b border-border/50 hover:bg-muted/40 transition-colors',
        isConfirming ? 'bg-destructive/10' : '',
      ].filter(Boolean).join(' ')}
    >
      <td className="px-4 py-1.5 font-medium max-w-[160px] truncate" title={entry.name}>{entry.name}</td>
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
      <td className="px-4 py-1.5 text-muted-foreground max-w-[240px] truncate" title={entry.command}>
        {entry.command || '—'}
      </td>
      <td className="px-4 py-1.5">
        {isConfirming ? (
          <div className="flex items-center gap-1">
            <Button size="icon-xs" variant="destructive" onClick={() => onConfirm(entry.pid)} title="Confirm kill">
              <Check />
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={onCancel} title="Cancel">
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
}, (prev, next) => (
  prev.entry.pid === next.entry.pid &&
  prev.entry.name === next.entry.name &&
  prev.entry.status === next.entry.status &&
  prev.entry.memoryMB === next.entry.memoryMB &&
  prev.entry.virtualMB === next.entry.virtualMB &&
  prev.entry.cpuPercent === next.entry.cpuPercent &&
  prev.entry.started === next.entry.started &&
  prev.isConfirming === next.isConfirming &&
  prev.showCpu === next.showCpu &&
  prev.live === next.live
));


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
      if (isLiveFetch) setLiveSampleCount((n) => n + 1);
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

  useEffect(() => { if (!live) setLiveSampleCount(0); }, [live]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!live) return;
    intervalRef.current = setInterval(() => fetchProcesses(true), intervalSecs * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live, fetchProcesses, intervalSecs]);

  useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    const base = filter
      ? entries.filter((e) => e.name.toLowerCase().includes(lowerFilter) || String(e.pid).includes(filter))
      : entries;
    return sortEntries(base, sortKey, sortDir);
  }, [entries, filter, sortKey, sortDir]);

  const showCpu = live && liveSampleCount >= 2;

  const stableOnKillClick = useCallback((pid: number) => setConfirmingPid(pid), []);
  const stableOnCancel = useCallback(() => setConfirmingPid(null), []);
  const stableOnConfirm = useCallback((pid: number) => {
    setConfirmingPid(null);
    setEntries((prev) => prev.filter((e) => e.pid !== pid));
    window.electronAPI.process.kill(pid).then((result: { success: boolean; error?: string }) => {
      if (!result.success) setError(result.error ?? 'Kill failed');
      fetchProcesses();
    });
  }, [fetchProcesses]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">Process Monitor</span>
        <Input
          className="flex-1 min-w-32 h-7 text-xs"
          placeholder="Filter by name or PID..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLive((v) => !v)}
          className={live ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary' : ''}
          title={live ? 'Disable live CPU sampling' : 'Enable live CPU sampling'}
        >
          Live
        </Button>
        {live && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1 font-mono" />}>
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
          onClick={() => fetchProcesses(live)}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
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
          <RefreshCw className="size-4 animate-spin mr-2" /><span className="text-sm">Loading...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">No processes found</div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-muted-foreground">
                <SortableHeader label="Name" sortKey="name" active={sortKey} dir={sortDir} onSort={handleSort} className="max-w-[160px]" />
                <SortableHeader label="PID" sortKey="pid" active={sortKey} dir={sortDir} onSort={handleSort} className="w-16" />
                <th className="text-left px-4 py-2 font-medium w-20">Status</th>
                <th className="text-left px-4 py-2 font-medium w-24">User</th>
                <SortableHeader label="Memory" sortKey="memoryMB" active={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                <SortableHeader label="Virtual" sortKey="virtualMB" active={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                {live && <SortableHeader label="CPU %" sortKey="cpuPercent" active={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />}
                <SortableHeader label="Started" sortKey="started" active={sortKey} dir={sortDir} onSort={handleSort} className="w-20" />
                <th className="text-left px-4 py-2 font-medium">Command</th>
                <th className="w-16 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <ProcessRow
                  key={entry.pid}
                  entry={entry}
                  isConfirming={confirmingPid === entry.pid}
                  showCpu={showCpu}
                  live={live}
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


function SortableHeader({ label, sortKey, active, dir, onSort, className = '' }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir; onSort: (key: SortKey) => void; className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={`text-left px-4 py-2 font-medium cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {isActive ? (dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : <ChevronDown className="size-3 opacity-20" />}
      </span>
    </th>
  );
}
