import { useState } from 'react';
import { RefreshCw, Trash2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { DockerNetwork } from './types';

type NetworkListProps = {
  networks: DockerNetwork[];
  loading: boolean;
  onRefresh: () => void;
};

const BUILT_IN = new Set(['bridge', 'host', 'none']);

export function NetworkList({ networks, loading, onRefresh }: NetworkListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const setPending = (id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleRemove = async (id: string) => {
    setPending(id, true);
    setConfirmingId(null);
    try {
      await window.electronAPI.docker.removeNetwork(id);
    } finally {
      setPending(id, false);
      onRefresh();
    }
  };

  const filtered = filter
    ? networks.filter(
        (n) =>
          n.Name.toLowerCase().includes(filter.toLowerCase()) ||
          n.Driver.toLowerCase().includes(filter.toLowerCase()),
      )
    : networks;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Networks
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          ({networks.length})
        </span>
        <div className="flex-1 min-w-0">
          <input
            className="w-full max-w-48 bg-muted/40 border border-border/60 rounded px-2 py-0.5 text-xs outline-none focus:border-ring placeholder:text-muted-foreground/50"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
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
            {filter ? 'No networks match your filter' : 'No networks found'}
          </div>
        )}
        {loading && networks.length === 0 && (
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
                <th className="px-4 py-2 text-left font-medium">ID</th>
                <th className="px-4 py-2 text-left font-medium">Driver</th>
                <th className="px-4 py-2 text-left font-medium">Scope</th>
                <th className="px-4 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((net) => {
                const isBuiltIn = BUILT_IN.has(net.Name);
                const isPending = pendingIds.has(net.ID);
                const isConfirming = confirmingId === net.ID;

                return (
                  <tr
                    key={net.ID}
                    className={cn(
                      'group border-b border-border/50 hover:bg-muted/40 transition-colors',
                      isConfirming && 'bg-destructive/10',
                    )}
                  >
                    <td className="px-4 py-2 font-medium">
                      <div className="flex items-center gap-1.5">
                        {net.Name}
                        {isBuiltIn && (
                          <span className="text-[9px] text-muted-foreground/60 bg-muted px-1 rounded">
                            built-in
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">
                      {net.ID.slice(0, 12)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{net.Driver}</td>
                    <td className="px-4 py-2 text-muted-foreground">{net.Scope}</td>
                    <td className="px-4 py-2">
                      {isBuiltIn ? null : isConfirming ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon-xs"
                            variant="destructive"
                            onClick={() => handleRemove(net.ID)}
                            title="Confirm remove"
                          >
                            <Check className="size-3" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => setConfirmingId(null)}
                            title="Cancel"
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : isPending ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      ) : (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Remove network"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmingId(net.ID)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
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
