import { useState, useMemo, useCallback } from 'react';
import { Copy, Check, ArrowLeftRight } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

// ── types ──────────────────────────────────────────────────────────────────────

type BitWidth = 16 | 32 | 64;

// ── math ───────────────────────────────────────────────────────────────────────

function swapBytes(value: bigint, width: BitWidth): bigint {
  const bytes: number[] = [];
  for (let i = 0; i < width / 8; i++) {
    bytes.push(Number((value >> BigInt(i * 8)) & 0xffn));
  }
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result |= BigInt(bytes[bytes.length - 1 - i]) << BigInt(i * 8);
  }
  return result;
}

function getBytes(value: bigint, width: BitWidth): number[] {
  const out: number[] = [];
  for (let i = width / 8 - 1; i >= 0; i--) {
    out.push(Number((value >> BigInt(i * 8)) & 0xffn));
  }
  return out; // MSB first
}

function mask(width: BitWidth): bigint {
  return (1n << BigInt(width)) - 1n;
}

function toUnsigned(value: bigint, width: BitWidth): bigint {
  return value & mask(width);
}

function toSigned(value: bigint, width: BitWidth): bigint {
  const msb = 1n << BigInt(width - 1);
  const masked = value & mask(width);
  return masked & msb ? masked - (1n << BigInt(width)) : masked;
}

function bitsToFloat32(bits: bigint): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, Number(bits & 0xffffffffn), false);
  return view.getFloat32(0, false);
}

function bitsToFloat64(bits: bigint): number {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Number((bits >> 32n) & 0xffffffffn), false);
  view.setUint32(4, Number(bits & 0xffffffffn), false);
  return view.getFloat64(0, false);
}

function parseHexInput(hex: string, width: BitWidth): bigint | null {
  const clean = hex.replace(/^0x/i, '').replace(/[\s_]/g, '');
  if (!clean) return null;
  const maxLen = width / 4;
  if (clean.length > maxLen) return null;
  try {
    return BigInt('0x' + clean) & mask(width);
  } catch {
    return null;
  }
}

// ── presets ────────────────────────────────────────────────────────────────────

function getPresets(width: BitWidth): { label: string; value: bigint }[] {
  const presets: { label: string; value: bigint }[] = [
    { label: '0x12345678', value: 0x12345678n & mask(width) },
    { label: '0xDEADBEEF', value: 0xdeadbeefn & mask(width) },
    { label: '0xCAFEBABE', value: 0xcafebaben & mask(width) },
  ];
  if (width >= 64) {
    presets.push({ label: '0x0102030405060708', value: 0x0102030405060708n & mask(width) });
  }
  return presets;
}

// ── copy hook ──────────────────────────────────────────────────────────────────

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);
  return { copiedKey, copy };
}

// ── byte block component ───────────────────────────────────────────────────────

