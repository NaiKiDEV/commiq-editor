import { useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, ScrollText, Trash2, Copy, Check, Tag, Clock, Hash, Box, Shield,
  TerminalSquare, Search, X, KeyRound, HardDrive, Globe, Activity, Layers,
  CalendarClock, MapPin, Eye, EyeOff,
} from 'lucide-react';
import * as yaml from 'js-yaml';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { K8sResource, ResourceKind } from './types';

type ResourceDetailProps = {
  context: string;
  resource: K8sResource;
  kind: ResourceKind;
  onBack: () => void;
  onOpenLogs?: () => void;
  onOpenShell?: () => void;
  onDeleted: () => void;
};

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running' || s === 'ready' || s === 'active' || s === 'bound' || s === 'complete' || s === 'succeeded')
    return 'text-green-400';
  if (s === 'pending' || s === 'progressing' || s === 'containercreating')
    return 'text-yellow-400';
  if (s === 'failed' || s === 'error' || s === 'crashloopbackoff' || s === 'notready')
    return 'text-red-400';
  if (s === 'terminating' || s === 'evicted')
    return 'text-orange-400';
  return 'text-muted-foreground';
}

function statusDot(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running' || s === 'ready' || s === 'active' || s === 'bound' || s === 'complete' || s === 'succeeded')
    return 'bg-green-400';
  if (s === 'pending' || s === 'progressing' || s === 'containercreating')
    return 'bg-yellow-400';
  if (s === 'failed' || s === 'error' || s === 'crashloopbackoff' || s === 'notready')
    return 'bg-red-400';
  if (s === 'terminating' || s === 'evicted')
    return 'bg-orange-400';
  return 'bg-muted-foreground';
}

