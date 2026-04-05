import { useState } from 'react';
import { RefreshCw, Trash2, Check, X, Loader2, Scissors, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { DockerVolume } from './types';

type VolumeListProps = {
  volumes: DockerVolume[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (volume: DockerVolume) => void;
};

export function VolumeList({ volumes, loading, onRefresh, onSelect }: VolumeListProps) {
  const [confirmingName, setConfirmingName] = useState<string | null>(null);
  const [pendingNames, setPendingNames] = useState<Set<string>>(new Set());
  const [pruning, setPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const setPending = (name: string, on: boolean) => {
    setPendingNames((prev) => {
      const next = new Set(prev);
      on ? next.add(name) : next.delete(name);
      return next;
    });
  };

  const handleRemove = async (name: string) => {
    setPending(name, true);
    setConfirmingName(null);
    try {
      await window.electronAPI.docker.removeVolume(name);
    } finally {
      setPending(name, false);
      onRefresh();
    }
  };

  const handlePrune = async () => {
    setPruning(true);
    setPruneResult(null);
    try {
      const result = await window.electronAPI.docker.pruneVolumes();
      if ('output' in result) {
        const match = result.output.match(/Total reclaimed space: (.+)/);
        setPruneResult(match ? `Reclaimed ${match[1]}` : 'Done');
      }
    } finally {
      setPruning(false);
      onRefresh();
      setTimeout(() => setPruneResult(null), 4000);
    }
  };

  const filtered = filter
    ? volumes.filter((v) => v.Name.toLowerCase().includes(filter.toLowerCase()))
    : volumes;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Volumes
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          ({volumes.length})
        </span>
        <div className="flex-1 min-w-0">
          <input
            className="w-full max-w-48 bg-muted/40 border border-border/60 rounded px-2 py-0.5 text-xs outline-none focus:border-ring placeholder:text-muted-foreground/50"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {pruneResult && (
          <span className="text-[10px] text-green-400">{pruneResult}</span>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handlePrune}
          disabled={pruning}
          title="Prune unused volumes"
        >
          <Scissors className={cn('size-3', pruning && 'animate-pulse')} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            {filter ? 'No volumes match your filter' : 'No volumes found'}
          </div>
        )}
        {loading && volumes.length === 0 && (
          <div className="flex items-center justify-center h-32 gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading...
          </div>
        )}
        {filtered.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Driver</th>
                <th className="px-4 py-2 text-left font-medium">Mount Point</th>
                <th className="px-4 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((vol) => {
                const isPending = pendingNames.has(vol.Name);
                const isConfirming = confirmingName === vol.Name;

                return (
                  <tr
                    key={vol.Name}
                    className={cn(
                      'border-b border-border/50 transition-colors cursor-pointer',
                      isConfirming ? 'bg-destructive/10' : 'hover:bg-muted/40',
                    )}
                    onClick={() => { if (!isConfirming) onSelect(vol); }}
                  >
                    <td className="px-4 py-2 font-medium max-w-40">
                      <span className="truncate block font-mono text-[11px]" title={vol.Name}>
                        {vol.Name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{vol.Driver}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-[10px] max-w-64">
                      <span className="truncate block" title={vol.Mountpoint}>
                        {vol.Mountpoint || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon-xs"
                            variant="destructive"
                            onClick={() => handleRemove(vol.Name)}
                            title="Confirm remove"
                          >
                            <Check className="size-3" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => setConfirmingName(null)}
                            title="Cancel"
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : isPending ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Remove volume"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmingName(vol.Name)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                          <ChevronRight className="size-3 text-muted-foreground/40" />
                        </div>
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
