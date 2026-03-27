import { useState, useMemo, useRef, useCallback } from 'react';
import { BookOpen } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

type Flags = { g: boolean; i: boolean; m: boolean; s: boolean };
const FLAG_KEYS: (keyof Flags)[] = ['g', 'i', 'm', 's'];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHighlightedHtml(text: string, matches: RegExpExecArray[]): string {
  if (!matches.length) return escapeHtml(text);
  const parts: string[] = [];
  let last = 0;
  for (const m of matches) {
    const start = m.index!;
    const end = start + m[0].length;
    if (start > last) parts.push(escapeHtml(text.slice(last, start)));
    if (m[0].length > 0) {
      parts.push(
        `<mark style="background:rgba(250,204,21,0.35);color:transparent;border-radius:2px">${escapeHtml(m[0])}</mark>`,
      );
    }
    last = end;
  }
  if (last < text.length) parts.push(escapeHtml(text.slice(last)));
  return parts.join('') + '\n';
}

type RefItem = { token: string; desc: string };
type RefSection = { title: string; items: RefItem[] };

const REGEX_REFERENCE: RefSection[] = [
  {
    title: 'Anchors',
    items: [
      { token: '^', desc: 'Start of string' },
      { token: '$', desc: 'End of string' },
      { token: '\\b', desc: 'Word boundary' },
      { token: '\\B', desc: 'Non-word boundary' },
    ],
  },
  {
    title: 'Character Classes',
    items: [
      { token: '.', desc: 'Any char (not newline)' },
      { token: '\\d', desc: 'Digit [0-9]' },
      { token: '\\D', desc: 'Non-digit' },
      { token: '\\w', desc: 'Word char [a-zA-Z0-9_]' },
      { token: '\\W', desc: 'Non-word char' },
      { token: '\\s', desc: 'Whitespace' },
      { token: '\\S', desc: 'Non-whitespace' },
      { token: '[abc]', desc: 'Character set' },
      { token: '[^abc]', desc: 'Negated set' },
      { token: '[a-z]', desc: 'Range' },
    ],
  },
  {
    title: 'Quantifiers',
    items: [
      { token: '*', desc: '0 or more' },
      { token: '+', desc: '1 or more' },
      { token: '?', desc: '0 or 1 (optional)' },
      { token: '{n}', desc: 'Exactly n' },
      { token: '{n,}', desc: 'n or more' },
      { token: '{n,m}', desc: 'Between n and m' },
      { token: '*?', desc: 'Lazy — 0 or more' },
      { token: '+?', desc: 'Lazy — 1 or more' },
    ],
  },
  {
    title: 'Groups',
    items: [
      { token: '(abc)', desc: 'Capture group' },
      { token: '(?:abc)', desc: 'Non-capturing group' },
      { token: '(?<n>abc)', desc: 'Named group' },
      { token: '(a|b)', desc: 'Alternation' },
      { token: '(?=abc)', desc: 'Positive lookahead' },
      { token: '(?!abc)', desc: 'Negative lookahead' },
      { token: '(?<=abc)', desc: 'Positive lookbehind' },
      { token: '(?<!abc)', desc: 'Negative lookbehind' },
    ],
  },
  {
    title: 'Escape Sequences',
    items: [
      { token: '\\n', desc: 'Newline' },
      { token: '\\t', desc: 'Tab' },
      { token: '\\r', desc: 'Carriage return' },
      { token: '\\.', desc: 'Literal dot' },
      { token: '\\*', desc: 'Literal asterisk' },
      { token: '\\(', desc: 'Literal parenthesis' },
    ],
  },
  {
    title: 'Flags',
    items: [
      { token: 'g', desc: 'All matches (global)' },
      { token: 'i', desc: 'Case insensitive' },
      { token: 'm', desc: '^ and $ match lines' },
      { token: 's', desc: '. matches newline' },
    ],
  },
];

