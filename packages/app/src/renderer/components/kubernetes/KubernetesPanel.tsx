import { useEffect, useState, useCallback } from 'react';
import {
  ChevronDown,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Server,
  Box,
  Network,
  Database,
  CircleDot,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ResourceList } from './ResourceList';
import { ResourceDetail } from './ResourceDetail';
import { PodLogs } from './PodLogs';
import { PodShell } from './PodShell';
import {
  CLUSTER_SCOPED,
  type K8sContext,
  type K8sResource,
  type ResourceKind,
} from './types';

type View =
  | { type: 'list' }
  | { type: 'detail'; resource: K8sResource }
  | { type: 'logs'; resource: K8sResource }
  | { type: 'shell'; resource: K8sResource };

const SIDEBAR_CATEGORIES: {
  label: string;
  icon: React.ReactNode;
  color: string;
  items: { kind: ResourceKind; label: string }[];
}[] = [
  {
    label: 'Cluster',
    icon: <Server className="size-3" />,
    color: 'text-info',
    items: [
      { kind: 'nodes', label: 'Nodes' },
      { kind: 'namespaces', label: 'Namespaces' },
    ],
  },
  {
    label: 'Workloads',
    icon: <Box className="size-3" />,
    color: 'text-primary',
    items: [
      { kind: 'pods', label: 'Pods' },
      { kind: 'deployments', label: 'Deployments' },
      { kind: 'statefulsets', label: 'StatefulSets' },
      { kind: 'daemonsets', label: 'DaemonSets' },
      { kind: 'jobs', label: 'Jobs' },
      { kind: 'cronjobs', label: 'CronJobs' },
    ],
  },
  {
    label: 'Network',
    icon: <Network className="size-3" />,
    color: 'text-success',
    items: [
      { kind: 'services', label: 'Services' },
      { kind: 'ingresses', label: 'Ingresses' },
    ],
  },
  {
    label: 'Config & Storage',
    icon: <Database className="size-3" />,
    color: 'text-warning',
    items: [
      { kind: 'configmaps', label: 'ConfigMaps' },
      { kind: 'secrets', label: 'Secrets' },
      { kind: 'pvcs', label: 'PVCs' },
      { kind: 'pvs', label: 'PVs' },
    ],
  },
];

