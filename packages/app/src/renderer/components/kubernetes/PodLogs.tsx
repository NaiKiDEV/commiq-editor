import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, ChevronDown, ChevronsDown, Copy, Check, Loader2, Search, X, Pause, Play, Box } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { cn } from '@/lib/utils';

type PodLogsProps = {
  context: string;
  namespace: string;
  podName: string;
  onBack: () => void;
};

const MAX_LINES = 10_000;

export function PodLogs({ context, namespace, podName, onBack }: PodLogsProps) {
  const [containers, setContainers] = useState<string[]>([]);
  const [activeContainer, setActiveContainer] = useState<string>('');
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [paused, setPaused] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pausedLinesRef = useRef<string[]>([]);

  useEffect(() => {
    window.electronAPI.k8s.getPodContainers(context, namespace, podName).then((c) => {
      setContainers(c);
      if (c.length > 0) setActiveContainer(c[0]);
    });
  }, [context, namespace, podName]);

  useEffect(() => {
    if (!activeContainer) return;

    setLines([]);
    setStreaming(true);
    setPaused(false);
    pausedLinesRef.current = [];

    const streamId = crypto.randomUUID();

    const unsubscribe = window.electronAPI.k8s.onLogChunk(streamId, (chunk) => {
      const newLines = chunk.text.split('\n').filter((l) => l.length > 0);
      if (newLines.length === 0) return;
      setLines((prev) => {
        const combined = [...prev, ...newLines];
        return combined.length > MAX_LINES
          ? combined.slice(combined.length - MAX_LINES)
          : combined;
      });
    });

    window.electronAPI.k8s.logsStart(context, namespace, podName, activeContainer, streamId)
      .catch(() => setStreaming(false));

    return () => {
      unsubscribe();
      window.electronAPI.k8s.logsStop(streamId);
      setStreaming(false);
    };
  }, [context, namespace, podName, activeContainer]);

  useEffect(() => {
    if (autoScroll && !paused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, autoScroll, paused]);

  const handleScroll = useCallback(() => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const handleCopy = useCallback(() => {
    const text = filter
      ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())).join('\n')
      : lines.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [lines, filter]);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  const filteredLines = filter
    ? lines.map((line, i) => ({ line, index: i })).filter(({ line }) =>
        line.toLowerCase().includes(filter.toLowerCase())
      )
    : lines.map((line, i) => ({ line, index: i }));

  const matchCount = filter ? filteredLines.length : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold truncate">{podName}</h2>
          <p className="text-[10px] text-muted-foreground">
            Logs &middot; {namespace}
            {lines.length > 0 && ` \u00b7 ${lines.length.toLocaleString()} lines`}
          </p>
        </div>

        {/* Container selector */}
        {containers.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border/60 bg-background hover:border-border transition-colors">
                  <Box className="size-3 text-muted-foreground" />
                  <span className="truncate max-w-28 font-medium">{activeContainer}</span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent align="end">
              {containers.map((c) => (
                <DropdownMenuItem
                  key={c}
                  onClick={() => setActiveContainer(c)}
                  className={cn(c === activeContainer && 'bg-accent')}
                >
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
          {streaming && (
            <div className="flex items-center gap-1 mr-1">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-green-400" />
              </span>
              <span className="text-[10px] text-green-400 font-medium">LIVE</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setPaused(!paused)}
            title={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
            className={cn(paused && 'text-yellow-400')}
          >
            {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowFilter(!showFilter)}
            title="Filter logs"
            className={cn(filter && 'text-blue-400')}
          >
            <Search className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            title="Copy logs"
          >
            {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
          </Button>
          {!autoScroll && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={scrollToBottom}
              title="Scroll to bottom"
            >
              <ChevronsDown className="size-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/30">
          <Search className="size-3 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
            placeholder="Filter log lines..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          {matchCount !== null && (
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
          {filter && (
            <button onClick={() => setFilter('')} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      {/* Log content */}
      <pre
        ref={logRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-4 py-2 text-[11px] font-mono whitespace-pre-wrap break-all leading-5 bg-background"
      >
        {lines.length === 0 && streaming && (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="size-3 animate-spin" />
            <span>Waiting for logs...</span>
          </div>
        )}
        {lines.length === 0 && !streaming && (
          <div className="text-muted-foreground py-8 text-center">
            No logs available
          </div>
        )}
        {filteredLines.map(({ line, index }) => (
          <div
            key={index}
            className={cn(
              'hover:bg-muted/30 px-1 -mx-1 rounded-sm',
              filter && 'bg-yellow-400/5',
            )}
          >
            <span className="text-muted-foreground/30 select-none tabular-nums inline-block w-12 text-right mr-3 text-[10px]">
              {index + 1}
            </span>
            {filter ? highlightMatch(line, filter) : (
              <span className="text-foreground/85">{line}</span>
            )}
          </div>
        ))}
      </pre>

      {/* Paused indicator */}
      {paused && (
        <div className="px-4 py-1 bg-yellow-400/10 border-t border-yellow-400/20 text-center">
          <span className="text-[10px] text-yellow-400 font-medium">
            Auto-scroll paused &mdash; new lines still arriving
          </span>
        </div>
      )}
    </div>
  );
}

function highlightMatch(text: string, search: string): React.ReactNode {
  if (!search) return <span className="text-foreground/85">{text}</span>;
  const lower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let idx = lower.indexOf(searchLower);
  let key = 0;
  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push(<span key={key++} className="text-foreground/85">{text.slice(lastIndex, idx)}</span>);
    }
    parts.push(
      <span key={key++} className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
        {text.slice(idx, idx + search.length)}
      </span>
    );
    lastIndex = idx + search.length;
    idx = lower.indexOf(searchLower, lastIndex);
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++} className="text-foreground/85">{text.slice(lastIndex)}</span>);
  }
  return <>{parts}</>;
}
