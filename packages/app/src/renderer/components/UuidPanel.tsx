import { useState, useCallback } from 'react';
import { v1 as uuidv1, v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { Copy, Check, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

// ── generators ────────────────────────────────────────────────────────────────

const NANOID_ALPHABET = '_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateNanoid(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (b) => NANOID_ALPHABET[b & 63]).join('');
}

function generateUlid(): string {
  const now = BigInt(Date.now());
  const timeChars = new Array(10);
  let ts = now;
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = CROCKFORD[Number(ts & 31n)];
    ts >>= 5n;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  const randChars = new Array(16);
  for (let i = 15; i >= 0; i--) {
    randChars[i] = CROCKFORD[Number(bits & 31n)];
    bits >>= 5n;
  }
  return timeChars.join('') + randChars.join('');
}

const ALPHABETS: Record<string, string> = {
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz0123456789',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  hex: '0123456789abcdef',
  numeric: '0123456789',
};

function generateRandom(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  const result: string[] = [];
  for (const b of bytes) {
    if (result.length >= length) break;
    const idx = b % alphabet.length;
    if (b < Math.floor(256 / alphabet.length) * alphabet.length) {
      result.push(alphabet[idx]);
    }
  }
  // Fill any remaining with direct mod (acceptable for display purposes)
  while (result.length < length) {
    result.push(alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length]);
  }
  return result.join('');
}

// ── types ─────────────────────────────────────────────────────────────────────

type IdType = 'uuid-v4' | 'uuid-v7' | 'uuid-v1' | 'nanoid' | 'ulid' | 'random';

const ID_TYPES: { value: IdType; label: string; description: string }[] = [
  { value: 'uuid-v4', label: 'UUID v4', description: 'Random' },
  { value: 'uuid-v7', label: 'UUID v7', description: 'Time-ordered' },
  { value: 'uuid-v1', label: 'UUID v1', description: 'Timestamp + MAC' },
  { value: 'nanoid', label: 'Nanoid', description: 'URL-safe random' },
  { value: 'ulid', label: 'ULID', description: 'Time-ordered, readable' },
  { value: 'random', label: 'Random', description: 'Custom alphabet' },
];

const COUNTS = [1, 5, 10, 25, 50];

// ── component ─────────────────────────────────────────────────────────────────

export function UuidPanel({ panelId: _panelId }: { panelId: string }) {
  const [idType, setIdType] = useState<IdType>('uuid-v4');
  const [count, setCount] = useState(1);
  const [results, setResults] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [nanoidSize, setNanoidSize] = useState(21);
  const [randomLength, setRandomLength] = useState(32);
  const [randomAlphabet, setRandomAlphabet] = useState('alphanumeric');
  const [customAlphabet, setCustomAlphabet] = useState('');
  const [uppercase, setUppercase] = useState(false);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  const generate = useCallback(() => {
    const alphabet =
      randomAlphabet === 'custom'
        ? customAlphabet || ALPHABETS.alphanumeric
        : ALPHABETS[randomAlphabet];

    const ids = Array.from({ length: count }, () => {
      switch (idType) {
        case 'uuid-v4': {
          const id = uuidv4();
          return uppercase ? id.toUpperCase() : id;
        }
        case 'uuid-v7': {
          const id = uuidv7();
          return uppercase ? id.toUpperCase() : id;
        }
        case 'uuid-v1': {
          const id = uuidv1();
          return uppercase ? id.toUpperCase() : id;
        }
        case 'nanoid':
          return generateNanoid(nanoidSize);
        case 'ulid':
          return generateUlid();
        case 'random':
          return generateRandom(alphabet, randomLength);
      }
    });
    setResults(ids);
  }, [idType, count, nanoidSize, randomLength, randomAlphabet, customAlphabet, uppercase]);

  const copyAll = useCallback(() => {
    copy(results.join('\n'), 'all');
  }, [results, copy]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {/* Type selector */}
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</span>
        <div className="grid grid-cols-3 gap-1.5">
          {ID_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { setIdType(t.value); setResults([]); }}
              className={cn(
                'flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors',
                idType === t.value
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              )}
            >
              <span className="font-medium text-xs">{t.label}</span>
              <span className="text-[10px] opacity-70">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-3 px-4 py-3 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Options</span>

        {/* Count */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16 shrink-0">Count</span>
          <div className="flex gap-1">
            {COUNTS.map((c) => (
              <button
                key={c}
                onClick={() => setCount(c)}
                className={cn(
                  'px-2.5 py-1 rounded text-xs border font-mono transition-colors',
                  count === c
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* UUID uppercase */}
        {(idType === 'uuid-v4' || idType === 'uuid-v7' || idType === 'uuid-v1') && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0">Format</span>
            <div className="flex gap-1">
              {(['lowercase', 'UPPERCASE'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setUppercase(f === 'UPPERCASE')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs border font-mono transition-colors',
                    uppercase === (f === 'UPPERCASE')
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nanoid size */}
        {idType === 'nanoid' && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16 shrink-0">Size</span>
            <input
              type="number"
              min={4}
              max={128}
              value={nanoidSize}
              onChange={(e) => setNanoidSize(Math.max(4, Math.min(128, Number(e.target.value))))}
              className="w-20 bg-muted/40 border border-border rounded px-2 py-1 font-mono text-xs outline-none focus:border-ring"
            />
            <span className="text-xs text-muted-foreground">chars</span>
          </div>
        )}

        {/* Random string options */}
        {idType === 'random' && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16 shrink-0">Length</span>
              <input
                type="number"
                min={1}
                max={512}
                value={randomLength}
                onChange={(e) => setRandomLength(Math.max(1, Math.min(512, Number(e.target.value))))}
                className="w-20 bg-muted/40 border border-border rounded px-2 py-1 font-mono text-xs outline-none focus:border-ring"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16 shrink-0">Alphabet</span>
              {Object.keys(ALPHABETS).concat('custom').map((a) => (
                <button
                  key={a}
                  onClick={() => setRandomAlphabet(a)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] border transition-colors',
                    randomAlphabet === a
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
            {randomAlphabet === 'custom' && (
              <input
                type="text"
                value={customAlphabet}
                onChange={(e) => setCustomAlphabet(e.target.value)}
                placeholder="Enter custom characters…"
                className="bg-muted/40 border border-border rounded px-3 py-1.5 font-mono text-xs outline-none focus:border-ring"
              />
            )}
          </>
        )}
      </div>

      {/* Generate button */}
      <div className="px-4 py-3 border-b border-border">
        <Button onClick={generate} className="w-full" size="sm">
          <RefreshCw className="size-3" />
          Generate
        </Button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="xs" onClick={copyAll}>
                {copiedKey === 'all' ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
                Copy all
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setResults([])} title="Clear">
                <Trash2 />
              </Button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {results.map((id, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20 group"
              >
                <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums w-5 shrink-0 select-none">
                  {i + 1}
                </span>
                <span className="flex-1 font-mono text-xs text-foreground select-all break-all">
                  {id}
                </span>
                <button
                  onClick={() => copy(id, `row-${i}`)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  {copiedKey === `row-${i}`
                    ? <Check className="size-3 text-green-400" />
                    : <Copy className="size-3 text-muted-foreground hover:text-foreground" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && (
        <div className="flex items-center justify-center flex-1 text-muted-foreground/40">
          <p className="text-xs">Press Generate to create IDs</p>
        </div>
      )}
    </div>
  );
}