export function KubernetesPanel({ panelId: _panelId }: { panelId: string }) {
  const [contexts, setContexts] = useState<K8sContext[]>([]);
  const [activeContext, setActiveContext] = useState<string | null>(null);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [activeNamespace, setActiveNamespace] = useState<string>('default');
  const [selectedKind, setSelectedKind] = useState<ResourceKind>('pods');
  const [view, setView] = useState<View>({ type: 'list' });
  const [error, setError] = useState<string | null>(null);
  const [loadingContexts, setLoadingContexts] = useState(true);

  useEffect(() => {
    setLoadingContexts(true);
    window.electronAPI.k8s.contexts()
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
        } else {
          setContexts(result.contexts);
          setActiveContext(result.currentContext);
        }
        setLoadingContexts(false);
      })
      .catch(() => setLoadingContexts(false));
  }, []);

  useEffect(() => {
    if (!activeContext) return;
    window.electronAPI.k8s.namespaces(activeContext)
      .then((ns) => {
        setNamespaces(ns);
        if (ns.length > 0 && !ns.includes(activeNamespace)) {
          setActiveNamespace(ns.includes('default') ? 'default' : ns[0]);
        }
      })
      .catch(() => {});
  }, [activeContext]);

  const handleContextChange = useCallback((name: string) => {
    setActiveContext(name);
    setView({ type: 'list' });
    setSelectedKind('pods');
  }, []);

  const handleNamespaceChange = useCallback((ns: string) => {
    setActiveNamespace(ns);
    setView({ type: 'list' });
  }, []);

  const handleKindChange = useCallback((kind: ResourceKind) => {
    setSelectedKind(kind);
    setView({ type: 'list' });
  }, []);

  const handleSelectResource = useCallback((resource: K8sResource) => {
    setView({ type: 'detail', resource });
  }, []);

  const handleOpenLogs = useCallback((resource: K8sResource) => {
    setView({ type: 'logs', resource });
  }, []);

  const handleOpenShell = useCallback((resource: K8sResource) => {
    setView({ type: 'shell', resource });
  }, []);

  const handleBack = useCallback(() => {
    setView({ type: 'list' });
  }, []);

  const handleRefreshContexts = useCallback(() => {
    setLoadingContexts(true);
    setError(null);
    window.electronAPI.k8s.reloadConfig().then(() =>
      window.electronAPI.k8s.contexts()
    ).then((result) => {
      if ('error' in result) {
        setError(result.error);
      } else {
        setContexts(result.contexts);
        if (!result.contexts.find((c) => c.name === activeContext)) {
          setActiveContext(result.currentContext);
        }
      }
      setLoadingContexts(false);
    });
  }, [activeContext]);

  if (loadingContexts) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-xs">Loading kubeconfig...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-3">
        <AlertTriangle className="size-8 text-yellow-500" />
        <p className="text-xs max-w-md text-center">Failed to load kubeconfig: {error}</p>
        <Button variant="outline" size="sm" onClick={handleRefreshContexts}>
          <RefreshCw className="size-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  const isClusterScoped = CLUSTER_SCOPED.has(selectedKind);

  return (
    <div className="flex h-full bg-background text-foreground text-sm">
      {/* Sidebar */}
      <div className="w-48 shrink-0 border-r border-border flex flex-col overflow-hidden bg-muted/20">
        {/* Context & namespace pickers */}
        <div className="p-2.5 space-y-2 border-b border-border">
          {/* Context */}
          <div>
            <div className="flex items-center justify-between mb-1 px-0.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                Context
              </label>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Reload kubeconfig"
                onClick={handleRefreshContexts}
              >
                <RefreshCw className="size-3" />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="flex items-center justify-between w-full px-2 py-1.5 text-xs rounded-md border border-border/60 bg-background hover:border-border transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CircleDot className="size-2.5 text-green-400 shrink-0" />
                      <span className="truncate font-medium">{activeContext ?? 'Select...'}</span>
                    </div>
                    <ChevronDown className="size-3 shrink-0 ml-1 text-muted-foreground" />
                  </button>
                }
              />
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-44">
                {contexts.map((ctx) => (
                  <DropdownMenuItem
                    key={ctx.name}
                    onClick={() => handleContextChange(ctx.name)}
                    className={cn(ctx.name === activeContext && 'bg-accent')}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate text-xs">{ctx.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{ctx.cluster}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Namespace */}
          {!isClusterScoped && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1 block px-0.5">
                Namespace
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button className="flex items-center justify-between w-full px-2 py-1.5 text-xs rounded-md border border-border/60 bg-background hover:border-border transition-colors">
                      <span className="truncate">{activeNamespace === '_all' ? 'All Namespaces' : activeNamespace}</span>
                      <ChevronDown className="size-3 shrink-0 ml-1 text-muted-foreground" />
                    </button>
                  }
                />
                <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-44">
                  <DropdownMenuItem
                    onClick={() => handleNamespaceChange('_all')}
                    className={cn(activeNamespace === '_all' && 'bg-accent')}
                  >
                    <span className="text-xs italic">All Namespaces</span>
                  </DropdownMenuItem>
                  {namespaces.map((ns) => (
                    <DropdownMenuItem
                      key={ns}
                      onClick={() => handleNamespaceChange(ns)}
                      className={cn(ns === activeNamespace && 'bg-accent')}
                    >
                      {ns}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Resource categories */}
        <div className="flex-1 overflow-y-auto py-1">
          {SIDEBAR_CATEGORIES.map((category) => (
            <div key={category.label} className="mb-1">
              <div className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium', category.color)}>
                {category.icon}
                {category.label}
              </div>
              {category.items.map((item) => (
                <button
                  key={item.kind}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-xs transition-colors rounded-sm mx-0',
                    selectedKind === item.kind
                      ? 'bg-accent/80 text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                  onClick={() => handleKindChange(item.kind)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeContext && view.type === 'list' && (
          <ResourceList
            context={activeContext}
            namespace={isClusterScoped ? undefined : activeNamespace === '_all' ? undefined : activeNamespace}
            kind={selectedKind}
            onSelect={handleSelectResource}
            onOpenLogs={handleOpenLogs}
            onOpenShell={selectedKind === 'pods' ? handleOpenShell : undefined}
          />
        )}
        {activeContext && view.type === 'detail' && (
          <ResourceDetail
            context={activeContext}
            resource={view.resource}
            kind={selectedKind}
            onBack={handleBack}
            onOpenLogs={
              selectedKind === 'pods'
                ? () => handleOpenLogs(view.resource)
                : undefined
            }
            onOpenShell={
              selectedKind === 'pods'
                ? () => handleOpenShell(view.resource)
                : undefined
            }
            onDeleted={handleBack}
          />
        )}
        {activeContext && view.type === 'logs' && (
          <PodLogs
            context={activeContext}
            namespace={view.resource.namespace ?? 'default'}
            podName={view.resource.name}
            onBack={handleBack}
          />
        )}
        {activeContext && view.type === 'shell' && (
          <PodShell
            context={activeContext}
            namespace={view.resource.namespace ?? 'default'}
            podName={view.resource.name}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}
