import { useState, useMemo, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── types ──────────────────────────────────────────────────────────────────────

type FloatWidth = 32 | 64;

interface FloatLayout {
  signBits: number;
  expBits: number;
  mantBits: number;
  bias: number;
  totalBits: number;
}

const LAYOUTS: Record<FloatWidth, FloatLayout> = {
  32:  { signBits: 1, expBits: 8,  mantBits: 23, bias: 127,  totalBits: 32 },
  64:  { signBits: 1, expBits: 11, mantBits: 52, bias: 1023, totalBits: 64 },
};

// ── IEEE 754 math ──────────────────────────────────────────────────────────────

function floatToBits(value: number, width: FloatWidth): bigint {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  if (width === 32) {
    view.setFloat32(0, value, false);
    return BigInt(view.getUint32(0, false));
  } else {
    view.setFloat64(0, value, false);
    const hi = BigInt(view.getUint32(0, false));
    const lo = BigInt(view.getUint32(4, false));
    return (hi << 32n) | lo;
  }
}

function bitsToFloat(bits: bigint, width: FloatWidth): number {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  if (width === 32) {
    view.setUint32(0, Number(bits & 0xffffffffn), false);
    return view.getFloat32(0, false);
  } else {
    view.setUint32(0, Number((bits >> 32n) & 0xffffffffn), false);
    view.setUint32(4, Number(bits & 0xffffffffn), false);
    return view.getFloat64(0, false);
  }
}

function analyzeBits(bits: bigint, width: FloatWidth) {
  const layout = LAYOUTS[width];
  const { expBits, mantBits, bias } = layout;

  const sign = Number((bits >> BigInt(expBits + mantBits)) & 1n);
  const rawExp = Number((bits >> BigInt(mantBits)) & ((1n << BigInt(expBits)) - 1n));
  const mantissa = bits & ((1n << BigInt(mantBits)) - 1n);

  const isZero = rawExp === 0 && mantissa === 0n;
  const isDenorm = rawExp === 0 && mantissa !== 0n;
  const isInf = rawExp === (1 << expBits) - 1 && mantissa === 0n;
  const isNaN = rawExp === (1 << expBits) - 1 && mantissa !== 0n;
  const isNormal = !isZero && !isDenorm && !isInf && !isNaN;

  const actualExp = isDenorm ? 1 - bias : rawExp - bias;
  const value = bitsToFloat(bits, width);

  return { sign, rawExp, mantissa, isZero, isDenorm, isInf, isNaN, isNormal, actualExp, value };
}

function parseHex(hex: string, width: FloatWidth): bigint | null {
  const clean = hex.replace(/^0x/i, '').replace(/[\s_]/g, '');
  const maxLen = width / 4;
  if (!clean || clean.length > maxLen) return null;
  try {
    return BigInt('0x' + clean.padStart(maxLen, '0'));
  } catch {
    return null;
  }
}

// ── presets ────────────────────────────────────────────────────────────────────

function getPresets(width: FloatWidth): { label: string; value: number }[] {
  return [
    { label: '0', value: 0 },
    { label: '-0', value: -0 },
    { label: '1', value: 1 },
    { label: '-1', value: -1 },
    { label: 'π', value: Math.PI },
    { label: 'e', value: Math.E },
    { label: '0.1', value: 0.1 },
    { label: 'MAX', value: width === 32 ? 3.4028234663852886e38 : Number.MAX_VALUE },
    { label: 'MIN', value: width === 32 ? 1.1754943508222875e-38 : Number.MIN_VALUE },
    { label: '+Inf', value: Infinity },
    { label: '-Inf', value: -Infinity },
    { label: 'NaN', value: NaN },
  ];
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

// ── component ──────────────────────────────────────────────────────────────────

export function IeeePanel({ panelId: _panelId }: { panelId: string }) {
  const [width, setWidth] = useState<FloatWidth>(32);
  const [bits, setBits] = useState<bigint>(0n);
  const [decInput, setDecInput] = useState('0');
  const [hexInput, setHexInput] = useState('00000000');
  const { copiedKey, copy } = useCopy();

  const layout = LAYOUTS[width];
  const info = useMemo(() => analyzeBits(bits, width), [bits, width]);

  const applyBits = useCallback((newBits: bigint, w: FloatWidth) => {
    const masked = newBits & ((1n << BigInt(w)) - 1n);
    setBits(masked);
    const val = bitsToFloat(masked, w);
    setDecInput(isNaN(val) ? 'NaN' : val.toString());
    setHexInput(masked.toString(16).toUpperCase().padStart(w / 4, '0'));
  }, []);

  const handleDecChange = useCallback((s: string) => {
    setDecInput(s);
    const n = parseFloat(s);
    if (!isNaN(n) || s.trim() === 'NaN') {
      const v = s.trim() === 'NaN' ? NaN : n;
      applyBits(floatToBits(v, width), width);
    }
  }, [width, applyBits]);

  const handleHexChange = useCallback((s: string) => {
    setHexInput(s);
    const parsed = parseHex(s, width);
    if (parsed !== null) {
      const masked = parsed & ((1n << BigInt(width)) - 1n);
      setBits(masked);
      const val = bitsToFloat(masked, width);
      setDecInput(isNaN(val) ? 'NaN' : val.toString());
    }
  }, [width, applyBits]);

  const handleWidthChange = useCallback((w: FloatWidth) => {
    setWidth(w);
    // Re-parse decimal value for new width
    const n = parseFloat(decInput);
    const v = isNaN(n) ? NaN : n;
    applyBits(floatToBits(v, w), w);
  }, [decInput, applyBits]);

  const handleBitToggle = useCallback((bitIndex: number) => {
    applyBits(bits ^ (1n << BigInt(bitIndex)), width);
  }, [bits, width, applyBits]);

  // Bit string: index 0 in string = MSB = bit (width-1)
  const bitString = bits.toString(2).padStart(width, '0');

  // Segment boundaries for coloring: sign | exponent | mantissa
  const signEnd = 0;         // string index of sign bit
  const expEnd = layout.expBits;  // exponent occupies [1 .. expEnd]
  const mantEnd = layout.expBits + layout.mantBits; // mantissa occupies [expEnd+1 .. mantEnd]

  function bitSegment(strIdx: number): 'sign' | 'exp' | 'mant' {
    if (strIdx === signEnd) return 'sign';
    if (strIdx <= expEnd) return 'exp';
    return 'mant';
  }

  const hexStr = bits.toString(16).toUpperCase().padStart(width / 4, '0');

  function classifyValue() {
    if (info.isNaN) return { label: 'NaN', color: 'text-yellow-400' };
    if (info.isInf) return { label: info.sign ? '-Infinity' : '+Infinity', color: 'text-orange-400' };
    if (info.isZero) return { label: info.sign ? '-0' : '+0', color: 'text-muted-foreground' };
    if (info.isDenorm) return { label: 'Denormal', color: 'text-purple-400' };
    return { label: 'Normal', color: 'text-green-400' };
  }
  const classification = classifyValue();

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {/* Controls */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Format</span>
          {([32, 64] as FloatWidth[]).map((w) => (
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
              {w === 32 ? 'float32' : 'float64'}
            </button>
          ))}
        </div>
        <span className={cn('ml-auto text-xs font-mono px-2 py-0.5 rounded border', classification.color,
          info.isNaN ? 'border-yellow-400/30 bg-yellow-400/10' :
          info.isInf ? 'border-orange-400/30 bg-orange-400/10' :
          info.isDenorm ? 'border-purple-400/30 bg-purple-400/10' :
          'border-border bg-muted/20'
        )}>
          {classification.label}
        </span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3 border-b border-border">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Decimal</label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={decInput}
              onChange={(e) => handleDecChange(e.target.value)}
              onFocus={(e) => e.target.select()}
              spellCheck={false}
              className="flex-1 min-w-0 bg-muted/40 border border-border rounded px-2 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            />
            <button onClick={() => copy(decInput, 'dec')} className="shrink-0 p-1.5 rounded hover:bg-muted/40 transition-colors">
              {copiedKey === 'dec' ? <Check className="size-3 text-green-400" /> : <Copy className="size-3 text-muted-foreground" />}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hex Bits</label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              onFocus={(e) => e.target.select()}
              spellCheck={false}
              className="flex-1 min-w-0 bg-muted/40 border border-border rounded px-2 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            />
            <button onClick={() => copy(hexStr, 'hex')} className="shrink-0 p-1.5 rounded hover:bg-muted/40 transition-colors">
              {copiedKey === 'hex' ? <Check className="size-3 text-green-400" /> : <Copy className="size-3 text-muted-foreground" />}
            </button>
          </div>
        </div>
      </div>

      {/* Bit grid */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bit Pattern</span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/50" />Sign</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500/30 border border-blue-500/50" />Exponent</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/30 border border-green-500/50" />Mantissa</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 font-mono">
          {Array.from({ length: width / 8 }, (_, byteIdx) => {
            const byteNum = width / 8 - 1 - byteIdx;
            return (
              <div key={byteIdx} className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground/40 w-8 text-right shrink-0 select-none">B{byteNum}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 8 }, (_, bitInByte) => {
                    const strIdx = byteIdx * 8 + bitInByte;
                    const bitIndex = width - 1 - strIdx;
                    const isOne = bitString[strIdx] === '1';
                    const seg = bitSegment(strIdx);
                    return (
                      <button
                        key={bitInByte}
                        onClick={() => handleBitToggle(bitIndex)}
                        title={`Bit ${bitIndex} — ${seg}`}
                        className={cn(
                          'w-9 h-9 rounded text-xs font-mono border transition-colors select-none',
                          seg === 'sign'
                            ? isOne
                              ? 'bg-red-500/30 border-red-500/50 text-red-300'
                              : 'bg-red-500/5 border-red-500/20 text-muted-foreground/40 hover:border-red-500/40'
                            : seg === 'exp'
                            ? isOne
                              ? 'bg-blue-500/30 border-blue-500/50 text-blue-300'
                              : 'bg-blue-500/5 border-blue-500/20 text-muted-foreground/40 hover:border-blue-500/40'
                            : isOne
                              ? 'bg-green-500/30 border-green-500/50 text-green-300'
                              : 'bg-green-500/5 border-green-500/20 text-muted-foreground/40 hover:border-green-500/40',
                        )}
                      >
                        {isOne ? '1' : '0'}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[9px] text-muted-foreground/40 shrink-0 select-none font-mono">
                  {parseInt(bitString.slice(byteIdx * 8, byteIdx * 8 + 8), 2).toString(16).toUpperCase().padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bit index labels for first row */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-8 shrink-0" />
          <div className="flex gap-0.5">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="w-9 text-[8px] text-center text-muted-foreground/30 select-none font-mono">
                {width - 1 - i}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Breakdown</span>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sign</span>
            <span className={cn('font-mono', info.sign ? 'text-red-400' : 'text-muted-foreground')}>{info.sign} ({info.sign ? 'negative' : 'positive'})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Biased exp</span>
            <span className="font-mono text-blue-300">{info.rawExp} (0x{info.rawExp.toString(16).toUpperCase()})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Actual exp</span>
            <span className="font-mono text-blue-300">
              {info.isDenorm ? `${info.actualExp} (denorm)` : info.isNaN || info.isInf ? '—' : info.actualExp}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mantissa</span>
            <span className="font-mono text-green-300">0x{info.mantissa.toString(16).toUpperCase().padStart(Math.ceil(layout.mantBits / 4), '0')}</span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-muted-foreground">Value</span>
            <span className={cn('font-mono', classification.color)}>
              {info.isNaN ? 'NaN' : info.isInf ? (info.sign ? '-∞' : '+∞') : info.value.toPrecision(15).replace(/\.?0+$/, '')}
            </span>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Presets</span>
        <div className="flex flex-wrap gap-1.5">
          {getPresets(width).map((p) => (
            <button
              key={p.label}
              onClick={() => {
                applyBits(floatToBits(p.value, width), width);
                setDecInput(isNaN(p.value) ? 'NaN' : p.value.toString());
              }}
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
