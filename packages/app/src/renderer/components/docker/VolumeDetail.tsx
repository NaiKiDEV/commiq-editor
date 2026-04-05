import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Copy, Check, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import type { DockerVolume } from './types';

type Props = {
  volume: DockerVolume;
  onBack: () => void;
  onRemoved: () => void;
};

type InspectData = {
  CreatedAt?: string;
  Driver?: string;
  Labels?: Record<string, string>;
  Mountpoint?: string;
  Name?: string;
  Options?: Record<string, string>;
  Scope?: string;
  Status?: Record<string, unknown>;
  UsageData?: { Size?: number; RefCount?: number };
};

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-2 border-b border-border/40">
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      <span className="text-[11px] font-mono break-all">{value}</span>
    </div>
  );
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function VolumeDetail({ volume, onBack, onRemoved }: Props) {
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    window.electronAPI.docker
      .inspectVolume(volume.Name)
      .then((result) => {
        if (result && typeof result === 'object' && 'error' in result) {
          setError((result as { error: string }).error);
        } else {
          setData(result as InspectData);
        }
      })
      .finally(() => setLoading(false));
  }, [volume.Name]);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await window.electronAPI.docker.removeVolume(volume.Name);
      onRemoved();
    } finally {
      setRemoving(false);
    }
  };

  const handleCopyMount = () => {
    const mp = data?.Mountpoint ?? volume.Mountpoint;
    if (!mp) return;
    navigator.clipboard.writeText(mp);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold font-mono truncate block">{volume.Name}</span>
          <span className="text-[10px] text-muted-foreground">{volume.Driver} &middot; {volume.Scope}</span>
        </div>
        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Remove volume?</span>
            <Button
              size="icon-xs"
              variant="destructive"
              disabled={removing}
              onClick={handleRemove}
            >
              {removing ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => setConfirming(false)}>
              <X className="size-3" />
            </Button>
          </div>
        ) : (
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            title="Remove volume"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
            <Loader2 className="size-3 animate-spin" />
            Loading...
          </div>
        )}
        {error && <div className="text-xs text-destructive py-4">{error}</div>}
        {data && (
          <div className="max-w-2xl">
            <KVRow label="Name" value={data.Name ?? volume.Name} />
            <KVRow label="Driver" value={data.Driver ?? volume.Driver} />
            <KVRow label="Scope" value={data.Scope ?? volume.Scope} />
            <KVRow
              label="Mount Point"
              value={
                <div className="flex items-center gap-2">
                  <span className="break-all">{data.Mountpoint ?? volume.Mountpoint ?? '—'}</span>
                  {(data.Mountpoint ?? volume.Mountpoint) && (
                    <Button size="icon-xs" variant="ghost" onClick={handleCopyMount} title="Copy path">
                      {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
                    </Button>
                  )}
                </div>
              }
            />
            <KVRow label="Created" value={data.CreatedAt ?? '—'} />
            {data.UsageData && (
              <>
                <KVRow
                  label="Size"
                  value={
                    data.UsageData.Size !== undefined && data.UsageData.Size >= 0
                      ? formatBytes(data.UsageData.Size)
                      : 'N/A (run docker system df -v)'
                  }
                />
                <KVRow
                  label="Ref Count"
                  value={data.UsageData.RefCount !== undefined ? String(data.UsageData.RefCount) : '—'}
                />
              </>
            )}
            {data.Labels && Object.keys(data.Labels).length > 0 && (
              <KVRow
                label="Labels"
                value={
                  <div className="space-y-0.5">
                    {Object.entries(data.Labels).map(([k, v]) => (
                      <div key={k} className="text-[10px]">
                        <span className="text-primary">{k}</span>
                        {v && <span className="text-muted-foreground">={v}</span>}
                      </div>
                    ))}
                  </div>
                }
              />
            )}
            {data.Options && Object.keys(data.Options).length > 0 && (
              <KVRow
                label="Options"
                value={
                  <div className="space-y-0.5">
                    {Object.entries(data.Options).map(([k, v]) => (
                      <div key={k} className="text-[10px]">
                        <span className="text-primary">{k}</span>
                        {v && <span className="text-muted-foreground">={v}</span>}
                      </div>
                    ))}
                  </div>
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
