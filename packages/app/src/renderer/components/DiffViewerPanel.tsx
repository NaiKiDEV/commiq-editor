import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { diffLines } from 'diff';
import { GitCompare, AlignJustify, Columns2, Copy, Check, Trash2, ArrowLeftRight, Braces } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { DiffOutput, type ViewMode } from './diff/DiffOutput';

function splitValue(value: string): string[] {
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function computeStats(original: string, modified: string) {
  const changes = diffLines(original || '', modified || '');
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    const n = c.count ?? splitValue(c.value).length;
    if (c.added) added += n;
    else if (c.removed) removed += n;
  }
  return { added, removed };
}

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function DiffViewerPanel({ panelId: _panelId }: { panelId: string }) {
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');
  const [mode, setMode] = useState<ViewMode>('split');
  const [copied, setCopied] = useState(false);
  const origRef = useRef<HTMLTextAreaElement>(null);
  const modRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputHeightPct, setInputHeightPct] = useState(40);
  const dragging = useRef(false);

  const handleDividerPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleDividerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setInputHeightPct(Math.min(75, Math.max(15, pct)));
  }, []);

  const handleDividerPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    const onUp = () => { dragging.current = false; };
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, []);

  const stats = useMemo(() => computeStats(original, modified), [original, modified]);
  const hasDiff = original !== '' || modified !== '';

  const handleSwap = useCallback(() => {
    setOriginal(modified);
    setModified(original);
  }, [original, modified]);

  const handleFormatJson = useCallback(() => {
    setOriginal((v) => tryFormatJson(v));
    setModified((v) => tryFormatJson(v));
  }, []);

  const buildUnifiedText = useCallback(() => {
    const changes = diffLines(original || '', modified || '');
    return changes
      .map((c) => {
        const prefix = c.added ? '+' : c.removed ? '-' : ' ';
        return c.value
          .split('\n')
          .filter((_, i, arr) => i < arr.length - 1 || arr[i] !== '')
          .map((l) => `${prefix}${l}`)
          .join('\n');
      })
      .join('\n');
  }, [original, modified]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(buildUnifiedText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildUnifiedText]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-background text-foreground text-sm"
      onPointerMove={handleDividerPointerMove}
      onPointerUp={handleDividerPointerUp}
    >
      {/* Input row */}
      <div
        className="grid grid-cols-2 gap-0 border-b border-border min-h-0 overflow-hidden"
        style={{ height: `${inputHeightPct}%` }}
      >
        {/* Original */}
        <div className="flex flex-col border-r border-border min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Original
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setOriginal('')}
              title="Clear"
              className={cn(!original && 'invisible')}
            >
              <Trash2 />
            </Button>
          </div>
          <textarea
            ref={origRef}
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            placeholder="Paste original text here…"
            spellCheck={false}
            className="flex-1 resize-none bg-transparent font-mono text-xs p-3 outline-none text-foreground placeholder:text-muted-foreground/40"
          />
        </div>

        {/* Modified */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Modified
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setModified('')}
              title="Clear"
              className={cn(!modified && 'invisible')}
            >
              <Trash2 />
            </Button>
          </div>
          <textarea
            ref={modRef}
            value={modified}
            onChange={(e) => setModified(e.target.value)}
            placeholder="Paste modified text here…"
            spellCheck={false}
            className="flex-1 resize-none bg-transparent font-mono text-xs p-3 outline-none text-foreground placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Drag handle */}
      <div
        onPointerDown={handleDividerPointerDown}
        className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-primary/40 transition-colors"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        {/* View toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setMode('unified')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 text-xs transition-colors',
              mode === 'unified'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <AlignJustify className="size-3" />
            Unified
          </button>
          <button
            onClick={() => setMode('split')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 text-xs border-l border-border transition-colors',
              mode === 'split'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Columns2 className="size-3" />
            Split
          </button>
        </div>

        <div className="flex items-center gap-1 ml-1">
          <Button variant="ghost" size="xs" onClick={handleSwap} title="Swap sides">
            <ArrowLeftRight className="size-3" />
            Swap
          </Button>
          <Button variant="ghost" size="xs" onClick={handleFormatJson} title="Format as JSON">
            <Braces className="size-3" />
            Format JSON
          </Button>
        </div>

        {/* Stats */}
        {hasDiff && (
          <div className="flex items-center gap-3 ml-2 text-xs font-mono">
            {stats.added > 0 && (
              <span className="text-green-400">+{stats.added}</span>
            )}
            {stats.removed > 0 && (
              <span className="text-red-400">-{stats.removed}</span>
            )}
            {stats.added === 0 && stats.removed === 0 && (
              <span className="text-muted-foreground">No differences</span>
            )}
          </div>
        )}

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            title="Copy unified diff"
            className={cn(!hasDiff && 'invisible')}
          >
            {copied ? <Check className="text-green-400" /> : <Copy />}
          </Button>
        </div>
      </div>

      {/* Diff output */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden min-h-0">
        {!hasDiff ? (
          <div className="flex items-center justify-center flex-1 text-muted-foreground/40">
            <div className="text-center space-y-1">
              <GitCompare className="size-8 mx-auto opacity-30" />
              <p className="text-xs">Paste text in both panes to see the diff</p>
            </div>
          </div>
        ) : (
          <DiffOutput original={original} modified={modified} mode={mode} />
        )}
      </div>
    </div>
  );
}
