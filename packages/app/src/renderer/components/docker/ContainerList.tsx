import { useState, useCallback } from 'react';
import {
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { DockerContainer, ContainerState } from './types';

type ContainerListProps = {
  containers: DockerContainer[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (container: DockerContainer) => void;
};

export function StateIndicator({ state }: { state: ContainerState }) {
  if (state === 'running') {
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
        <span className="relative inline-flex rounded-full size-2 bg-green-400" />
      </span>
    );
  }
  if (state === 'paused') return <span className="size-2 rounded-full bg-yellow-400 shrink-0" />;
  if (state === 'restarting') return <span className="size-2 rounded-full bg-blue-400 shrink-0 animate-pulse" />;
  return <span className="size-2 rounded-full bg-muted-foreground/40 shrink-0" />;
}

function parsePorts(ports: string): string {
  if (!ports) return '—';
  const bindings = ports
    .split(', ')
    .filter((p) => p.includes('->'))
    .map((p) => {
      const match = p.match(/:(\d+)->/);
      return match ? match[1] : p;
    });
  if (bindings.length === 0) return '—';
  if (bindings.length > 3) return `${bindings.slice(0, 3).join(', ')} +${bindings.length - 3}`;
  return bindings.join(', ');
}

export function ContainerList({
  containers,
  loading,
  onRefresh,
  onSelect,
}: ContainerListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const setPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  const doAction = useCallback(
    async (id: string, action: () => Promise<{ success?: boolean; error?: string }>) => {
      setPending(id, true);
      try { await action(); } finally {
        setPending(id, false);
        onRefresh();
      }
    },
    [onRefresh],
  );

  const filtered = filter
    ? containers.filter(
        (c) =>
          c.Names.toLowerCase().includes(filter.toLowerCase()) ||
          c.Image.toLowerCase().includes(filter.toLowerCase()),
      )
    : containers;

  const running = containers.filter((c) => c.State === 'running').length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Containers
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {running}/{containers.length} running
        </span>
        <div className="flex-1 min-w-0">
          <input
            className="w-full max-w-48 bg-muted/40 border border-border/60 rounded px-2 py-0.5 text-xs outline-none focus:border-ring placeholder:text-muted-foreground/50"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onRefresh} disabled={loading} title="Refresh">
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && containers.length === 0 && (
          <div className="flex items-center justify-center h-32 gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            {filter ? 'No containers match your filter' : 'No containers found'}
          </div>
        )}
        {filtered.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground sticky top-0 bg-background">
                <th className="w-5 px-3 py-2" />
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Image</th>
                <th className="px-3 py-2 text-left font-medium">Ports</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const name = c.Names.replace(/^\//, '');
                const isRunning = c.State === 'running';
                const isPending = pendingIds.has(c.ID);
                const isConfirming = confirmingId === c.ID;

                return (
                  <tr
                    key={c.ID}
                    className={cn(
                      'border-b border-border/50 transition-colors cursor-pointer',
                      isConfirming ? 'bg-destructive/10' : 'hover:bg-muted/40',
                    )}
                    onClick={() => {
                      if (!isConfirming) onSelect(c);
                    }}
                  >
                    {/* State dot */}
                    <td className="px-3 py-2.5">
                      <StateIndicator state={c.State} />
                    </td>

                    {/* Name + ID */}
                    <td className="px-3 py-2.5 max-w-40">
                      <div className="font-medium truncate" title={name}>{name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{c.ID.slice(0, 12)}</div>
                    </td>

                    {/* Image */}
                    <td className="px-3 py-2.5 text-muted-foreground max-w-40">
                      <span className="truncate block" title={c.Image}>{c.Image}</span>
                    </td>

                    {/* Ports */}
                    <td className="px-3 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                      {parsePorts(c.Ports)}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {c.Status}
                    </td>

                    {/* Actions */}
                    <td
                      className="px-3 py-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isPending ? (
                        <div className="flex justify-end">
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        </div>
                      ) : isConfirming ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[10px] text-muted-foreground mr-1">Remove?</span>
                          <Button
                            size="icon-xs"
                            variant="destructive"
                            title="Confirm"
                            onClick={() => {
                              setConfirmingId(null);
                              doAction(c.ID, () =>
                                window.electronAPI.docker.removeContainer(c.ID, !isRunning),
                              );
                            }}
                          >
                            <Check className="size-3" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Cancel"
                            onClick={() => setConfirmingId(null)}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {/* Lifecycle */}
                          {isRunning ? (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Stop"
                              onClick={() =>
                                doAction(c.ID, () => window.electronAPI.docker.stopContainer(c.ID))
                              }
                            >
                              <Square className="size-3" />
                            </Button>
                          ) : (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Start"
                              onClick={() =>
                                doAction(c.ID, () => window.electronAPI.docker.startContainer(c.ID))
                              }
                            >
                              <Play className="size-3" />
                            </Button>
                          )}
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Restart"
                            onClick={() =>
                              doAction(c.ID, () => window.electronAPI.docker.restartContainer(c.ID))
                            }
                          >
                            <RotateCcw className="size-3" />
                          </Button>

                          {/* Separator */}
                          <div className="w-px h-3 bg-border mx-0.5" />

                          {/* Destructive */}
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Remove"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmingId(c.ID)}
                          >
                            <Trash2 className="size-3" />
                          </Button>

                          {/* Open chevron */}
                          <ChevronRight className="size-3 text-muted-foreground/40 ml-1" />
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
