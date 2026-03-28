export type K8sContext = {
  name: string;
  cluster: string;
  namespace: string | null;
};

export type K8sResource = {
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

export type K8sWatchEvent = {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';
  resource: K8sResource;
};

export type K8sLogChunk = { text: string };

export type ResourceKind =
  | 'nodes'
  | 'namespaces'
  | 'pods'
  | 'deployments'
  | 'statefulsets'
  | 'daemonsets'
  | 'jobs'
  | 'cronjobs'
  | 'services'
  | 'ingresses'
  | 'configmaps'
  | 'secrets'
  | 'pvcs'
  | 'pvs';

export const RESOURCE_CATEGORIES: {
  label: string;
  items: { kind: ResourceKind; label: string }[];
}[] = [
  {
    label: 'Cluster',
    items: [
      { kind: 'nodes', label: 'Nodes' },
      { kind: 'namespaces', label: 'Namespaces' },
    ],
  },
  {
    label: 'Workloads',
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
    items: [
      { kind: 'services', label: 'Services' },
      { kind: 'ingresses', label: 'Ingresses' },
    ],
  },
  {
    label: 'Config & Storage',
    items: [
      { kind: 'configmaps', label: 'ConfigMaps' },
      { kind: 'secrets', label: 'Secrets' },
      { kind: 'pvcs', label: 'PVCs' },
      { kind: 'pvs', label: 'PVs' },
    ],
  },
];

export const CLUSTER_SCOPED: Set<ResourceKind> = new Set([
  'nodes',
  'namespaces',
  'pvs',
]);
