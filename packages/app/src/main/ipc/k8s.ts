import { ipcMain, type WebContents } from 'electron';
import * as k8s from '@kubernetes/client-node';

// ── Types (mirrored from renderer) ──────────────────────────────────────────

type K8sContext = {
  name: string;
  cluster: string;
  namespace: string | null;
};

type K8sResource = {
  kind: string;
  name: string;
  namespace: string | null;
  uid: string;
  createdAt: string;
  status: string;
  restarts?: number;
  ready?: string;
  raw: unknown;
};

type K8sWatchEvent = {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';
  resource: K8sResource;
};

type ResourceKind =
  | 'nodes' | 'namespaces'
  | 'pods' | 'deployments' | 'statefulsets' | 'daemonsets'
  | 'jobs' | 'cronjobs'
  | 'services' | 'ingresses'
  | 'configmaps' | 'secrets' | 'pvcs' | 'pvs';

// ── Resource path mapping ───────────────────────────────────────────────────

const RESOURCE_PATHS: Record<ResourceKind, {
  path: (ns?: string) => string;
  clusterScoped?: boolean;
  apiGroup: 'core' | 'apps' | 'batch' | 'networking';
}> = {
  nodes:        { path: () => '/api/v1/nodes', clusterScoped: true, apiGroup: 'core' },
  namespaces:   { path: () => '/api/v1/namespaces', clusterScoped: true, apiGroup: 'core' },
  pods:         { path: (ns) => ns ? `/api/v1/namespaces/${ns}/pods` : '/api/v1/pods', apiGroup: 'core' },
  deployments:  { path: (ns) => ns ? `/apis/apps/v1/namespaces/${ns}/deployments` : '/apis/apps/v1/deployments', apiGroup: 'apps' },
  statefulsets: { path: (ns) => ns ? `/apis/apps/v1/namespaces/${ns}/statefulsets` : '/apis/apps/v1/statefulsets', apiGroup: 'apps' },
  daemonsets:   { path: (ns) => ns ? `/apis/apps/v1/namespaces/${ns}/daemonsets` : '/apis/apps/v1/daemonsets', apiGroup: 'apps' },
  jobs:         { path: (ns) => ns ? `/apis/batch/v1/namespaces/${ns}/jobs` : '/apis/batch/v1/jobs', apiGroup: 'batch' },
  cronjobs:     { path: (ns) => ns ? `/apis/batch/v1/namespaces/${ns}/cronjobs` : '/apis/batch/v1/cronjobs', apiGroup: 'batch' },
  services:     { path: (ns) => ns ? `/api/v1/namespaces/${ns}/services` : '/api/v1/services', apiGroup: 'core' },
  ingresses:    { path: (ns) => ns ? `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses` : '/apis/networking.k8s.io/v1/ingresses', apiGroup: 'networking' },
  configmaps:   { path: (ns) => ns ? `/api/v1/namespaces/${ns}/configmaps` : '/api/v1/configmaps', apiGroup: 'core' },
  secrets:      { path: (ns) => ns ? `/api/v1/namespaces/${ns}/secrets` : '/api/v1/secrets', apiGroup: 'core' },
  pvcs:         { path: (ns) => ns ? `/api/v1/namespaces/${ns}/persistentvolumeclaims` : '/api/v1/persistentvolumeclaims', apiGroup: 'core' },
  pvs:          { path: () => '/api/v1/persistentvolumes', clusterScoped: true, apiGroup: 'core' },
};

// ── Client cache ────────────────────────────────────────────────────────────

function loadKubeConfig(contextName?: string): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  if (contextName) {
    kc.setCurrentContext(contextName);
  }
  return kc;
}

const kcCache = new Map<string, k8s.KubeConfig>();

function getKc(contextName: string): k8s.KubeConfig {
  let kc = kcCache.get(contextName);
  if (!kc) {
    kc = loadKubeConfig(contextName);
    kcCache.set(contextName, kc);
  }
  return kc;
}

function getCoreApi(contextName: string): k8s.CoreV1Api {
  return getKc(contextName).makeApiClient(k8s.CoreV1Api);
}