export function RegexPlaygroundPanel({ panelId: _panelId }: { panelId: string }) {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Flags>({ g: true, i: false, m: false, s: false });
  const [testString, setTestString] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const toggleFlag = useCallback((key: keyof Flags) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const syncScroll = useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const appendToken = useCallback((token: string) => {
    setPattern((prev) => prev + token);
  }, []);

  const { regex, error } = useMemo(() => {
    if (!pattern) return { regex: null, error: null };
    try {
      const flagStr = FLAG_KEYS.filter((k) => flags[k]).join('');
      return { regex: new RegExp(pattern, flagStr), error: null };
    } catch (e) {
      return { regex: null, error: (e as Error).message };
    }
  }, [pattern, flags]);

  const matches = useMemo(() => {
    if (!regex || !testString) return [];
    const results: RegExpExecArray[] = [];
    if (flags.g) {
      const r = new RegExp(regex.source, regex.flags);
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = r.exec(testString)) !== null && guard < 1000) {
        results.push(m);
        if (m[0].length === 0) r.lastIndex++;
        guard++;
      }
    } else {
      const m = regex.exec(testString);
      if (m) results.push(m);
    }
    return results;
  }, [regex, testString, flags.g]);

  const highlightedHtml = useMemo(
    () => buildHighlightedHtml(testString, matches),
    [testString, matches],
  );

  const hasGroups = matches.some((m) => m.length > 1);

  const matchSummary = !pattern
    ? null
    : error
      ? null
      : matches.length === 0
        ? 'no matches'
        : `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Pattern bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
        <span className="font-mono text-muted-foreground text-base leading-none">/</span>
        <Input
          className="flex-1 border-transparent bg-transparent focus-visible:border-transparent focus-visible:ring-0 px-0 h-7 font-mono text-sm"
          placeholder="pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="font-mono text-muted-foreground text-base leading-none">/</span>
        {/* Flag toggles */}
        <div className="flex gap-0.5 ml-0.5">
          {FLAG_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => toggleFlag(k)}
              title={`Toggle /${k} flag`}
              className={cn(
                'w-6 h-6 rounded text-xs font-mono font-bold transition-colors',
                flags[k]
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {k}
            </button>
          ))}
        </div>
        {/* Status */}
        <div className="ml-2 shrink-0 min-w-0">
          {error ? (
            <span
              className="text-xs text-red-400 font-mono truncate block max-w-56"
              title={error}
            >
              {error}
            </span>
          ) : matchSummary ? (
            <span className={cn('text-xs font-mono', matches.length > 0 ? 'text-yellow-400' : 'text-muted-foreground')}>
              {matchSummary}
            </span>
          ) : null}
        </div>
        {/* Guide toggle */}
        <Button
          variant="ghost"
          size="icon-xs"
          title={showGuide ? 'Hide reference' : 'Show reference'}
          onClick={() => setShowGuide((v) => !v)}
          className={showGuide ? 'text-primary' : ''}
        >
          <BookOpen />
        </Button>
      </div>

      {/* Main area: editor + optional guide */}
      <div className="flex flex-1 min-h-0">
        {/* Test string editor */}
        <div className="flex-1 relative min-h-0">
          {/* Highlight backdrop — text is transparent, only mark backgrounds show through */}
          <div
            ref={backdropRef}
            aria-hidden
            className="absolute inset-0 pointer-events-none font-mono text-sm leading-relaxed p-3 whitespace-pre-wrap break-words overflow-hidden"
            style={{ color: 'transparent' }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
          {/* Textarea on top — normal visible text, transparent background */}
          <textarea
            ref={textareaRef}
            className="absolute inset-0 w-full h-full bg-transparent font-mono text-sm leading-relaxed p-3 resize-none outline-none overflow-auto whitespace-pre-wrap break-words"
            placeholder=""
            value={testString}
            onChange={(e) => setTestString(e.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
          />
          {!testString && (
            <span className="absolute top-3 left-3 text-sm font-mono text-muted-foreground/40 pointer-events-none">
              Test string…
            </span>
          )}
        </div>

        {/* Reference guide sidebar */}
        {showGuide && (
          <div className="w-56 shrink-0 border-l border-border flex flex-col overflow-hidden">
            <div className="overflow-y-auto flex-1">
              {REGEX_REFERENCE.map((section) => (
                <div key={section.title} className="border-b border-border/60 last:border-0">
                  <div className="px-3 py-1.5 bg-muted/30">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {section.title}
                    </span>
                  </div>
                  {section.items.map((item) => (
                    <button
                      key={item.token}
                      className="w-full flex items-center gap-2 px-3 py-1 hover:bg-muted/40 text-left group"
                      onClick={() => appendToken(item.token)}
                      title={`Insert: ${item.token}`}
                    >
                      <span className="font-mono text-xs text-primary/90 bg-primary/10 px-1 py-0.5 rounded shrink-0 group-hover:bg-primary/20 transition-colors">
                        {item.token}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {item.desc}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Match results */}
      {matches.length > 0 && (
        <div className="border-t border-border shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Matches
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{matches.length}</span>
            {hasGroups && (
              <span className="text-xs text-muted-foreground/60 ml-auto">
                {matches[0].length - 1} group{matches[0].length - 1 !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="overflow-y-auto max-h-40">
            {matches.map((m, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-3 py-1.5 hover:bg-muted/30 border-b border-border/40 last:border-0"
              >
                <span className="text-xs text-muted-foreground/60 font-mono shrink-0 tabular-nums w-5 text-right mt-px">
                  {i}
                </span>
                <span className="text-xs font-mono text-foreground flex-1 min-w-0 break-all">
                  {m[0].length > 0 ? (
                    <span
                      className="px-1 py-0.5 rounded"
                      style={{ background: 'rgba(250,204,21,0.2)' }}
                    >
                      {m[0]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic text-[11px]">empty match</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground font-mono shrink-0 tabular-nums">
                  @{m.index}
                </span>
                {m.length > 1 && (
                  <div className="flex gap-1 shrink-0 flex-wrap max-w-48">
                    {Array.from({ length: m.length - 1 }, (_, gi) => (
                      <span
                        key={gi}
                        className="text-[11px] font-mono text-blue-400 bg-blue-400/10 px-1 py-0.5 rounded"
                        title={`Group ${gi + 1}`}
                      >
                        {m[gi + 1] ?? <span className="opacity-50">—</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