function formatAge(createdAt: string): string {
  if (!createdAt) return '-';
  const date = new Date(createdAt);
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h ago`;
  const minutes = Math.floor(diffMs / (1000 * 60));
  return `${minutes}m ago`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function probeToString(probe: any): string {
  if (!probe) return '';
  if (probe.httpGet) {
    const path = probe.httpGet.path ?? '/';
    return `HTTP GET :${probe.httpGet.port}${path}`;
  }
  if (probe.tcpSocket) return `TCP :${probe.tcpSocket.port}`;
  if (probe.exec) return `exec: ${(probe.exec.command as string[]).join(' ')}`;
  if (probe.grpc) return `gRPC :${probe.grpc.port}`;
  return 'configured';
}

/**
 * Formats a Kubernetes quantity string into a human-readable form.
 * e.g. "16411872Ki" → "15.6Gi", "8000m" → "8", "256Mi" → "256Mi"
 */
function formatQuantity(value: string): string {
  if (!value || value === '0') return value;

  const match = value.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E|m)?$/);
  if (!match) return value;

  const num = parseFloat(match[1]);
  const suffix = match[2] ?? '';

  if (num === 0) return '0';

  // CPU millicores → cores when >= 1000m
  if (suffix === 'm') {
    if (num >= 1000) {
      const cores = num / 1000;
      return Number.isInteger(cores) ? `${cores}` : `${parseFloat(cores.toFixed(2))}`;
    }
    return value;
  }

  const toBytes: Record<string, number> = {
    '': 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
    Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6,
  };
  if (!(suffix in toBytes)) return value;

  const bytes = num * toBytes[suffix];
  const binaryUnits: [string, number][] = [
    ['Ei', 1024 ** 6], ['Pi', 1024 ** 5], ['Ti', 1024 ** 4],
    ['Gi', 1024 ** 3], ['Mi', 1024 ** 2], ['Ki', 1024],
  ];

  for (const [unit, multiplier] of binaryUnits) {
    const converted = bytes / multiplier;
    if (converted >= 1) {
      if (Number.isInteger(converted)) return `${converted}${unit}`;
      const rounded = Math.round(converted * 10) / 10;
      return `${rounded}${unit}`;
    }
  }

  return `${Math.round(bytes)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getVolumeType(vol: any): string {
  if (vol.configMap) return 'ConfigMap';
  if (vol.secret) return 'Secret';
  if (vol.persistentVolumeClaim) return 'PVC';
  if (vol.emptyDir) return 'EmptyDir';
  if (vol.hostPath) return 'HostPath';
  if (vol.nfs) return 'NFS';
  if (vol.projected) return 'Projected';
  if (vol.downwardAPI) return 'DownwardAPI';
  if (vol.csi) return 'CSI';
  if (vol.azureDisk) return 'AzureDisk';
  if (vol.awsElasticBlockStore) return 'EBS';
  if (vol.gcePersistentDisk) return 'GCE PD';
  return 'Other';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getVolumeSource(vol: any): string {
  if (vol.configMap) return vol.configMap.name;
  if (vol.secret) return vol.secret.secretName;
  if (vol.persistentVolumeClaim) return vol.persistentVolumeClaim.claimName;
  if (vol.emptyDir) return vol.emptyDir.medium ? `medium: ${vol.emptyDir.medium}` : '';
  if (vol.hostPath) return vol.hostPath.path;
  if (vol.nfs) return `${vol.nfs.server}:${vol.nfs.path}`;
  if (vol.csi) return vol.csi.driver;
  return '';
}

export function ResourceDetail({
  context,
  resource,
  kind,
  onBack,
  onOpenLogs,
  onOpenShell,
  onDeleted,
}: ResourceDetailProps) {
  const [tab, setTab] = useState<'describe' | 'yaml' | 'env'>('describe');
  const [envFilter, setEnvFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const yamlStr = useMemo(() => {
    try {
      return yaml.dump(resource.raw, { lineWidth: 120, noRefs: true });
    } catch {
      return '# Failed to serialize YAML';
    }
  }, [resource.raw]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    setDeleting(true);
    await window.electronAPI.k8s.deletePod(
      context,
      resource.namespace ?? 'default',
      resource.name,
    );
    onDeleted();
  }, [deleteConfirm, context, resource, onDeleted]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yamlStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [yamlStr]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = resource.raw as any;
  const metadata = raw?.metadata ?? {};
  const spec = raw?.spec ?? {};
  const status = raw?.status ?? {};

  const labels = metadata.labels as Record<string, string> | undefined;
  const annotations = metadata.annotations as Record<string, string> | undefined;

  const isWorkload = kind === 'deployments' || kind === 'statefulsets' || kind === 'daemonsets';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate">{resource.name}</h2>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium">
              <span className={cn('size-1.5 rounded-full', statusDot(resource.status))} />
              <span className={statusColor(resource.status)}>{resource.status}</span>
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {kind}{resource.namespace ? ` in ${resource.namespace}` : ''} &middot; Created {formatAge(metadata.creationTimestamp)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onOpenShell && (
            <Button variant="outline" size="sm" onClick={onOpenShell} className="text-xs h-7 px-2.5">
              <TerminalSquare className="size-3 mr-1" />
              Shell
            </Button>
          )}
          {onOpenLogs && (
            <Button variant="outline" size="sm" onClick={onOpenLogs} className="text-xs h-7 px-2.5">
              <ScrollText className="size-3 mr-1" />
              Logs
            </Button>
          )}
          {kind === 'pods' && (
            <Button
              variant={deleteConfirm ? 'outline' : 'ghost'}
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                'text-xs h-7 px-2.5',
                deleteConfirm && 'border-red-400/50 text-red-400 hover:bg-red-400/10',
              )}
            >
              <Trash2 className="size-3 mr-1" />
              {deleteConfirm ? 'Confirm?' : 'Delete'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4 bg-muted/20">
        {(kind === 'pods' ? ['describe', 'env', 'yaml'] as const : ['describe', 'yaml'] as const).map((t) => (
          <button
            key={t}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors capitalize',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab(t)}
          >
            {t === 'yaml' ? 'YAML' : t === 'env' ? 'Env Vars' : 'Overview'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'describe' && (
          <div className="p-4 space-y-5 text-xs">

            {/* ── Quick info cards ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InfoCard icon={<Hash className="size-3" />} label="UID" value={(metadata.uid ?? '').slice(0, 8) + '...'} muted />
              <InfoCard icon={<Clock className="size-3" />} label="Created" value={formatAge(metadata.creationTimestamp)} />
              {/* Pod quick cards */}
              {kind === 'pods' && resource.ready && (
                <InfoCard icon={<Box className="size-3" />} label="Ready" value={resource.ready} />
              )}
              {kind === 'pods' && resource.restarts !== undefined && (
                <InfoCard
                  icon={<Shield className="size-3" />}
                  label="Restarts"
                  value={String(resource.restarts)}
                  warn={resource.restarts > 0}
                  danger={resource.restarts > 10}
                />
              )}
              {kind === 'pods' && status.podIP && (
                <InfoCard icon={<Globe className="size-3" />} label="Pod IP" value={status.podIP} muted />
              )}
              {kind === 'pods' && spec.nodeName && (
                <InfoCard icon={<MapPin className="size-3" />} label="Node" value={spec.nodeName} />
              )}
              {kind === 'pods' && status.qosClass && (
                <InfoCard label="QoS" value={status.qosClass} />
              )}
              {/* Workload quick cards */}
              {isWorkload && resource.ready && (
                <InfoCard icon={<Box className="size-3" />} label="Ready" value={resource.ready} />
              )}
              {isWorkload && (
                <InfoCard
                  label="Available"
                  value={String(status.availableReplicas ?? status.numberAvailable ?? 0)}
                  warn={(status.availableReplicas ?? status.numberAvailable ?? 0) < (spec.replicas ?? 1)}
                />
              )}
              {kind === 'deployments' && (
                <InfoCard label="Updated" value={String(status.updatedReplicas ?? 0)} />
              )}
              {kind === 'daemonsets' && (
                <InfoCard label="Scheduled" value={String(status.currentNumberScheduled ?? 0)} />
              )}
            </div>

            {/* ── Pods: containers ───────────────────────────────────── */}
            {kind === 'pods' && spec.containers && (
              <Section title="Containers" icon={<Box className="size-3" />}>
                <div className="space-y-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(spec.containers as any[]).map((c: any, idx: number) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const cs = (status.containerStatuses as any[] | undefined)?.find((s: any) => s.name === c.name);
                    const isReady = cs?.ready ?? false;
                    const restarts = cs?.restartCount ?? 0;
                    return (
                      <div key={c.name} className="rounded-md border border-border/60 bg-muted/20 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
                          <div className="flex items-center gap-2">
                            <span className={cn('size-2 rounded-full', isReady ? 'bg-green-400' : 'bg-yellow-400')} />
                            <span className="font-medium text-foreground">{c.name}</span>
                            {spec.containers.length > 1 && (
                              <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {restarts > 0 && (
                              <span className={restarts > 5 ? 'text-red-400' : 'text-yellow-400'}>
                                {restarts} restarts
                              </span>
                            )}
                            <span className={isReady ? 'text-green-400' : 'text-yellow-400'}>
                              {isReady ? 'Ready' : 'Not Ready'}
                            </span>
                          </div>
                        </div>
                        <div className="px-3 py-2 space-y-1.5">
                          <Field label="Image" value={c.image} mono />
                          {c.command && (
                            <Field label="Command" value={(c.command as string[]).join(' ')} mono />
                          )}
                          {c.ports && (
                            <Field
                              label="Ports"
                              value={(c.ports as { containerPort: number; protocol?: string; name?: string }[])
                                .map((p) => `${p.containerPort}/${p.protocol ?? 'TCP'}${p.name ? ` (${p.name})` : ''}`)
                                .join(', ')}
                            />
                          )}
                          {c.resources?.requests && (
                            <Field
                              label="Requests"
                              value={Object.entries(c.resources.requests as Record<string, string>)
                                .map(([k, v]) => `${k}: ${formatQuantity(v)}`)
                                .join(', ')}
                            />
                          )}
                          {c.resources?.limits && (
                            <Field
                              label="Limits"
                              value={Object.entries(c.resources.limits as Record<string, string>)
                                .map(([k, v]) => `${k}: ${formatQuantity(v)}`)
                                .join(', ')}
                            />
                          )}
                          {c.livenessProbe && (
                            <Field label="Liveness" value={probeToString(c.livenessProbe)} mono />
                          )}
                          {c.readinessProbe && (
                            <Field label="Readiness" value={probeToString(c.readinessProbe)} mono />
                          )}
                          {c.startupProbe && (
                            <Field label="Startup" value={probeToString(c.startupProbe)} mono />
                          )}
                          {c.env && (
                            <Field label="Env vars" value={`${(c.env as unknown[]).length} defined`} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── Pods: init containers ──────────────────────────────── */}
            {kind === 'pods' && spec.initContainers && (spec.initContainers as unknown[]).length > 0 && (
              <Section title="Init Containers" icon={<Layers className="size-3" />}>
                <div className="space-y-1.5">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(spec.initContainers as any[]).map((c: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const cs = (status.initContainerStatuses as any[] | undefined)?.find((s: any) => s.name === c.name);
                    const exitCode = cs?.state?.terminated?.exitCode;
                    const stateLabel = cs?.state?.terminated
                      ? `exited (${exitCode})`
                      : cs?.state?.running
                        ? 'running'
                        : 'waiting';
                    const stateColor = exitCode === 0
                      ? 'text-green-400'
                      : cs?.state?.terminated
                        ? 'text-red-400'
                        : 'text-yellow-400';
                    return (
                      <div key={c.name} className="rounded-md border border-border/60 bg-muted/20 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
                          <span className="font-medium text-foreground">{c.name}</span>
                          <span className={cn('text-[10px]', stateColor)}>{stateLabel}</span>
                        </div>
                        <div className="px-3 py-2 space-y-1.5">
                          <Field label="Image" value={c.image} mono />
                          {c.command && (
                            <Field label="Command" value={(c.command as string[]).join(' ')} mono />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── Pods: volumes ──────────────────────────────────────── */}
            {kind === 'pods' && spec.volumes && (spec.volumes as unknown[]).length > 0 && (
              <Section title="Volumes" icon={<HardDrive className="size-3" />}>
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/40">
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Name</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Type</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(spec.volumes as any[]).map((vol: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono font-medium">{vol.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{getVolumeType(vol)}</td>
                          <td className="px-3 py-1.5 text-muted-foreground/80 font-mono text-[10px]">{getVolumeSource(vol)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Deployments / StatefulSets / DaemonSets ────────────── */}
            {isWorkload && (
              <Section title="Replicas" icon={<Activity className="size-3" />}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <InfoCard
                    label="Desired"
                    value={String(spec.replicas ?? status.desiredNumberScheduled ?? 0)}
                  />
                  <InfoCard
                    label="Ready"
                    value={String(status.readyReplicas ?? status.numberReady ?? 0)}
                  />
                  <InfoCard
                    label="Available"
                    value={String(status.availableReplicas ?? status.numberAvailable ?? 0)}
                    warn={(status.availableReplicas ?? status.numberAvailable ?? 0) < (spec.replicas ?? status.desiredNumberScheduled ?? 0)}
                  />
                  {kind === 'deployments' && (
                    <InfoCard label="Updated" value={String(status.updatedReplicas ?? 0)} />
                  )}
                  {kind === 'statefulsets' && (
                    <InfoCard label="Current" value={String(status.currentReplicas ?? 0)} />
                  )}
                  {kind === 'daemonsets' && (
                    <InfoCard label="Scheduled" value={String(status.currentNumberScheduled ?? 0)} />
                  )}
                </div>
              </Section>
            )}

            {kind === 'deployments' && spec.strategy && (
              <Section title="Update Strategy">
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  <Field label="Type" value={spec.strategy.type} />
                  {spec.strategy.rollingUpdate && (
                    <>
                      <Field label="Max Surge" value={String(spec.strategy.rollingUpdate.maxSurge ?? 1)} />
                      <Field label="Max Unavailable" value={String(spec.strategy.rollingUpdate.maxUnavailable ?? 1)} />
                    </>
                  )}
                  {spec.minReadySeconds !== undefined && (
                    <Field label="Min Ready" value={`${spec.minReadySeconds}s`} />
                  )}
                </div>
              </Section>
            )}

            {kind === 'statefulsets' && spec.updateStrategy && (
              <Section title="Update Strategy">
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  <Field label="Type" value={spec.updateStrategy.type} />
                  {spec.updateStrategy.rollingUpdate?.partition !== undefined && (
                    <Field label="Partition" value={String(spec.updateStrategy.rollingUpdate.partition)} />
                  )}
                  {spec.serviceName && <Field label="Service" value={spec.serviceName} mono />}
                </div>
              </Section>
            )}

            {isWorkload && spec.selector?.matchLabels && (
              <Section title="Selector" icon={<Tag className="size-3" />}>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(spec.selector.matchLabels as Record<string, string>).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-400/10 text-purple-300 text-[10px] font-mono"
                    >
                      <span className="text-purple-400/60">{k}</span>
                      <span className="text-purple-400/40">=</span>
                      {v}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Jobs ───────────────────────────────────────────────── */}
            {kind === 'jobs' && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <InfoCard icon={<Activity className="size-3" />} label="Active" value={String(status.active ?? 0)} />
                  <InfoCard label="Succeeded" value={String(status.succeeded ?? 0)} />
                  <InfoCard
                    label="Failed"
                    value={String(status.failed ?? 0)}
                    warn={(status.failed ?? 0) > 0}
                    danger={(status.failed ?? 0) >= (spec.backoffLimit ?? 6)}
                  />
                  <InfoCard
                    label="Completions"
                    value={`${status.succeeded ?? 0}/${spec.completions ?? 1}`}
                  />
                </div>
                <Section title="Job Spec">
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                    <Field label="Completions" value={String(spec.completions ?? 1)} />
                    <Field label="Parallelism" value={String(spec.parallelism ?? 1)} />
                    <Field label="Backoff Limit" value={String(spec.backoffLimit ?? 6)} />
                    {spec.activeDeadlineSeconds && (
                      <Field label="Deadline" value={`${spec.activeDeadlineSeconds}s`} />
                    )}
                    {spec.completionMode && <Field label="Completion Mode" value={spec.completionMode} />}
                    {status.startTime && <Field label="Started" value={formatAge(status.startTime)} />}
                    {status.completionTime && <Field label="Completed" value={formatAge(status.completionTime)} />}
                    {status.startTime && status.completionTime && (
                      <Field
                        label="Duration"
                        value={`${Math.round((new Date(status.completionTime).getTime() - new Date(status.startTime).getTime()) / 1000)}s`}
                      />
                    )}
                  </div>
                </Section>
              </>
            )}

            {/* ── CronJobs ───────────────────────────────────────────── */}
            {kind === 'cronjobs' && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <InfoCard icon={<CalendarClock className="size-3" />} label="Schedule" value={spec.schedule ?? '-'} muted />
                  <InfoCard
                    label="Last Run"
                    value={status.lastScheduleTime ? formatAge(status.lastScheduleTime) : 'Never'}
                  />
                  <InfoCard label="Active Jobs" value={String((status.active as unknown[] | undefined)?.length ?? 0)} />
                </div>
                <Section title="CronJob Config">
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                    <Field label="Schedule" value={spec.schedule} mono />
                    <Field label="Concurrency" value={spec.concurrencyPolicy ?? 'Allow'} />
                    <Field label="Suspend" value={spec.suspend ? 'Yes' : 'No'} />
                    <Field label="Success History" value={String(spec.successfulJobsHistoryLimit ?? 3)} />
                    <Field label="Failure History" value={String(spec.failedJobsHistoryLimit ?? 1)} />
                    {spec.startingDeadlineSeconds !== undefined && (
                      <Field label="Starting Deadline" value={`${spec.startingDeadlineSeconds}s`} />
                    )}
                    {status.lastSuccessfulTime && (
                      <Field label="Last Success" value={formatAge(status.lastSuccessfulTime)} />
                    )}
                  </div>
                </Section>
              </>
            )}

            {/* ── Services ───────────────────────────────────────────── */}
            {kind === 'services' && (
              <Section title="Service Spec">
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  <Field label="Type" value={spec.type} />
                  <Field label="Cluster IP" value={spec.clusterIP} mono />
                  {spec.clusterIPs && (spec.clusterIPs as string[]).length > 1 && (
                    <Field label="Cluster IPs" value={(spec.clusterIPs as string[]).join(', ')} mono />
                  )}
                  {spec.externalIPs && (
                    <Field label="External IPs" value={(spec.externalIPs as string[]).join(', ')} mono />
                  )}
                  {spec.loadBalancerIP && <Field label="LB IP" value={spec.loadBalancerIP} mono />}
                  {status.loadBalancer?.ingress && (
                    <Field
                      label="LB Ingress"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      value={(status.loadBalancer.ingress as any[]).map((i: any) => i.ip ?? i.hostname).join(', ')}
                      mono
                    />
                  )}
                  {spec.sessionAffinity && spec.sessionAffinity !== 'None' && (
                    <Field label="Session Affinity" value={spec.sessionAffinity} />
                  )}
                  {spec.externalTrafficPolicy && (
                    <Field label="Traffic Policy" value={spec.externalTrafficPolicy} />
                  )}
                  {spec.ports && (
                    <div className="mt-2">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium">Ports</span>
                      <div className="mt-1 space-y-0.5">
                        {(spec.ports as { name?: string; port: number; targetPort: unknown; protocol?: string; nodePort?: number }[])
                          .map((p, i) => (
                            <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                              {p.name && <span className="text-muted-foreground">{p.name}:</span>}
                              <span className="text-foreground">{p.port}</span>
                              <span className="text-muted-foreground/50">&rarr;</span>
                              <span className="text-foreground">{String(p.targetPort)}</span>
                              <span className="text-muted-foreground/50">/{p.protocol ?? 'TCP'}</span>
                              {p.nodePort && <span className="text-primary">(node: {p.nodePort})</span>}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {spec.selector && (
                    <div className="mt-2">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium">Selector</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(spec.selector as Record<string, string>).map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                            {k}={v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* ── Ingresses ──────────────────────────────────────────── */}
            {kind === 'ingresses' && spec.ingressClassName && (
              <Section title="Class">
                <span className="inline-flex px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-mono">
                  {spec.ingressClassName}
                </span>
              </Section>
            )}

            {kind === 'ingresses' && spec.rules && (
              <Section title="Rules" icon={<Globe className="size-3" />}>
                <div className="space-y-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(spec.rules as any[]).map((rule: any, i: number) => {
                    const tlsHosts = new Set<string>(
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (spec.tls as any[] | undefined ?? []).flatMap((t: any) => t.hosts ?? [])
                    );
                    const scheme = rule.host && tlsHosts.has(rule.host) ? 'https' : 'http';
                    return (
                      <div key={i} className="rounded-md border border-border/60 bg-muted/20 overflow-hidden">
                        <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40 font-mono text-[11px] font-medium">
                          {rule.host ? (
                            <button
                              className="text-primary hover:text-primary/80 hover:underline cursor-pointer"
                              onClick={() => window.electronAPI.openExternal(`${scheme}://${rule.host}`)}
                            >
                              {rule.host}
                            </button>
                          ) : (
                            <span className="italic text-muted-foreground">* (all hosts)</span>
                          )}
                        </div>
                        {rule.http?.paths && (
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="border-b border-border/30">
                                <th className="text-left px-3 py-1 text-[10px] text-muted-foreground/60 font-medium">Path</th>
                                <th className="text-left px-3 py-1 text-[10px] text-muted-foreground/60 font-medium">Type</th>
                                <th className="text-left px-3 py-1 text-[10px] text-muted-foreground/60 font-medium">Service</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {(rule.http.paths as any[]).map((p: any, j: number) => (
                                <tr key={j} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                                  <td className="px-3 py-1.5 font-mono text-foreground/80">
                                    {rule.host ? (
                                      <button
                                        className="hover:text-primary hover:underline cursor-pointer"
                                        onClick={() => window.electronAPI.openExternal(`${scheme}://${rule.host}${p.path ?? '/'}`)}
                                      >
                                        {p.path ?? '/'}
                                      </button>
                                    ) : (
                                      p.path ?? '/'
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{p.pathType}</td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] text-foreground/70">
                                    {p.backend?.service?.name}:{p.backend?.service?.port?.number ?? p.backend?.service?.port?.name}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {kind === 'ingresses' && spec.tls && (
              <Section title="TLS">
                <div className="space-y-1.5">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(spec.tls as any[]).map((tls: any, i: number) => (
                    <div key={i} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                      {tls.secretName && <Field label="Secret" value={tls.secretName} mono />}
                      {tls.hosts && (
                        <Field label="Hosts" value={(tls.hosts as string[]).join(', ')} />
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Nodes ──────────────────────────────────────────────── */}
            {kind === 'nodes' && status.nodeInfo && (
              <Section title="Node Info">
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  <Field label="OS" value={status.nodeInfo.osImage} />
                  <Field label="Architecture" value={status.nodeInfo.architecture} />
                  <Field label="Kernel" value={status.nodeInfo.kernelVersion} mono />
                  <Field label="Runtime" value={status.nodeInfo.containerRuntimeVersion} mono />
                  <Field label="Kubelet" value={status.nodeInfo.kubeletVersion} />
                  <Field label="Kube Proxy" value={status.nodeInfo.kubeProxyVersion} />
                  <Field label="Container OS" value={status.nodeInfo.operatingSystem} />
                </div>
              </Section>
            )}

            {kind === 'nodes' && status.capacity && (
              <Section title="Capacity" icon={<Activity className="size-3" />}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(status.capacity as Record<string, string>).map(([k, v]) => (
                    <InfoCard key={k} label={k} value={formatQuantity(v)} />
                  ))}
                </div>
              </Section>
            )}

            {kind === 'nodes' && status.allocatable && (
              <Section title="Allocatable" icon={<HardDrive className="size-3" />}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(status.allocatable as Record<string, string>).map(([k, v]) => (
                    <InfoCard key={k} label={k} value={formatQuantity(v)} />
                  ))}
                </div>
              </Section>
            )}

            {kind === 'nodes' && status.addresses && (
              <Section title="Addresses" icon={<MapPin className="size-3" />}>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  {(status.addresses as { type: string; address: string }[]).map((addr) => (
                    <Field key={addr.type} label={addr.type} value={addr.address} mono />
                  ))}
                </div>
              </Section>
            )}

            {kind === 'nodes' && spec.taints && (spec.taints as unknown[]).length > 0 && (
              <Section title="Taints">
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/40">
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Key</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Value</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Effect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(spec.taints as any[]).map((t: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono">{t.key}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono">{t.value ?? '-'}</td>
                          <td className="px-3 py-1.5 text-[10px]">
                            <span className={cn(
                              'px-1.5 py-0.5 rounded',
                              t.effect === 'NoSchedule' && 'bg-orange-400/10 text-orange-300',
                              t.effect === 'NoExecute' && 'bg-red-400/10 text-red-300',
                              t.effect === 'PreferNoSchedule' && 'bg-yellow-400/10 text-yellow-300',
                            )}>
                              {t.effect}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Secrets ────────────────────────────────────────────── */}
            {kind === 'secrets' && raw.type && (
              <Section title="Type" icon={<Shield className="size-3" />}>
                <span className="inline-flex px-2 py-0.5 rounded bg-orange-400/10 text-orange-300 text-[11px] font-mono">
                  {raw.type}
                </span>
              </Section>
            )}

            {kind === 'secrets' && (
              <Section
                title="Data"
                icon={<Shield className="size-3" />}
                action={raw.data && Object.keys(raw.data as Record<string, string>).length > 0 && (() => {
                  const keys = Object.keys(raw.data as Record<string, string>);
                  const allRevealed = keys.every((k) => revealedKeys.has(k));
                  return (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title={allRevealed ? 'Hide all' : 'Reveal all'}
                      onClick={() => setRevealedKeys(allRevealed ? new Set() : new Set(keys))}
                    >
                      {allRevealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </Button>
                  );
                })()}
              >
                {raw.data ? (
                  <div className="rounded-md border border-border/60 bg-muted/20 overflow-hidden">
                    {Object.entries(raw.data as Record<string, string>).map(([key, b64], i, arr) => {
                      const decoded = (() => { try { return atob(b64); } catch { return b64; } })();
                      const revealed = revealedKeys.has(key);
                      return (
                        <div
                          key={key}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2',
                            i < arr.length - 1 && 'border-b border-border/30',
                          )}
                        >
                          <span className="font-mono text-[11px] text-foreground flex-1 truncate">{key}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn(
                              'font-mono text-[11px] max-w-[200px] truncate',
                              revealed ? 'text-foreground/80' : 'text-muted-foreground tracking-widest select-none',
                            )}>
                              {revealed ? decoded : '••••••••'}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title={revealed ? 'Hide' : 'Reveal'}
                              onClick={() => setRevealedKeys((prev) => {
                                const next = new Set(prev);
                                revealed ? next.delete(key) : next.add(key);
                                return next;
                              })}
                            >
                              {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Copy value"
                              onClick={() => {
                                navigator.clipboard.writeText(decoded);
                                setCopiedKey(key);
                                setTimeout(() => setCopiedKey(null), 1500);
                              }}
                            >
                              {copiedKey === key ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground italic text-[11px]">No data</p>
                )}
              </Section>
            )}

            {/* ── ConfigMaps ─────────────────────────────────────────── */}
            {kind === 'configmaps' && raw.data && (
              <Section title="Data">
                <div className="space-y-2">
                  {Object.entries(raw.data as Record<string, string>).map(([key, value]) => (
                    <div key={key} className="rounded-md border border-border/60 bg-muted/20 overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40 font-mono text-[11px] font-medium">
                        {key}
                      </div>
                      <pre className="px-3 py-2 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                        {value}
                      </pre>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── PVCs ───────────────────────────────────────────────── */}
            {kind === 'pvcs' && (
              <Section title="Volume Claim" icon={<HardDrive className="size-3" />}>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  <Field label="Storage Class" value={spec.storageClassName ?? '(default)'} mono />
                  <Field label="Volume Mode" value={spec.volumeMode ?? 'Filesystem'} />
                  {spec.accessModes && (
                    <Field label="Access Modes" value={(spec.accessModes as string[]).join(', ')} />
                  )}
                  {spec.resources?.requests?.storage && (
                    <Field label="Requested" value={formatQuantity(spec.resources.requests.storage)} />
                  )}
                  {status.capacity?.storage && (
                    <Field label="Capacity" value={formatQuantity(status.capacity.storage)} />
                  )}
                  {spec.volumeName && (
                    <Field label="Bound Volume" value={spec.volumeName} mono />
                  )}
                </div>
              </Section>
            )}

            {/* ── PVs ────────────────────────────────────────────────── */}
            {kind === 'pvs' && (
              <Section title="Persistent Volume" icon={<HardDrive className="size-3" />}>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
                  <Field label="Storage Class" value={spec.storageClassName ?? '(none)'} mono />
                  <Field label="Reclaim Policy" value={spec.persistentVolumeReclaimPolicy ?? '-'} />
                  <Field label="Volume Mode" value={spec.volumeMode ?? 'Filesystem'} />
                  {spec.accessModes && (
                    <Field label="Access Modes" value={(spec.accessModes as string[]).join(', ')} />
                  )}
                  {spec.capacity?.storage && (
                    <Field label="Capacity" value={formatQuantity(spec.capacity.storage)} />
                  )}
                  {spec.claimRef && (
                    <Field label="Bound Claim" value={`${spec.claimRef.namespace}/${spec.claimRef.name}`} mono />
                  )}
                  {spec.csi && <Field label="Driver" value={spec.csi.driver} mono />}
                  {spec.nfs && <Field label="NFS" value={`${spec.nfs.server}:${spec.nfs.path}`} mono />}
                  {spec.hostPath && <Field label="Host Path" value={spec.hostPath.path} mono />}
                  {spec.mountOptions && (
                    <Field label="Mount Options" value={(spec.mountOptions as string[]).join(', ')} mono />
                  )}
                </div>
              </Section>
            )}

            {/* ── Labels ─────────────────────────────────────────────── */}
            {labels && Object.keys(labels).length > 0 && (
              <Section title="Labels" icon={<Tag className="size-3" />}>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(labels).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono"
                    >
                      <span className="text-primary/60">{k}</span>
                      <span className="text-primary/40">=</span>
                      {v}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Annotations ────────────────────────────────────────── */}
            {annotations && Object.keys(annotations).length > 0 && (
              <Section title="Annotations" icon={<Tag className="size-3" />}>
                <div className="space-y-1">
                  {Object.entries(annotations).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[11px]">
                      <span className="text-muted-foreground shrink-0 font-mono text-[10px] break-all">{k}</span>
                      <span className="text-foreground/70 break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Conditions ─────────────────────────────────────────── */}
            {status.conditions && (status.conditions as unknown[]).length > 0 && (
              <Section title="Conditions">
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/40">
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Type</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Status</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Reason</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(status.conditions as any[]).map((cond: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 last:border-0">
                          <td className="px-3 py-1.5 font-medium text-foreground">{cond.type}</td>
                          <td className="px-3 py-1.5">
                            <span className={cn(
                              'inline-flex items-center gap-1',
                              cond.status === 'True' ? 'text-green-400' : 'text-yellow-400',
                            )}>
                              <span className={cn(
                                'size-1.5 rounded-full',
                                cond.status === 'True' ? 'bg-green-400' : 'bg-yellow-400',
                              )} />
                              {cond.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-[10px]">{cond.reason ?? '-'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground/80 max-w-sm truncate">{cond.message ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

          </div>
        )}

        {tab === 'env' && kind === 'pods' && (
          <EnvVarsTab spec={spec} status={status} filter={envFilter} onFilterChange={setEnvFilter} />
        )}

        {tab === 'yaml' && (
          <div className="relative">
            <div className="sticky top-0 flex justify-end p-2 bg-gradient-to-b from-background to-transparent z-10">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={handleCopy}
              >
                {copied ? <Check className="size-3 mr-1" /> : <Copy className="size-3 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="px-4 pb-4 -mt-2 text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed text-foreground/80">
              {yamlStr}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value, muted, warn, danger }: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-0.5">
        {icon}
        {label}
      </div>
      <div className={cn(
        'text-sm font-medium truncate',
        muted && 'text-muted-foreground font-mono text-xs',
        warn && !danger && 'text-yellow-400',
        danger && 'text-red-400',
      )}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">
        {icon}
        {title}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-[11px]">
      <span className="text-muted-foreground shrink-0 w-28">{label}</span>
      <span className={cn(
        'text-foreground/90 min-w-0',
        mono ? 'font-mono text-[10px] break-all' : 'truncate',
      )}>
        {value}
      </span>
    </div>
  );
}

// ── Env Vars Tab ────────────────────────────────────────────────────────────

type EnvVar = {
  name: string;
  value?: string;
  source?: string;
  containerName: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEnvVars(spec: any, _status: any): EnvVar[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const containers: any[] = [...(spec.containers ?? []), ...(spec.initContainers ?? [])];
  const vars: EnvVar[] = [];

  for (const c of containers) {
    if (!c.env) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of c.env as any[]) {
      if (e.value !== undefined) {
        vars.push({ name: e.name, value: e.value, containerName: c.name });
      } else if (e.valueFrom) {
        let source = '';
        if (e.valueFrom.secretKeyRef) {
          source = `secret:${e.valueFrom.secretKeyRef.name}/${e.valueFrom.secretKeyRef.key}`;
        } else if (e.valueFrom.configMapKeyRef) {
          source = `configmap:${e.valueFrom.configMapKeyRef.name}/${e.valueFrom.configMapKeyRef.key}`;
        } else if (e.valueFrom.fieldRef) {
          source = `fieldRef:${e.valueFrom.fieldRef.fieldPath}`;
        } else if (e.valueFrom.resourceFieldRef) {
          source = `resource:${e.valueFrom.resourceFieldRef.resource}`;
        } else {
          source = 'ref';
        }
        vars.push({ name: e.name, source, containerName: c.name });
      }
    }
  }

  return vars;
}

function EnvVarsTab({
  spec,
  status,
  filter,
  onFilterChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  status: any;
  filter: string;
  onFilterChange: (v: string) => void;
}) {
  const allVars = extractEnvVars(spec, status);

  const filtered = filter
    ? allVars.filter(
        (v) =>
          v.name.toLowerCase().includes(filter.toLowerCase()) ||
          v.value?.toLowerCase().includes(filter.toLowerCase()) ||
          v.source?.toLowerCase().includes(filter.toLowerCase()) ||
          v.containerName.toLowerCase().includes(filter.toLowerCase()),
      )
    : allVars;

  // Group by container
  const grouped = new Map<string, EnvVar[]>();
  for (const v of filtered) {
    const list = grouped.get(v.containerName) ?? [];
    list.push(v);
    grouped.set(v.containerName, list);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
        <Search className="size-3 text-muted-foreground shrink-0" />
        <input
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          placeholder="Filter env vars..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {filtered.length} / {allVars.length}
        </span>
        {filter && (
          <button onClick={() => onFilterChange('')} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {allVars.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <KeyRound className="size-6 text-muted-foreground/40" />
            <span className="text-xs">No environment variables defined in pod spec</span>
          </div>
        )}

        {Array.from(grouped.entries()).map(([containerName, vars]) => (
          <div key={containerName}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-2">
              <Box className="size-3" />
              {containerName}
              <span className="text-muted-foreground/40">({vars.length})</span>
            </div>
            <div className="rounded-md border border-border/60 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/40">
                    <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium w-1/3">Name</th>
                    <th className="text-left px-3 py-1.5 text-[10px] uppercase text-muted-foreground/70 font-medium">Value / Source</th>
                  </tr>
                </thead>
                <tbody>
                  {vars.map((v, i) => (
                    <tr key={`${v.name}-${i}`} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-1.5 font-mono font-medium text-foreground align-top">
                        {v.name}
                      </td>
                      <td className="px-3 py-1.5 align-top">
                        {v.value !== undefined ? (
                          <span className="font-mono text-foreground/80 break-all">
                            {v.value || <span className="text-muted-foreground italic">(empty)</span>}
                          </span>
                        ) : v.source ? (
                          <span className="inline-flex items-center gap-1">
                            {v.source.startsWith('secret:') && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-400/10 text-orange-300 text-[10px] font-mono">
                                <Shield className="size-2.5" />
                                {v.source.slice(7)}
                              </span>
                            )}
                            {v.source.startsWith('configmap:') && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono">
                                {v.source.slice(10)}
                              </span>
                            )}
                            {v.source.startsWith('fieldRef:') && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-300 text-[10px] font-mono">
                                {v.source.slice(9)}
                              </span>
                            )}
                            {v.source.startsWith('resource:') && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-400/10 text-green-300 text-[10px] font-mono">
                                {v.source.slice(9)}
                              </span>
                            )}
                            {v.source === 'ref' && (
                              <span className="text-muted-foreground italic text-[10px]">external ref</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">(unset)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