// ── Resource serialization ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeResource(obj: any, kind: ResourceKind): K8sResource {
  const meta = obj.metadata ?? {};
  const status = extractStatus(obj, kind);
  const base: K8sResource = {
    kind,
    name: meta.name ?? '',
    namespace: meta.namespace ?? null,
    uid: meta.uid ?? '',
    createdAt: meta.creationTimestamp ?? '',
    status,
    raw: JSON.parse(JSON.stringify(obj)),
  };

  if (kind === 'pods') {
    const containerStatuses = obj.status?.containerStatuses ?? [];
    const restarts = containerStatuses.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, cs: any) => sum + (cs.restartCount ?? 0), 0
    );
    const readyCount = containerStatuses.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cs: any) => cs.ready
    ).length;
    base.restarts = restarts;
    base.ready = `${readyCount}/${containerStatuses.length || obj.spec?.containers?.length || 0}`;
  }

  if (kind === 'deployments' || kind === 'statefulsets' || kind === 'daemonsets') {
    const desired = obj.spec?.replicas ?? obj.status?.desiredNumberScheduled ?? 0;
    const ready = obj.status?.readyReplicas ?? 0;
    base.ready = `${ready}/${desired}`;
  }

  return base;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStatus(obj: any, kind: ResourceKind): string {
  switch (kind) {
    case 'pods':
      return obj.status?.phase ?? 'Unknown';
    case 'deployments':
    case 'statefulsets':
    case 'daemonsets': {
      const desired = obj.spec?.replicas ?? obj.status?.desiredNumberScheduled ?? 0;
      const ready = obj.status?.readyReplicas ?? 0;
      return ready >= desired ? 'Ready' : 'Progressing';
    }
    case 'jobs':
      if (obj.status?.succeeded > 0) return 'Complete';
      if (obj.status?.failed > 0) return 'Failed';
      if (obj.status?.active > 0) return 'Running';
      return 'Pending';
    case 'cronjobs':
      return obj.spec?.suspend ? 'Suspended' : 'Active';
    case 'services':
      return obj.spec?.type ?? 'ClusterIP';
    case 'ingresses':
      return obj.status?.loadBalancer?.ingress?.length ? 'Active' : 'Pending';
    case 'nodes': {
      const conditions = obj.status?.conditions ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ready = conditions.find((c: any) => c.type === 'Ready');
      return ready?.status === 'True' ? 'Ready' : 'NotReady';
    }
    case 'namespaces':
      return obj.status?.phase ?? 'Active';
    case 'configmaps':
    case 'secrets':
      return 'Active';
    case 'pvcs':
      return obj.status?.phase ?? 'Pending';
    case 'pvs':
      return obj.status?.phase ?? 'Available';
    default:
      return 'Unknown';
  }
}

// ── Watch management ────────────────────────────────────────────────────────

type WatchEntry = {
  abort: () => void;
  contextName: string;
  kind: ResourceKind;
  namespace: string | undefined;
  sender: WebContents;
  watchId: string;
};

const watches = new Map<string, WatchEntry>();
const logStreams = new Map<string, { destroy: () => void }>();
const execSessions = new Map<string, { destroy: () => void }>();

async function startWatch(
  sender: WebContents,
  contextName: string,
  kind: ResourceKind,
  watchId: string,
  namespace?: string,
): Promise<void> {
  const kc = getKc(contextName);
  const watch = new k8s.Watch(kc);
  const resourceDef = RESOURCE_PATHS[kind];
  const watchPath = resourceDef.clusterScoped
    ? resourceDef.path()
    : resourceDef.path(namespace);

  const makeWatch = async () => {
    try {
      const req = await watch.watch(
        watchPath,
        {},
        (type: string, obj: unknown) => {
          if (sender.isDestroyed()) return;
          const event: K8sWatchEvent = {
            type: type as K8sWatchEvent['type'],
            resource: serializeResource(obj, kind),
          };
          sender.send(`k8s:watch:${watchId}`, event);
        },
        (err?: unknown) => {
          // Stream ended — reconnect if watch is still registered
          if (watches.has(watchId) && !sender.isDestroyed()) {
            setTimeout(() => {
              if (watches.has(watchId)) makeWatch();
            }, 1000);
          }
          if (err && !sender.isDestroyed()) {
            console.error(`[k8s] Watch error for ${kind}:`, err);
          }
        },
      );

      const entry = watches.get(watchId);
      if (entry) {
        entry.abort = () => {
          try { req.abort(); } catch { /* ignore */ }
        };
      }
    } catch (err) {
      console.error(`[k8s] Failed to start watch for ${kind}:`, err);
    }
  };

  watches.set(watchId, {
    abort: () => {},
    contextName,
    kind,
    namespace,
    sender,
    watchId,
  });

  await makeWatch();
}

// ── IPC Registration ────────────────────────────────────────────────────────