function ByteBlocks({ bytes, label, highlight }: { bytes: number[]; label: string; highlight?: number }) {
  const colors = [
    'bg-blue-500/20 border-blue-500/40 text-blue-300',
    'bg-green-500/20 border-green-500/40 text-green-300',
    'bg-orange-500/20 border-orange-500/40 text-orange-300',
    'bg-purple-500/20 border-purple-500/40 text-purple-300',
    'bg-pink-500/20 border-pink-500/40 text-pink-300',
    'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
    'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
    'bg-red-500/20 border-red-500/40 text-red-300',
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {bytes.map((byte, i) => (
          <div
            key={i}
            className={cn(
              'flex flex-col items-center justify-center w-12 h-12 rounded border font-mono text-xs select-none',
              colors[i % colors.length],
              highlight === i ? 'ring-2 ring-primary/60' : '',
            )}
          >
            <span className="text-[9px] text-inherit/50 leading-none opacity-60">B{bytes.length - 1 - i}</span>
            <span className="leading-none mt-0.5">{byte.toString(16).toUpperCase().padStart(2, '0')}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {bytes.map((_, i) => (
          <span key={i} className="w-12 text-center text-[9px] text-muted-foreground/40 font-mono select-none">
            +{i}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── value table ────────────────────────────────────────────────────────────────

interface Interpretation {
  label: string;
  be: string;
  le: string;
}

function buildInterpretations(beValue: bigint, leValue: bigint, width: BitWidth): Interpretation[] {
  const rows: Interpretation[] = [
    {
      label: 'Hex',
      be: '0x' + beValue.toString(16).toUpperCase().padStart(width / 4, '0'),
      le: '0x' + leValue.toString(16).toUpperCase().padStart(width / 4, '0'),
    },
    {
      label: 'Unsigned',
      be: toUnsigned(beValue, width).toString(),
      le: toUnsigned(leValue, width).toString(),
    },
    {
      label: 'Signed',
      be: toSigned(beValue, width).toString(),
      le: toSigned(leValue, width).toString(),
    },
  ];

  if (width === 32) {
    rows.push({
      label: 'Float32',
      be: bitsToFloat32(beValue).toPrecision(8).replace(/\.?0+$/, ''),
      le: bitsToFloat32(leValue).toPrecision(8).replace(/\.?0+$/, ''),
    });
  }
  if (width === 64) {
    rows.push({
      label: 'Float64',
      be: bitsToFloat64(beValue).toPrecision(15).replace(/\.?0+$/, ''),
      le: bitsToFloat64(leValue).toPrecision(15).replace(/\.?0+$/, ''),
    });
  }

  return rows;
}

// ── component ──────────────────────────────────────────────────────────────────

export function EndianPanel({ panelId: _panelId }: { panelId: string }) {
  const [width, setWidth] = useState<BitWidth>(32);
  const [hexInput, setHexInput] = useState('12345678');
  const [beValue, setBeValue] = useState<bigint>(0x12345678n);
  const { copiedKey, copy } = useCopy();

  const leValue = useMemo(() => swapBytes(beValue, width), [beValue, width]);
  const beBytes = useMemo(() => getBytes(beValue, width), [beValue, width]);
  const leBytes = useMemo(() => getBytes(leValue, width), [leValue, width]);
  const interpretations = useMemo(() => buildInterpretations(beValue, leValue, width), [beValue, leValue, width]);

  const applyBeValue = useCallback((val: bigint, w: BitWidth) => {
    const masked = val & mask(w);
    setBeValue(masked);
    setHexInput(masked.toString(16).toUpperCase().padStart(w / 4, '0'));
  }, []);

  const handleHexChange = useCallback((s: string) => {
    setHexInput(s);
    const parsed = parseHexInput(s, width);
    if (parsed !== null) setBeValue(parsed);
  }, [width]);

  const handleWidthChange = useCallback((w: BitWidth) => {
    setWidth(w);
    applyBeValue(beValue, w);
  }, [beValue, applyBeValue]);

  const handleSwap = useCallback(() => {
    applyBeValue(leValue, width);
  }, [leValue, width, applyBeValue]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {/* Controls */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Width</span>
          {([16, 32, 64] as BitWidth[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWidthChange(w)}
              className={cn(
                'px-2 py-0.5 rounded text-xs border font-mono transition-colors',
                width === w
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Hex input */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Value (Big-Endian / Network Order)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">0x</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              onFocus={(e) => e.target.select()}
              spellCheck={false}
              className="flex-1 min-w-0 bg-muted/40 border border-border rounded px-2 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            />
          </div>
        </div>
        <Button variant="ghost" size="xs" onClick={handleSwap} title="Swap: treat current as LE, re-interpret as BE" className="mt-5">
          <ArrowLeftRight className="size-3" />
          Swap
        </Button>
      </div>

      {/* Byte visualizations */}
      <div className="flex flex-col gap-5 px-4 py-4 border-b border-border">
        <ByteBlocks bytes={beBytes} label="Big-Endian (network order) — MSB at lowest address" />
        <ByteBlocks bytes={leBytes} label="Little-Endian (x86/ARM default) — LSB at lowest address" />
      </div>

      {/* Interpretation table */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Interpretations</span>
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-3 py-2 text-muted-foreground font-normal text-[10px] uppercase tracking-wider w-24">Type</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-normal text-[10px] uppercase tracking-wider">Big-Endian</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-normal text-[10px] uppercase tracking-wider border-l border-border">Little-Endian</th>
              </tr>
            </thead>
            <tbody>
              {interpretations.map((row, i) => (
                <tr key={row.label} className={cn('border-b border-border last:border-0', i % 2 === 0 ? '' : 'bg-muted/10')}>
                  <td className="px-3 py-2 text-muted-foreground text-[10px] uppercase tracking-wider">{row.label}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="flex-1 truncate text-foreground">{row.be}</span>
                      <button
                        onClick={() => copy(row.be, `be-${row.label}`)}
                        className="shrink-0 p-1 rounded hover:bg-muted/40 transition-colors opacity-0 group-hover:opacity-100"
                        title="Copy"
                      >
                        {copiedKey === `be-${row.label}` ? <Check className="size-3 text-green-400" /> : <Copy className="size-3 text-muted-foreground" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 border-l border-border">
                    <div className="flex items-center gap-1">
                      <span className="flex-1 truncate text-foreground">{row.le}</span>
                      <button
                        onClick={() => copy(row.le, `le-${row.label}`)}
                        className="shrink-0 p-1 rounded hover:bg-muted/40 transition-colors"
                        title="Copy"
                      >
                        {copiedKey === `le-${row.label}` ? <Check className="size-3 text-green-400" /> : <Copy className="size-3 text-muted-foreground" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Presets</span>
        <div className="flex flex-wrap gap-1.5">
          {getPresets(width).map((p) => (
            <button
              key={p.label}
              onClick={() => applyBeValue(p.value, width)}
              className="px-2.5 py-1 rounded text-xs border border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors font-mono"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
