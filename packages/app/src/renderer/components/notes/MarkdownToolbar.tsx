import { useState } from 'react';
import {
  Bold, Italic, Code, SquareCode, Link2, List, ListOrdered, ListChecks, Quote, Heading,
  Strikethrough, Minus, Table as TableIcon,
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { Button } from '../ui/button';

export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'codeblock'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'checklist'
  | 'quote'
  | 'hr';

export type Selection = { start: number; end: number };

type TransformResult = { value: string; selStart: number; selEnd: number };

const WRAPS: Partial<Record<MarkdownAction, { token: string; placeholder: string }>> = {
  bold: { token: '**', placeholder: 'bold text' },
  italic: { token: '*', placeholder: 'italic text' },
  strike: { token: '~~', placeholder: 'strikethrough' },
  code: { token: '`', placeholder: 'code' },
};

const LINE_PREFIXES: Partial<Record<MarkdownAction, string>> = {
  ul: '- ',
  ol: '1. ',
  checklist: '- [ ] ',
  quote: '> ',
};

const HEADING_LEVELS: Partial<Record<MarkdownAction, number>> = { h1: 1, h2: 2, h3: 3 };

function lineBounds(value: string, start: number, end: number): { lineStart: number; sliceEnd: number } {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end);
  return { lineStart, sliceEnd: lineEnd === -1 ? value.length : lineEnd };
}

function wrapSelection(value: string, start: number, end: number, token: string, placeholder: string): TransformResult {
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + token + selected + token + value.slice(end);
  return { value: next, selStart: start + token.length, selEnd: start + token.length + selected.length };
}

function prefixLines(value: string, start: number, end: number, prefix: string): TransformResult {
  const { lineStart, sliceEnd } = lineBounds(value, start, end);
  const lines = value.slice(lineStart, sliceEnd).split('\n');
  const allPrefixed = lines.every((l) => l.startsWith(prefix));
  const transformed = lines.map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l)).join('\n');
  const next = value.slice(0, lineStart) + transformed + value.slice(sliceEnd);
  return { value: next, selStart: lineStart, selEnd: lineStart + transformed.length };
}

function setHeading(value: string, start: number, end: number, level: number): TransformResult {
  const { lineStart, sliceEnd } = lineBounds(value, start, end);
  const lines = value.slice(lineStart, sliceEnd).split('\n');
  const target = '#'.repeat(level) + ' ';
  // Re-applying the same level clears the heading; otherwise normalize to it.
  const allSame = lines.every((l) => l.startsWith(target));
  const transformed = lines
    .map((l) => {
      const stripped = l.replace(/^#{1,6}\s+/, '');
      return allSame ? stripped : target + stripped;
    })
    .join('\n');
  const next = value.slice(0, lineStart) + transformed + value.slice(sliceEnd);
  return { value: next, selStart: lineStart, selEnd: lineStart + transformed.length };
}

function linkSnippet(value: string, start: number, end: number): TransformResult {
  const text = value.slice(start, end) || 'link text';
  const snippet = `[${text}](url)`;
  const next = value.slice(0, start) + snippet + value.slice(end);
  const urlStart = start + text.length + 3; // "[" + text + "]("
  return { value: next, selStart: urlStart, selEnd: urlStart + 3 };
}

/** Insert a block on its own lines, preserving surrounding blank-line spacing. */
function insertBlock(value: string, start: number, end: number, body: string, selectInner = false): TransformResult {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  const trail = after && !after.startsWith('\n') ? '\n' : '';
  const snippet = `${lead}${body}${trail}`;
  const next = before + snippet + after;
  if (selectInner) {
    const inner = body.replace(/^```\n?/, '').replace(/\n?```$/, '');
    const innerStart = start + lead.length + 4; // after "```\n"
    return { value: next, selStart: innerStart, selEnd: innerStart + inner.length };
  }
  const pos = start + snippet.length;
  return { value: next, selStart: pos, selEnd: pos };
}

/** Compute the edited value and resulting selection for a markdown action. */
export function transformSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownAction,
): TransformResult {
  if (action === 'link') return linkSnippet(value, selectionStart, selectionEnd);
  if (action === 'hr') return insertBlock(value, selectionStart, selectionEnd, '---');
  if (action === 'codeblock') {
    const selected = value.slice(selectionStart, selectionEnd) || 'code';
    return insertBlock(value, selectionStart, selectionEnd, '```\n' + selected + '\n```', true);
  }
  const level = HEADING_LEVELS[action];
  if (level) return setHeading(value, selectionStart, selectionEnd, level);
  const wrap = WRAPS[action];
  if (wrap) return wrapSelection(value, selectionStart, selectionEnd, wrap.token, wrap.placeholder);
  const prefix = LINE_PREFIXES[action];
  if (prefix) return prefixLines(value, selectionStart, selectionEnd, prefix);
  return { value, selStart: selectionStart, selEnd: selectionEnd };
}