export function registerK8sIpc(): void {
  // List available contexts from kubeconfig
  ipcMain.handle('k8s:contexts', () => {
    try {
      const kc = loadKubeConfig();
      const contexts: K8sContext[] = kc.contexts.map((ctx) => {
        const cluster = ctx.cluster;
        const ns = ctx.namespace ?? null;
        return { name: ctx.name, cluster, namespace: ns };
      });
      return { contexts, currentContext: kc.currentContext };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // List namespaces for a context
  ipcMain.handle('k8s:namespaces', async (_event, contextName: string) => {
    try {
      const api = getCoreApi(contextName);
      const res = await api.listNamespace();
      return (res.items ?? []).map((ns) => ns.metadata?.name ?? '').filter(Boolean);
    } catch (err) {
      console.error('[k8s] Failed to list namespaces:', err);
      return [];
    }
  });

  // List resources
  ipcMain.handle(
    'k8s:list',
    async (_event, contextName: string, kind: ResourceKind, namespace?: string) => {
      try {
        const kc = getKc(contextName);
        return await listResources(kc, kind, namespace);
      } catch (err) {
        console.error(`[k8s] Failed to list ${kind}:`, err);
        return { error: String(err) };
      }
    },
  );

  // Start watching resources
  ipcMain.handle(
    'k8s:watch:start',
    async (event, contextName: string, kind: ResourceKind, watchId: string, namespace?: string) => {
      await startWatch(event.sender, contextName, kind, watchId, namespace);
    },
  );

  // Stop watching
  ipcMain.handle('k8s:watch:stop', (_event, watchId: string) => {
    const entry = watches.get(watchId);
    if (entry) {
      entry.abort();
      watches.delete(watchId);
    }
  });

  // Get pod containers
  ipcMain.handle(
    'k8s:pod:containers',
    async (_event, contextName: string, namespace: string, podName: string) => {
      try {
        const api = getCoreApi(contextName);
        const pod = await api.readNamespacedPod({ name: podName, namespace });
        return (pod.spec?.containers ?? []).map((c) => c.name);
      } catch (err) {
        console.error('[k8s] Failed to get pod containers:', err);
        return [];
      }
    },
  );

  // Start log streaming
  ipcMain.handle(
    'k8s:logs:start',
    async (event, contextName: string, namespace: string, podName: string, container: string, streamId: string) => {
      try {
        const kc = getKc(contextName);
        const log = new k8s.Log(kc);

        const stream = new (await import('node:stream')).PassThrough();

        logStreams.set(streamId, {
          destroy: () => {
            try { stream.destroy(); } catch { /* ignore */ }
          },
        });

        await log.log(namespace, podName, container, stream, {
          follow: true,
          tailLines: 500,
        });

        stream.on('data', (chunk: Buffer) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(`k8s:logs:${streamId}`, {
              text: chunk.toString('utf-8'),
            });
          } else {
            stream.destroy();
          }
        });

        stream.on('error', () => {
          logStreams.delete(streamId);
        });

        stream.on('end', () => {
          logStreams.delete(streamId);
        });
      } catch (err) {
        console.error('[k8s] Failed to start log stream:', err);
        if (!event.sender.isDestroyed()) {
          event.sender.send(`k8s:logs:${streamId}`, {
            text: `Error: Failed to stream logs - ${err}\n`,
          });
        }
      }
    },
  );

  // Stop log streaming
  ipcMain.handle('k8s:logs:stop', (_event, streamId: string) => {
    const entry = logStreams.get(streamId);
    if (entry) {
      entry.destroy();
      logStreams.delete(streamId);
    }
  });

  // Delete pod
  ipcMain.handle(
    'k8s:pod:delete',
    async (_event, contextName: string, namespace: string, podName: string) => {
      try {
        const api = getCoreApi(contextName);
        await api.deleteNamespacedPod({ name: podName, namespace });
        return { success: true };
      } catch (err) {
        console.error('[k8s] Failed to delete pod:', err);
        return { error: String(err) };
      }
    },
  );

  // Exec into pod (interactive shell)
  ipcMain.handle(
    'k8s:exec:start',
    async (
      event,
      contextName: string,
      namespace: string,
      podName: string,
      container: string,
      execId: string,
      command: string[] = ['/bin/sh'],
    ) => {
      try {
        const kc = getKc(contextName);
        const exec = new k8s.Exec(kc);
        const { PassThrough } = await import('node:stream');

        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();
        const stdinStream = new PassThrough();

        const sender = event.sender;

        stdoutStream.on('data', (chunk: Buffer) => {
          if (!sender.isDestroyed()) {
            sender.send(`k8s:exec:data:${execId}`, chunk.toString('utf-8'));
          }
        });

        stderrStream.on('data', (chunk: Buffer) => {
          if (!sender.isDestroyed()) {
            sender.send(`k8s:exec:data:${execId}`, chunk.toString('utf-8'));
          }
        });

        const ws = await exec.exec(
          namespace,
          podName,
          container,
          command,
          stdoutStream,
          stderrStream,
          stdinStream,
          true, // tty
          (status) => {
            if (!sender.isDestroyed()) {
              sender.send(`k8s:exec:exit:${execId}`, status?.status === 'Success' ? 0 : 1);
            }
            execSessions.delete(execId);
          },
        );

        execSessions.set(execId, {
          destroy: () => {
            try {
              stdinStream.destroy();
              stdoutStream.destroy();
              stderrStream.destroy();
              ws.close();
            } catch { /* ignore */ }
          },
        });

        // Listen for stdin writes from renderer
        const writeChannel = `k8s:exec:write:${execId}`;
        const writeListener = (_e: Electron.IpcMainEvent, data: string) => {
          try {
            stdinStream.write(data);
          } catch { /* ignore */ }
        };
        ipcMain.on(writeChannel, writeListener);

        // Listen for resize
        const resizeChannel = `k8s:exec:resize:${execId}`;
        const resizeListener = (_e: Electron.IpcMainEvent, cols: number, rows: number) => {
          try {
            // Send resize message via WebSocket channel 4 (resize)
            const resizeMsg = JSON.stringify({ Width: cols, Height: rows });
            // WebSocket channel 4 is the resize channel in k8s exec protocol
            if (ws.readyState === ws.OPEN) {
              const buf = Buffer.alloc(resizeMsg.length + 1);
              buf.writeUInt8(4, 0); // channel 4 = resize
              buf.write(resizeMsg, 1);
              ws.send(buf);
            }
          } catch { /* ignore */ }
        };
        ipcMain.on(resizeChannel, resizeListener);

        // Cleanup listeners when session ends
        const origDestroy = execSessions.get(execId)?.destroy;
        execSessions.set(execId, {
          destroy: () => {
            ipcMain.removeListener(writeChannel, writeListener);
            ipcMain.removeListener(resizeChannel, resizeListener);
            origDestroy?.();
          },
        });

        return { success: true };
      } catch (err) {
        console.error('[k8s] Failed to start exec:', err);
        if (!event.sender.isDestroyed()) {
          event.sender.send(`k8s:exec:data:${execId}`, `\r\nError: Failed to exec into pod - ${err}\r\n`);
        }
        return { error: String(err) };
      }
    },
  );

  // Stop exec session
  ipcMain.handle('k8s:exec:stop', (_event, execId: string) => {
    const entry = execSessions.get(execId);
    if (entry) {
      entry.destroy();
      execSessions.delete(execId);
    }
  });
}

// ── List resources using typed APIs ─────────────────────────────────────────

async function listResources(
  kc: k8s.KubeConfig,
  kind: ResourceKind,
  namespace?: string,
): Promise<K8sResource[]> {
  switch (kind) {
    case 'nodes': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = await api.listNode();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'namespaces': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = await api.listNamespace();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'pods': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = namespace
        ? await api.listNamespacedPod({ namespace })
        : await api.listPodForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'deployments': {
      const api = kc.makeApiClient(k8s.AppsV1Api);
      const res = namespace
        ? await api.listNamespacedDeployment({ namespace })
        : await api.listDeploymentForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'statefulsets': {
      const api = kc.makeApiClient(k8s.AppsV1Api);
      const res = namespace
        ? await api.listNamespacedStatefulSet({ namespace })
        : await api.listStatefulSetForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'daemonsets': {
      const api = kc.makeApiClient(k8s.AppsV1Api);
      const res = namespace
        ? await api.listNamespacedDaemonSet({ namespace })
        : await api.listDaemonSetForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'jobs': {
      const api = kc.makeApiClient(k8s.BatchV1Api);
      const res = namespace
        ? await api.listNamespacedJob({ namespace })
        : await api.listJobForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'cronjobs': {
      const api = kc.makeApiClient(k8s.BatchV1Api);
      const res = namespace
        ? await api.listNamespacedCronJob({ namespace })
        : await api.listCronJobForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'services': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = namespace
        ? await api.listNamespacedService({ namespace })
        : await api.listServiceForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'ingresses': {
      const api = kc.makeApiClient(k8s.NetworkingV1Api);
      const res = namespace
        ? await api.listNamespacedIngress({ namespace })
        : await api.listIngressForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'configmaps': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = namespace
        ? await api.listNamespacedConfigMap({ namespace })
        : await api.listConfigMapForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'secrets': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = namespace
        ? await api.listNamespacedSecret({ namespace })
        : await api.listSecretForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'pvcs': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = namespace
        ? await api.listNamespacedPersistentVolumeClaim({ namespace })
        : await api.listPersistentVolumeClaimForAllNamespaces();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    case 'pvs': {
      const api = kc.makeApiClient(k8s.CoreV1Api);
      const res = await api.listPersistentVolume();
      return (res.items ?? []).map((o) => serializeResource(o, kind));
    }
    default:
      return [];
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export function stopAllK8sWatches(): void {
  for (const [id, entry] of watches) {
    entry.abort();
    watches.delete(id);
  }
  for (const [id, entry] of logStreams) {
    entry.destroy();
    logStreams.delete(id);
  }
  for (const [id, entry] of execSessions) {
    entry.destroy();
    execSessions.delete(id);
  }
  kcCache.clear();
}
