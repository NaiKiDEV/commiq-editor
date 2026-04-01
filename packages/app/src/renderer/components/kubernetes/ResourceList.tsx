import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, Eye, ScrollText, Trash2, Search, X, TerminalSquare, WifiOff, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { K8sResource, K8sWatchEvent, ResourceKind } from './types';

type ResourceListProps = {
  context: string;
  namespace: string | undefined;
  kind: ResourceKind;
  onSelect: (resource: K8sResource) => void;
  onOpenLogs: (resource: K8sResource) => void;
  onOpenShell?: (resource: K8sResource) => void;
};

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running' || s === 'ready' || s === 'active' || s === 'bound' || s === 'complete' || s === 'succeeded')
    return 'text-green-400';
  if (s === 'pending' || s === 'progressing' || s === 'containercreating')
    return 'text-yellow-400';
  if (s === 'failed' || s === 'error' || s === 'crashloopbackoff' || s === 'notready' || s === 'imagepullbackoff')
    return 'text-red-400';
  if (s === 'terminating' || s === 'evicted')
    return 'text-orange-400';
  if (s === 'suspended')
    return 'text-muted-foreground';
  return 'text-foreground';
}

function statusBg(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running' || s === 'ready' || s === 'active' || s === 'bound' || s === 'complete' || s === 'succeeded')
    return 'bg-green-400/10';
  if (s === 'pending' || s === 'progressing' || s === 'containercreating')
    return 'bg-yellow-400/10';
  if (s === 'failed' || s === 'error' || s === 'crashloopbackoff' || s === 'notready' || s === 'imagepullbackoff')
    return 'bg-red-400/10';
  if (s === 'terminating' || s === 'evicted')
    return 'bg-orange-400/10';
  return 'bg-muted/50';
}

function statusDot(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running' || s === 'ready' || s === 'active' || s === 'bound' || s === 'complete' || s === 'succeeded')
    return 'bg-green-400';
  if (s === 'pending' || s === 'progressing' || s === 'containercreating')
    return 'bg-yellow-400';
  if (s === 'failed' || s === 'error' || s === 'crashloopbackoff' || s === 'notready' || s === 'imagepullbackoff')
    return 'bg-red-400';
  if (s === 'terminating' || s === 'evicted')
    return 'bg-orange-400';
  return 'bg-muted-foreground';
}