export function buildTable(cols: number, rows: number): string {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  const header = '| ' + Array.from({ length: safeCols }, (_, i) => `Column ${i + 1}`).join(' | ') + ' |';
  const sep = '| ' + Array.from({ length: safeCols }, () => '---').join(' | ') + ' |';
  const row = '| ' + Array.from({ length: safeCols }, () => '   ').join(' | ') + ' |';
  const body = Array.from({ length: safeRows }, () => row).join('\n');
  return [header, sep, body].join('\n');
}

const ICON_BTN =
  'flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors';

type ToolbarProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  // Last known caret/selection in the editor, kept up to date by the parent.
  selectionRef: React.RefObject<Selection>;
  value: string;
  onChange: (next: string) => void;
};

export function MarkdownToolbar({ textareaRef, selectionRef, value, onChange }: ToolbarProps) {
  const [tableOpen, setTableOpen] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [tableCols, setTableCols] = useState(3);
  const [tableRows, setTableRows] = useState(3);

  const applyResult = (result: TransformResult) => {
    onChange(result.value);
    selectionRef.current = { start: result.selStart, end: result.selEnd };
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(result.selStart, result.selEnd);
    });
  };

  const apply = (action: MarkdownAction) => {
    const { start, end } = selectionRef.current;
    applyResult(transformSelection(value, start, end, action));
  };

  const insertTable = () => {
    const { start, end } = selectionRef.current;
    applyResult(insertBlock(value, start, end, buildTable(tableCols, tableRows)));
    setTableOpen(false);
  };

  const renderBtn = (action: MarkdownAction, Icon: typeof Bold, title: string) => (
    <button type="button" title={title} onClick={() => apply(action)} className={ICON_BTN}>
      <Icon className="size-3.5" />
    </button>
  );

  const sep = <div className="w-px h-4 bg-border mx-1" />;

  return (
    // preventDefault on mousedown keeps the editor focused even when the click
    // lands on empty toolbar space, so the caret/selection is never lost.
    <div
      className="flex items-center gap-0.5 px-3 py-1 border-b border-border bg-card/50"
      onMouseDown={(e) => e.preventDefault()}
    >
      {renderBtn('bold', Bold, 'Bold (Ctrl+B)')}
      {renderBtn('italic', Italic, 'Italic (Ctrl+I)')}
      {renderBtn('strike', Strikethrough, 'Strikethrough')}
      {renderBtn('code', Code, 'Inline code')}
      {sep}

      {/* Heading level picker */}
      <Popover open={headingOpen} onOpenChange={setHeadingOpen}>
        <PopoverTrigger render={<button type="button" title="Heading" className={ICON_BTN} />}>
          <Heading className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-32 p-1">
          {([1, 2, 3] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => { apply(`h${level}` as MarkdownAction); setHeadingOpen(false); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <span className="text-muted-foreground/50 text-[10px] font-mono w-6">{'#'.repeat(level)}</span>
              <span className={level === 1 ? 'text-sm font-bold' : level === 2 ? 'text-[13px] font-semibold' : 'text-xs font-medium'}>
                Heading {level}
              </span>
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {renderBtn('link', Link2, 'Link')}
      {sep}

      {renderBtn('ul', List, 'Bullet list')}
      {renderBtn('ol', ListOrdered, 'Numbered list')}
      {renderBtn('checklist', ListChecks, 'Checklist')}
      {sep}

      {renderBtn('quote', Quote, 'Quote')}
      {renderBtn('codeblock', SquareCode, 'Code block')}
      {renderBtn('hr', Minus, 'Divider')}

      {/* Table insert popover */}
      <Popover open={tableOpen} onOpenChange={setTableOpen}>
        <PopoverTrigger render={<button type="button" title="Table" className={ICON_BTN} />}>
          <TableIcon className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-52">
          <p className="text-xs font-medium mb-2">Insert table</p>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex-1 text-[11px] text-muted-foreground">
              Columns
              <input
                type="number"
                min={1}
                max={10}
                value={tableCols}
                onChange={(e) => setTableCols(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="mt-1 w-full bg-muted/40 border border-border/60 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-foreground/30"
              />
            </label>
            <label className="flex-1 text-[11px] text-muted-foreground">
              Rows
              <input
                type="number"
                min={1}
                max={20}
                value={tableRows}
                onChange={(e) => setTableRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="mt-1 w-full bg-muted/40 border border-border/60 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-foreground/30"
              />
            </label>
          </div>
          <Button size="sm" className="w-full" onClick={insertTable}>
            <TableIcon className="size-3.5" />
            Insert {tableCols}×{tableRows}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
