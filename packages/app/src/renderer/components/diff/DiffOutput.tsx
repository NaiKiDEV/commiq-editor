import { useMemo } from 'react';
import { diffLines, type Change } from 'diff';
import { cn } from '@/lib/utils';

export type ViewMode = 'unified' | 'split';

// ── helpers ──────────────────────────────────────────────────────────────────

function splitValue(value: string): string[] {
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// ── unified ──────────────────────────────────────────────────────────────────

type UnifiedLine = {
  leftNum: number | null;
  rightNum: number | null;
  content: string;
  type: 'unchanged' | 'removed' | 'added';
};

function buildUnified(changes: Change[]): UnifiedLine[] {
  const lines: UnifiedLine[] = [];
  let leftNum = 1;
  let rightNum = 1;

  for (const change of changes) {
    for (const content of splitValue(change.value)) {
      if (!change.added && !change.removed) {
        lines.push({ leftNum: leftNum++, rightNum: rightNum++, content, type: 'unchanged' });
      } else if (change.removed) {
        lines.push({ leftNum: leftNum++, rightNum: null, content, type: 'removed' });
      } else {
        lines.push({ leftNum: null, rightNum: rightNum++, content, type: 'added' });
      }
    }
  }
  return lines;
}

// ── split ────────────────────────────────────────────────────────────────────

type SideLine = {
  lineNum: number | null;
  content: string;
  type: 'unchanged' | 'removed' | 'added' | 'empty';
};

function buildSplit(changes: Change[]): { left: SideLine[]; right: SideLine[] } {
  const left: SideLine[] = [];
  const right: SideLine[] = [];
  let leftNum = 1;
  let rightNum = 1;

  let i = 0;
  while (i < changes.length) {
    const change = changes[i];
    const lines = splitValue(change.value);

    if (!change.added && !change.removed) {
      for (const line of lines) {
        left.push({ lineNum: leftNum++, content: line, type: 'unchanged' });
        right.push({ lineNum: rightNum++, content: line, type: 'unchanged' });
      }
      i++;
    } else if (change.removed) {
      const next = changes[i + 1];
      const removedLines = lines;
      const addedLines = next?.added ? splitValue(next.value) : [];
      const maxLen = Math.max(removedLines.length, addedLines.length);

      for (let j = 0; j < maxLen; j++) {
        left.push(
          j < removedLines.length
            ? { lineNum: leftNum++, content: removedLines[j], type: 'removed' }
            : { lineNum: null, content: '', type: 'empty' },
        );
        right.push(
          j < addedLines.length
            ? { lineNum: rightNum++, content: addedLines[j], type: 'added' }
            : { lineNum: null, content: '', type: 'empty' },
        );
      }
      i += next?.added ? 2 : 1;
    } else {
      for (const line of lines) {
        left.push({ lineNum: null, content: '', type: 'empty' });
        right.push({ lineNum: rightNum++, content: line, type: 'added' });
      }
      i++;
    }
  }

  return { left, right };
}

// ── styling ──────────────────────────────────────────────────────────────────

const ROW_BG: Record<string, string> = {
  unchanged: '',
  removed: 'bg-red-500/10',
  added: 'bg-green-500/10',
  empty: 'bg-muted/5',
};

const TEXT_COLOR: Record<string, string> = {
  unchanged: 'text-foreground',
  removed: 'text-red-400',
  added: 'text-green-400',
  empty: '',
};

const PREFIX: Record<string, string> = {
  unchanged: ' ',
  removed: '-',
  added: '+',
  empty: ' ',
};

// ── components ───────────────────────────────────────────────────────────────

function LineNum({ n }: { n: number | null }) {
  return (
    <span className="select-none shrink-0 w-10 text-right pr-3 text-muted-foreground/40 font-mono text-xs tabular-nums">
      {n ?? ''}
    </span>
  );
}

function UnifiedView({ lines }: { lines: UnifiedLine[] }) {
  return (
    <div className="overflow-auto flex-1 font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i} className={cn('flex items-start min-w-0 px-2', ROW_BG[line.type])}>
          <LineNum n={line.leftNum} />
          <LineNum n={line.rightNum} />
          <span className={cn('select-none shrink-0 w-4 text-center', TEXT_COLOR[line.type])}>
            {PREFIX[line.type]}
          </span>
          <span className={cn('flex-1 whitespace-pre min-w-0 break-all', TEXT_COLOR[line.type])}>
            {line.content || ' '}
          </span>
        </div>
      ))}
    </div>
  );
}

function SidePane({ lines, label }: { lines: SideLine[]; label: string }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 border-r border-border last:border-0">
      <div className="px-3 py-1 border-b border-border shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="overflow-auto flex-1 font-mono text-xs leading-5">
        {lines.map((line, i) => (
          <div key={i} className={cn('flex items-start min-w-0 px-2', ROW_BG[line.type])}>
            <LineNum n={line.lineNum} />
            <span className={cn('select-none shrink-0 w-4 text-center', TEXT_COLOR[line.type])}>
              {PREFIX[line.type]}
            </span>
            <span className={cn('flex-1 whitespace-pre min-w-0 break-all', TEXT_COLOR[line.type])}>
              {line.content || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── public ───────────────────────────────────────────────────────────────────

export type DiffStats = { added: number; removed: number; unchanged: number };

type DiffOutputProps = {
  original: string;
  modified: string;
  mode: ViewMode;
};

export function DiffOutput({ original, modified, mode }: DiffOutputProps) {
  const changes = useMemo(
    () => diffLines(original || '', modified || ''),
    [original, modified],
  );
  const unifiedLines = useMemo(() => buildUnified(changes), [changes]);
  const splitPanes = useMemo(() => buildSplit(changes), [changes]);

  if (mode === 'unified') {
    return <UnifiedView lines={unifiedLines} />;
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <SidePane lines={splitPanes.left} label="Original" />
      <SidePane lines={splitPanes.right} label="Modified" />
    </div>
  );
}

export function computeStats(original: string, modified: string): DiffStats {
  const changes = diffLines(original || '', modified || '');
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const c of changes) {
    const n = c.count ?? splitValue(c.value).length;
    if (c.added) added += n;
    else if (c.removed) removed += n;
    else unchanged += n;
  }
  return { added, removed, unchanged };
}
