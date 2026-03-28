import { useState, useMemo, useCallback, useRef } from 'react';
import { Copy, Check, FileText, Hash, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

// ── parsing ────────────────────────────────────────────────────────────────────

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) return null;
  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      if (isNaN(byte)) return null;
      bytes[i] = byte;
    }
    return bytes;
  } catch {
    return null;
  }
}

// ── formatting ─────────────────────────────────────────────────────────────────

const BYTES_PER_ROW = 16;

function isPrintable(b: number): boolean {
  return b >= 0x20 && b < 0x7f;
}

interface HexRow {
  offset: number;
  bytes: number[];
}

function buildRows(bytes: Uint8Array): HexRow[] {
  const rows: HexRow[] = [];
  for (let i = 0; i < bytes.length; i += BYTES_PER_ROW) {
    rows.push({ offset: i, bytes: Array.from(bytes.slice(i, i + BYTES_PER_ROW)) });
  }
  return rows;
}

function formatDump(bytes: Uint8Array): string {
  const rows = buildRows(bytes);
  return rows.map(({ offset, bytes: bs }) => {
    const addr = offset.toString(16).toUpperCase().padStart(8, '0');
    const hex1 = bs.slice(0, 8).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const hex2 = bs.slice(8).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const hexPart = hex1.padEnd(23) + '  ' + hex2.padEnd(23);
    const ascii = bs.map((b) => (isPrintable(b) ? String.fromCharCode(b) : '.')).join('');
    return `${addr}  ${hexPart}  |${ascii}|`;
  }).join('\n');
}

// ── component ──────────────────────────────────────────────────────────────────

type InputMode = 'text' | 'hex';

export function HexDumpPanel({ panelId: _panelId }: { panelId: string }) {
  const [mode, setMode] = useState<InputMode>('text');
  const [input, setInput] = useState('');
  const [selectedOffset, setSelectedOffset] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const bytes = useMemo<Uint8Array | null>(() => {
    if (!input.trim()) return null;
    if (mode === 'text') return textToBytes(input);
    return hexToBytes(input);
  }, [input, mode]);

  const rows = useMemo(() => (bytes ? buildRows(bytes) : []), [bytes]);

  const handleCopy = useCallback(() => {
    if (!bytes) return;
    navigator.clipboard.writeText(formatDump(bytes));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bytes]);

  const handleModeChange = useCallback((m: InputMode) => {
    setMode(m);
    setInput('');
    setSelectedOffset(null);
  }, []);

  const selectedByte = selectedOffset !== null && bytes ? bytes[selectedOffset] : null;

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border flex-wrap shrink-0">
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            onClick={() => handleModeChange('text')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 text-xs transition-colors',
              mode === 'text' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileText className="size-3" />
            Text
          </button>
          <button
            onClick={() => handleModeChange('hex')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 text-xs border-l border-border transition-colors',
              mode === 'hex' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Hash className="size-3" />
            Hex Input
          </button>
        </div>

        {bytes && (
          <span className="text-xs text-muted-foreground font-mono">
            {bytes.length} byte{bytes.length !== 1 ? 's' : ''}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => { setInput(''); setSelectedOffset(null); }} title="Clear" className={cn(!input && 'invisible')}>
            <Trash2 />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy hex dump" className={cn(!bytes && 'invisible')}>
            {copied ? <Check className="text-green-400" /> : <Copy />}
          </Button>
        </div>
      </div>

      {/* Input */}
      <div className="flex flex-col border-b border-border shrink-0" style={{ height: '22%', minHeight: 80 }}>
        <div className="px-3 py-1 border-b border-border shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {mode === 'text' ? 'Text Input' : 'Hex Bytes (e.g. 48 65 6c 6c 6f)'}
          </span>
        </div>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setSelectedOffset(null); }}
          placeholder={mode === 'text' ? 'Paste or type text…' : 'Paste hex bytes (e.g. 48 65 6c 6c 6f 20 57 6f 72 6c 64)…'}
          spellCheck={false}
          className="flex-1 resize-none bg-transparent font-mono text-xs p-3 outline-none text-foreground placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Hex dump output */}
      <div className="flex flex-col flex-1 min-h-0">
        {!bytes ? (
          <div className="flex items-center justify-center flex-1 text-muted-foreground/40">
            <p className="text-xs">{mode === 'text' ? 'Type or paste text above' : 'Paste hex bytes above'}</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-0 px-4 py-1.5 border-b border-border shrink-0 font-mono text-[10px] text-muted-foreground/50 select-none">
              <span className="w-20 shrink-0">Offset</span>
              <span className="flex-1">Hex</span>
              <span className="w-20 text-right">ASCII</span>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto">
              {rows.map(({ offset, bytes: rowBytes }) => (
                <div key={offset} className="flex items-start px-4 py-0.5 hover:bg-muted/20 group font-mono text-xs">
                  {/* Address */}
                  <span className="w-20 shrink-0 text-muted-foreground/50 select-none">
                    {offset.toString(16).toUpperCase().padStart(8, '0')}
                  </span>

                  {/* Hex bytes */}
                  <div className="flex flex-wrap flex-1 gap-x-0.5">
                    {rowBytes.map((byte, i) => {
                      const absOffset = offset + i;
                      const isSelected = absOffset === selectedOffset;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedOffset(isSelected ? null : absOffset)}
                          className={cn(
                            'w-6 text-center rounded transition-colors',
                            i === 8 ? 'ml-2' : '',
                            isSelected
                              ? 'bg-primary/20 text-primary'
                              : 'text-foreground hover:bg-muted/40',
                          )}
                        >
                          {byte.toString(16).toUpperCase().padStart(2, '0')}
                        </button>
                      );
                    })}
                    {/* Pad to full row */}
                    {rowBytes.length < BYTES_PER_ROW && (
                      <span style={{ width: (BYTES_PER_ROW - rowBytes.length) * 24 + (rowBytes.length <= 8 ? 8 : 0) }} />
                    )}
                  </div>

                  {/* ASCII */}
                  <span className="w-20 text-right text-muted-foreground/60 select-none pl-2">
                    {rowBytes.map((b, i) => {
                      const absOffset = offset + i;
                      const isSelected = absOffset === selectedOffset;
                      return (
                        <span key={i} className={cn(isSelected ? 'text-primary' : '')}>
                          {isPrintable(b) ? String.fromCharCode(b) : '.'}
                        </span>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>

            {/* Selected byte info */}
            {selectedOffset !== null && selectedByte !== null && (
              <div className="flex items-center gap-6 px-4 py-2 border-t border-border shrink-0 text-xs bg-muted/20">
                <span className="text-muted-foreground">Offset</span>
                <span className="font-mono">{selectedOffset} (0x{selectedOffset.toString(16).toUpperCase()})</span>
                <span className="text-muted-foreground">Hex</span>
                <span className="font-mono text-primary">{selectedByte.toString(16).toUpperCase().padStart(2, '0')}</span>
                <span className="text-muted-foreground">Dec</span>
                <span className="font-mono">{selectedByte}</span>
                <span className="text-muted-foreground">Bin</span>
                <span className="font-mono">{selectedByte.toString(2).padStart(8, '0')}</span>
                <span className="text-muted-foreground">Char</span>
                <span className="font-mono">{isPrintable(selectedByte) ? String.fromCharCode(selectedByte) : '·'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
