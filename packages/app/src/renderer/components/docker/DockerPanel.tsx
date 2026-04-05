import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Image,
  Layers,
  HardDrive,
  Network,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { ContainerList } from './ContainerList';
import { ContainerDetail } from './ContainerDetail';
import { ImageList } from './ImageList';
import { ComposeList } from './ComposeList';
import { VolumeList } from './VolumeList';
import { VolumeDetail } from './VolumeDetail';
import { NetworkList } from './NetworkList';
import type {
  DockerContainer,
  DockerImage,
  DockerVolume,
  DockerNetwork,
  ComposeProject,
  DockerSection,
} from './types';

type DockerAvailability =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'daemon' | 'notInstalled' | string };

type DetailView =
  | { kind: 'container'; container: DockerContainer }
  | { kind: 'volume'; volume: DockerVolume };

const SIDEBAR_ITEMS: { key: DockerSection; label: string; icon: React.ReactNode }[] = [
  { key: 'containers', label: 'Containers', icon: <Box className="size-3" /> },
  { key: 'images', label: 'Images', icon: <Image className="size-3" /> },
  { key: 'compose', label: 'Compose', icon: <Layers className="size-3" /> },
  { key: 'volumes', label: 'Volumes', icon: <HardDrive className="size-3" /> },
  { key: 'networks', label: 'Networks', icon: <Network className="size-3" /> },
];

export function DockerPanel({ panelId: _panelId }: { panelId: string }) {
  const [availability, setAvailability] = useState<DockerAvailability>({ status: 'checking' });
  const [section, setSection] = useState<DockerSection>('containers');
  const [detailView, setDetailView] = useState<DetailView | null>(null);

  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [compose, setCompose] = useState<ComposeProject[]>([]);
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);

  const [loading, setLoading] = useState<Record<DockerSection, boolean>>({
    containers: false, images: false, compose: false, volumes: false, networks: false,
  });

  const counts: Record<DockerSection, number> = {
    containers: containers.length,
    images: images.length,
    compose: compose.length,
    volumes: volumes.length,
    networks: networks.length,
  };

  const setLoadingFor = (sec: DockerSection, val: boolean) =>
    setLoading((prev) => ({ ...prev, [sec]: val }));

  const checkAvailability = useCallback(async () => {
    setAvailability({ status: 'checking' });
    const result = await window.electronAPI.docker.check();
    if (result.available) {
      setAvailability({ status: 'available' });
    } else {
      setAvailability({ status: 'unavailable', reason: result.reason ?? 'daemon' });
    }
  }, []);

  const loadContainers = useCallback(async () => {
    setLoadingFor('containers', true);
    try {
      const result = await window.electronAPI.docker.listContainers();
      if (!('error' in result)) setContainers(result as DockerContainer[]);
    } finally { setLoadingFor('containers', false); }
  }, []);

  const loadImages = useCallback(async () => {
    setLoadingFor('images', true);
    try {
      const result = await window.electronAPI.docker.listImages();
      if (!('error' in result)) setImages(result as DockerImage[]);
    } finally { setLoadingFor('images', false); }
  }, []);

  const loadCompose = useCallback(async () => {
    setLoadingFor('compose', true);
    try {
      const result = await window.electronAPI.docker.listCompose();
      if (!('error' in result)) setCompose(result as ComposeProject[]);
    } finally { setLoadingFor('compose', false); }
  }, []);

  const loadVolumes = useCallback(async () => {
    setLoadingFor('volumes', true);
    try {
      const result = await window.electronAPI.docker.listVolumes();
      if (!('error' in result)) setVolumes(result as DockerVolume[]);
    } finally { setLoadingFor('volumes', false); }
  }, []);

  const loadNetworks = useCallback(async () => {
    setLoadingFor('networks', true);
    try {
      const result = await window.electronAPI.docker.listNetworks();
      if (!('error' in result)) setNetworks(result as DockerNetwork[]);
    } finally { setLoadingFor('networks', false); }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadContainers(), loadImages(), loadCompose(), loadVolumes(), loadNetworks()]);
  }, [loadContainers, loadImages, loadCompose, loadVolumes, loadNetworks]);

  useEffect(() => { checkAvailability(); }, [checkAvailability]);
  useEffect(() => {
    if (availability.status === 'available') loadAll();
  }, [availability.status, loadAll]);

  // ── Error states ──────────────────────────────────────────────────────────

  if (availability.status === 'checking') {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground gap-2">
        <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Connecting to Docker...</span>
      </div>
    );
  }

  if (availability.status === 'unavailable') {
    const isNotInstalled = availability.reason === 'notInstalled';
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-3">
        <AlertTriangle className="size-8 text-yellow-500" />
        <p className="text-sm font-medium text-foreground">
          {isNotInstalled ? 'Docker not found' : 'Docker not running'}
        </p>
        <p className="text-xs text-center max-w-sm">
          {isNotInstalled
            ? 'Install Docker Desktop to use this panel.'
            : availability.reason === 'daemon'
              ? 'Start Docker Desktop or the Docker daemon to connect.'
              : availability.reason}
        </p>
        <Button variant="outline" size="sm" onClick={checkAvailability}>
          <RefreshCw className="size-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  // ── Detail views ──────────────────────────────────────────────────────────

  if (detailView?.kind === 'container') {
    return (
      <ContainerDetail
        container={detailView.container}
        onBack={() => setDetailView(null)}
      />
    );
  }

  if (detailView?.kind === 'volume') {
    return (
      <VolumeDetail
        volume={detailView.volume}
        onBack={() => setDetailView(null)}
        onRemoved={() => {
          setDetailView(null);
          loadVolumes();
        }}
      />
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-background text-foreground text-sm">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-border flex flex-col overflow-hidden bg-muted/20">
        <div className="p-2.5 border-b border-border">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium px-0.5">
            Docker
          </span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.key}
              className={cn(
                'w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors rounded-sm',
                section === item.key
                  ? 'bg-accent/80 text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
              onClick={() => {
                setSection(item.key);
                setDetailView(null);
              }}
            >
              <div className="flex items-center gap-2">
                {item.icon}
                {item.label}
              </div>
              {counts[item.key] > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {counts[item.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {section === 'containers' && (
          <ContainerList
            containers={containers}
            loading={loading.containers}
            onRefresh={loadContainers}
            onSelect={(c) => setDetailView({ kind: 'container', container: c })}
          />
        )}
        {section === 'images' && (
          <ImageList images={images} loading={loading.images} onRefresh={loadImages} />
        )}
        {section === 'compose' && (
          <ComposeList projects={compose} loading={loading.compose} onRefresh={loadCompose} />
        )}
        {section === 'volumes' && (
          <VolumeList
            volumes={volumes}
            loading={loading.volumes}
            onRefresh={loadVolumes}
            onSelect={(v) => setDetailView({ kind: 'volume', volume: v })}
          />
        )}
        {section === 'networks' && (
          <NetworkList networks={networks} loading={loading.networks} onRefresh={loadNetworks} />
        )}
      </div>
    </div>
  );
}
