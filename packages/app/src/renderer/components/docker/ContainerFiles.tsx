import { useEffect, useState, useCallback } from 'react';
import {
  Folder,
  FileText,
  ChevronRight,
  ArrowLeft,
  Loader2,
  X,
  Home,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { DockerContainer } from './types';

type Props = { container: DockerContainer };

type FileEntry = {
  type: 'd' | 'f' | 'l' | 'o';
  permissions: string;
  size: string;
  name: string;
  linkTarget?: string;
};

function parseLsOutput(output: string): FileEntry[] {
  const lines = output.split('\n').filter(Boolean);
  const entries: FileEntry[] = [];

  for (const line of lines) {
    if (line.startsWith('total ') || !line.trim()) continue;

    // Format: permissions links user group size month day time/year name [-> target]
    const match = line.match(
      /^([dlcbps-])([\w-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/,
    );
    if (!match) continue;

    const [, typeChar, perms, size, rest] = match;
    const isLink = rest.includes(' -> ');
    const name = isLink ? rest.split(' -> ')[0] : rest;
    const linkTarget = isLink ? rest.split(' -> ')[1] : undefined;

    if (name === '.' || name === '..') continue;

    entries.push({
      type: typeChar === 'd' ? 'd' : typeChar === 'l' ? 'l' : typeChar === '-' ? 'f' : 'o',
      permissions: perms,
      size,
      name,
      linkTarget,
    });
  }

  // Directories first, then files
  return [
    ...entries.filter((e) => e.type === 'd'),
    ...entries.filter((e) => e.type !== 'd'),
  ];
}

function formatSize(size: string): string {
  const bytes = parseInt(size, 10);
  if (isNaN(bytes)) return size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function ContainerFiles({ container }: Props) {
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileView, setFileView] = useState<{ path: string; content: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      setFileView(null);
      try {
        const result = await window.electronAPI.docker.filesList(container.ID, path);
        if ('error' in result && result.error) {
          setError(result.error);
          setEntries([]);
        } else if ('output' in result && result.output) {
          setEntries(parseLsOutput(result.output));
          setCurrentPath(path);
        }
      } finally {
        setLoading(false);
      }
    },
    [container.ID],
  );

  useEffect(() => {
    loadDir('/');
  }, [loadDir]);

  const navigate = (entry: FileEntry) => {
    if (entry.type === 'd' || entry.type === 'l') {
      const newPath =
        currentPath === '/'
          ? `/${entry.name}`
          : `${currentPath}/${entry.name}`;
      loadDir(newPath);
    } else if (entry.type === 'f') {
      openFile(`${currentPath === '/' ? '' : currentPath}/${entry.name}`);
    }
  };

  const openFile = async (path: string) => {
    setFileLoading(true);
    setFileView(null);
    try {
      const result = await window.electronAPI.docker.filesRead(container.ID, path);
      if ('content' in result && result.content !== undefined) {
        setFileView({ path, content: result.content });
      } else if ('error' in result) {
        setError(result.error ?? 'Failed to read file');
      }
    } finally {
      setFileLoading(false);
    }
  };

  const goUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    loadDir(parts.length === 0 ? '/' : '/' + parts.join('/'));
  };

  // Breadcrumb segments
  const pathSegments = currentPath === '/'
    ? []
    : currentPath.split('/').filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0 bg-muted/20">
        <button
          className="flex items-center justify-center size-5 rounded hover:bg-muted transition-colors"
          onClick={() => loadDir('/')}
          title="Go to root"
        >
          <Home className="size-3 text-muted-foreground" />
        </button>
        {currentPath !== '/' && (
          <button
            className="flex items-center justify-center size-5 rounded hover:bg-muted transition-colors"
            onClick={goUp}
            title="Go up"
          >
            <ArrowLeft className="size-3 text-muted-foreground" />
          </button>
        )}
        <div className="flex items-center gap-0.5 text-[11px] font-mono overflow-x-auto flex-1 min-w-0">
          <span className="text-muted-foreground">/</span>
          {pathSegments.map((seg, i) => {
            const pathTo = '/' + pathSegments.slice(0, i + 1).join('/');
            return (
              <span key={i} className="flex items-center gap-0.5">
                <button
                  className="text-foreground/70 hover:text-foreground transition-colors"
                  onClick={() => loadDir(pathTo)}
                >
                  {seg}
                </button>
                {i < pathSegments.length - 1 && (
                  <span className="text-muted-foreground">/</span>
                )}
              </span>
            );
          })}
        </div>
        {loading && <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />}
      </div>

      {/* File view overlay */}
      {fileView && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setFileView(null)}
            >
              <X className="size-3" />
            </Button>
            <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">
              {fileView.path}
            </span>
          </div>
          <pre className="flex-1 overflow-auto px-4 py-3 text-[11px] font-mono leading-5 bg-background whitespace-pre-wrap break-all text-foreground/85">
            {fileView.content || <span className="text-muted-foreground italic">Empty file</span>}
          </pre>
        </div>
      )}

      {/* Directory listing */}
      {!fileView && (
        <div className="flex-1 overflow-auto">
          {fileLoading && (
            <div className="flex items-center justify-center h-16 gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Reading file...
            </div>
          )}
          {error && !loading && (
            <div className="px-4 py-4 text-xs text-destructive">{error}</div>
          )}
          {!error && !loading && entries.length === 0 && (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
              Empty directory
            </div>
          )}
          {entries.map((entry) => {
            const isDir = entry.type === 'd';
            const isLink = entry.type === 'l';
            const isNavigable = isDir || isLink;

            return (
              <button
                key={entry.name}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 border-b border-border/40 text-xs transition-colors text-left',
                  isNavigable
                    ? 'hover:bg-muted/50 cursor-pointer'
                    : 'hover:bg-muted/30 cursor-pointer',
                )}
                onClick={() => navigate(entry)}
              >
                {isDir ? (
                  <Folder className="size-3.5 text-blue-400 shrink-0" />
                ) : isLink ? (
                  <Folder className="size-3.5 text-cyan-400 shrink-0" />
                ) : (
                  <FileText className="size-3.5 text-muted-foreground shrink-0" />
                )}

                <span className={cn('flex-1 font-mono truncate', isDir && 'text-blue-300', isLink && 'text-cyan-300')}>
                  {entry.name}
                  {isLink && entry.linkTarget && (
                    <span className="text-muted-foreground ml-1">→ {entry.linkTarget}</span>
                  )}
                </span>

                <span className="text-[10px] text-muted-foreground font-mono tabular-nums shrink-0">
                  {isDir ? '' : formatSize(entry.size)}
                </span>

                <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
                  {entry.permissions}
                </span>

                {isNavigable && <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
