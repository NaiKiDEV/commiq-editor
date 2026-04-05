import { useState, useCallback } from 'react';
import { RefreshCw, Trash2, Check, X, Loader2, Scissors, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { DockerImage } from './types';

type ImageListProps = {
  images: DockerImage[];
  loading: boolean;
  onRefresh: () => void;
};

type LayerEntry = {
  ID: string;
  CreatedBy: string;
  CreatedSince: string;
  Size: string;
  Comment: string;
};

function truncateCommand(cmd: string): string {
  // Strip /bin/sh -c prefix for readability
  const stripped = cmd.replace(/^\/bin\/sh -c (#+\(nop\) )?/, '').trim();
  return stripped.length > 80 ? stripped.slice(0, 80) + '…' : stripped;
}

export function ImageList({ images, loading, onRefresh }: ImageListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pruning, setPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<string, LayerEntry[]>>({});
  const [layersLoading, setLayersLoading] = useState<Set<string>>(new Set());

  const setPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  const handleRemove = async (id: string) => {
    setPending(id, true);
    setConfirmingId(null);
    try {
      await window.electronAPI.docker.removeImage(id);
    } finally {
      setPending(id, false);
      onRefresh();
    }
  };

  const handlePrune = async () => {
    setPruning(true);
    setPruneResult(null);
    try {
      const result = await window.electronAPI.docker.pruneImages();
      if ('output' in result && result.output) {
        const match = result.output.match(/Total reclaimed space: (.+)/);
        setPruneResult(match ? `Reclaimed ${match[1]}` : 'Done');
      }
    } finally {
      setPruning(false);
      onRefresh();
      setTimeout(() => setPruneResult(null), 4000);
    }
  };

  const toggleLayers = useCallback(
    async (img: DockerImage) => {
      if (expandedId === img.ID) {
        setExpandedId(null);
        return;
      }
      setExpandedId(img.ID);
      if (layers[img.ID]) return; // already loaded

      setLayersLoading((prev) => new Set(prev).add(img.ID));
      try {
        const result = await window.electronAPI.docker.imageHistory(img.ID);
        if (!('error' in result)) {
          setLayers((prev) => ({ ...prev, [img.ID]: result as LayerEntry[] }));
        }
      } finally {
        setLayersLoading((prev) => {
          const next = new Set(prev);
          next.delete(img.ID);
          return next;
        });
      }
    },
    [expandedId, layers],
  );

  const filtered = filter
    ? images.filter(
        (img) =>
          `${img.Repository}:${img.Tag}`.toLowerCase().includes(filter.toLowerCase()) ||
          img.ID.toLowerCase().includes(filter.toLowerCase()),
      )
    : images;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Images
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">({images.length})</span>
        <div className="flex-1 min-w-0">
          <input
            className="w-full max-w-48 bg-muted/40 border border-border/60 rounded px-2 py-0.5 text-xs outline-none focus:border-ring placeholder:text-muted-foreground/50"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {pruneResult && <span className="text-[10px] text-green-400">{pruneResult}</span>}
        <Button variant="ghost" size="icon-xs" onClick={handlePrune} disabled={pruning} title="Prune unused images">
          <Scissors className={cn('size-3', pruning && 'animate-pulse')} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onRefresh} disabled={loading} title="Refresh">
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            {filter ? 'No images match your filter' : 'No images found'}
          </div>
        )}
        {loading && images.length === 0 && (
          <div className="flex items-center justify-center h-32 gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading...
          </div>
        )}
        {filtered.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground sticky top-0 bg-background">
                <th className="w-6 px-3 py-2" />
                <th className="px-3 py-2 text-left font-medium">Repository:Tag</th>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Size</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((img) => {
                const fullTag =
                  img.Repository === '<none>'
                    ? `<none>:${img.Tag}`
                    : `${img.Repository}:${img.Tag}`;
                const isPending = pendingIds.has(img.ID);
                const isConfirming = confirmingId === img.ID;
                const isExpanded = expandedId === img.ID;
                const isLayersLoading = layersLoading.has(img.ID);
                const imgLayers = layers[img.ID];

                return (
                  <>
                    <tr
                      key={img.ID}
                      className={cn(
                        'border-b border-border/50 transition-colors',
                        isConfirming ? 'bg-destructive/10' : 'hover:bg-muted/40',
                      )}
                    >
                      {/* Layers toggle */}
                      <td className="px-3 py-2.5">
                        <button
                          className="flex items-center justify-center size-4 rounded hover:bg-muted transition-colors"
                          onClick={() => toggleLayers(img)}
                          title="Toggle layers"
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3 text-muted-foreground" />
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-2.5 max-w-56">
                        <span
                          className={cn(
                            'truncate block font-medium',
                            img.Repository === '<none>' && 'text-muted-foreground italic',
                          )}
                          title={fullTag}
                        >
                          {fullTag}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">
                        {img.ID.replace('sha256:', '').slice(0, 12)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{img.Size}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{img.CreatedSince}</td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {isConfirming ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon-xs"
                              variant="destructive"
                              onClick={() => handleRemove(img.ID)}
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
                          <div className="flex justify-end">
                            <Loader2 className="size-3 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title="Remove image"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmingId(img.ID)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Layers expansion */}
                    {isExpanded && (
                      <tr key={`${img.ID}-layers`} className="bg-muted/20 border-b border-border/50">
                        <td colSpan={6} className="px-4 py-2">
                          {isLayersLoading && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                              <Loader2 className="size-3 animate-spin" />
                              Loading layers...
                            </div>
                          )}
                          {imgLayers && imgLayers.length === 0 && (
                            <div className="text-xs text-muted-foreground py-1">No layer history available</div>
                          )}
                          {imgLayers && imgLayers.length > 0 && (
                            <div className="space-y-0.5">
                              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1.5 font-medium">
                                {imgLayers.length} layer{imgLayers.length !== 1 ? 's' : ''}
                              </div>
                              {imgLayers.map((layer, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-3 py-1 border-b border-border/30 last:border-0"
                                >
                                  <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums w-4 shrink-0 pt-0.5">
                                    {imgLayers.length - i}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-mono text-foreground/80 break-all">
                                      {truncateCommand(layer.CreatedBy || '<empty>')}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {layer.CreatedSince}
                                      {layer.Comment && ` · ${layer.Comment}`}
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                                    {layer.Size}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