function formatAge(createdAt: string): string {
  if (!createdAt) return '-';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

type Column = { key: string; label: string; accessor: (r: K8sResource) => string; align?: 'right' };

function getColumns(kind: ResourceKind): Column[] {
  const name: Column = { key: 'name', label: 'Name', accessor: (r) => r.name };
  const ns: Column = { key: 'namespace', label: 'Namespace', accessor: (r) => r.namespace ?? '-' };
  const status: Column = { key: 'status', label: 'Status', accessor: (r) => r.status };
  const age: Column = { key: 'age', label: 'Age', accessor: (r) => formatAge(r.createdAt), align: 'right' };

  switch (kind) {
    case 'pods':
      return [
        name, ns,
        { key: 'ready', label: 'Ready', accessor: (r) => r.ready ?? '-', align: 'right' },
        status,
        { key: 'restarts', label: 'Restarts', accessor: (r) => String(r.restarts ?? 0), align: 'right' },
        age,
      ];
    case 'deployments':
    case 'statefulsets':
    case 'daemonsets':
      return [
        name, ns,
        { key: 'ready', label: 'Ready', accessor: (r) => r.ready ?? '-', align: 'right' },
        status, age,
      ];
    case 'services':
      return [
        name, ns,
        { key: 'type', label: 'Type', accessor: (r) => r.status },
        age,
      ];
    case 'nodes':
      return [name, status, age];
    case 'namespaces':
      return [name, status, age];
    default:
      return [name, ns, status, age];
  }
}

export function ResourceList({ context, namespace, kind, onSelect, onOpenLogs, onOpenShell }: ResourceListProps) {
  const [resources, setResources] = useState<Map<string, K8sResource>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [confirmingUid, setConfirmingUid] = useState<string | null>(null);

  // Ref holds the teardown for whichever watch is currently active,
  // so the Refresh button can stop it without stale-closure issues.
  const cleanupRef = useRef<(() => void) | null>(null);

  const loadAndWatch = useCallback(() => {
    // Stop any existing watch before starting a new one
    cleanupRef.current?.();
    cleanupRef.current = null;

    setLoading(true);
    setError(null);
    setResources(new Map());

    window.electronAPI.k8s.list(context, kind, namespace).then((result) => {
      if ('error' in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      const map = new Map<string, K8sResource>();
      for (const item of result as K8sResource[]) {
        map.set(item.uid, item);
      }
      setResources(map);
      setLoading(false);
    });

    const newWatchId = crypto.randomUUID();

    const unsubscribe = window.electronAPI.k8s.onWatchEvent(newWatchId, (evt) => {
      const event = evt as K8sWatchEvent;
      setResources((prev) => {
        const next = new Map(prev);
        if (event.type === 'DELETED') {
          next.delete(event.resource.uid);
        } else if (event.type === 'ADDED' || event.type === 'MODIFIED') {
          next.set(event.resource.uid, event.resource);
        }
        return next;
      });
    });

    window.electronAPI.k8s.watchStart(context, kind, newWatchId, namespace);

    const cleanup = () => {
      unsubscribe();
      window.electronAPI.k8s.watchStop(newWatchId);
    };
    cleanupRef.current = cleanup;
    return cleanup;
  }, [context, namespace, kind]);

  useEffect(() => {
    setFilter('');
    setShowFilter(false);
    const cleanup = loadAndWatch();
    return () => {
      cleanup();
      cleanupRef.current = null;
    };
  }, [loadAndWatch]);

  const columns = useMemo(() => getColumns(kind), [kind]);

  const sortedResources = useMemo(() => {
    let items = Array.from(resources.values());
    if (filter) {
      const lower = filter.toLowerCase();
      items = items.filter((r) =>
        r.name.toLowerCase().includes(lower) ||
        (r.namespace?.toLowerCase().includes(lower) ?? false) ||
        r.status.toLowerCase().includes(lower)
      );
    }
    return items.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [resources, filter]);

  const handleDeleteClick = useCallback((e: React.MouseEvent, resource: K8sResource) => {
    e.stopPropagation();
    setConfirmingUid(resource.uid);
  }, []);

  const handleDeleteConfirm = useCallback(async (e: React.MouseEvent, resource: K8sResource) => {
    e.stopPropagation();
    setConfirmingUid(null);
    await window.electronAPI.k8s.deletePod(
      context,
      resource.namespace ?? 'default',
      resource.name,
    );
  }, [context]);

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingUid(null);
  }, []);

  // Status summary counts
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of resources.values()) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [resources]);

  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold">{kindLabel}</h2>
          {/* Status summary pills */}
          <div className="flex items-center gap-1.5">
            {statusCounts.map(([status, count]) => (
              <span
                key={status}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                  statusBg(status),
                  statusColor(status),
                )}
              >
                <span className={cn('size-1.5 rounded-full', statusDot(status))} />
                {count} {status}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showFilter ? (
            <div className="flex items-center gap-1 border border-border rounded-md px-2 py-0.5 bg-background">
              <Search className="size-3 text-muted-foreground" />
              <input
                className="bg-transparent text-xs outline-none w-32 placeholder:text-muted-foreground/60"
                placeholder="Filter..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
              {filter && (
                <button onClick={() => setFilter('')} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              )}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowFilter(true)}
              title="Filter"
            >
              <Search className="size-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => loadAndWatch()}
            title="Refresh"
          >
            <RefreshCw className="size-3" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-xs">Loading {kind}...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 px-6">
            <WifiOff className="size-6 text-muted-foreground/40" />
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-foreground/70">Cluster unreachable</p>
              <p className="text-[10px] text-muted-foreground/60 max-w-sm break-all">{error}</p>
            </div>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => loadAndWatch()}>
              <RefreshCw className="size-3 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : sortedResources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
            <span className="text-xs">
              {filter ? `No ${kind} matching "${filter}"` : `No ${kind} found`}
            </span>
            {filter && (
              <button onClick={() => setFilter('')} className="text-[10px] text-teal-400 hover:underline">
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background/70 backdrop-blur-sm border-b border-border z-10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {sortedResources.map((resource) => (
                <tr
                  key={resource.uid}
                  className={cn(
                    'group border-b border-border/30 hover:bg-accent/40 cursor-pointer transition-colors',
                    confirmingUid === resource.uid && 'bg-destructive/10 hover:bg-destructive/15',
                  )}
                  onClick={() => onSelect(resource)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-2 truncate max-w-xs',
                        col.align === 'right' && 'text-right tabular-nums',
                        col.key === 'name' && 'font-medium text-foreground',
                        col.key !== 'name' && col.key !== 'status' && 'text-muted-foreground',
                      )}
                    >
                      {col.key === 'status' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn('size-1.5 rounded-full shrink-0', statusDot(col.accessor(resource)))} />
                          <span className={statusColor(col.accessor(resource))}>
                            {col.accessor(resource)}
                          </span>
                        </span>
                      ) : col.key === 'restarts' ? (
                        <span className={cn(
                          (resource.restarts ?? 0) > 0 && 'text-yellow-400',
                          (resource.restarts ?? 0) > 10 && 'text-red-400',
                        )}>
                          {col.accessor(resource)}
                        </span>
                      ) : (
                        col.accessor(resource)
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className={cn(
                      'flex items-center justify-end gap-0.5 transition-opacity',
                      confirmingUid === resource.uid ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}>
                      {confirmingUid === resource.uid ? (
                        <>
                          <Button
                            variant="destructive"
                            size="icon-xs"
                            onClick={(e) => handleDeleteConfirm(e, resource)}
                            title="Confirm delete"
                          >
                            <Check className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={handleDeleteCancel}
                            title="Cancel"
                          >
                            <X className="size-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(resource);
                            }}
                            title="View details"
                          >
                            <Eye className="size-3" />
                          </Button>
                          {kind === 'pods' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenLogs(resource);
                                }}
                                title="View logs"
                              >
                                <ScrollText className="size-3" />
                              </Button>
                              {onOpenShell && (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenShell(resource);
                                  }}
                                  title="Shell into pod"
                                >
                                  <TerminalSquare className="size-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(e) => handleDeleteClick(e, resource)}
                                title="Delete pod"
                                className="hover:text-red-400"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
