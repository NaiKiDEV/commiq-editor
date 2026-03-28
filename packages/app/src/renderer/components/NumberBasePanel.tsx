import { useState, useMemo, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── types ─────────────────────────────────────────────────────────────────────

type BitWidth = 8 | 16 | 32 | 64;
type Field = 'bin' | 'oct' | 'dec' | 'hex';

// ── math ──────────────────────────────────────────────────────────────────────

function widthMask(w: BitWidth): bigint {
  return (1n << BigInt(w)) - 1n;
}

function applyMask(n: bigint, w: BitWidth): bigint {
  return ((n % (1n << BigInt(w))) + (1n << BigInt(w))) % (1n << BigInt(w));
}

function toSigned(raw: bigint, w: BitWidth): bigint {
  const msb = 1n << BigInt(w - 1);
  return raw & msb ? raw - (1n << BigInt(w)) : raw;
}

function parseField(value: string, field: Field, signed: boolean, width: BitWidth): bigint | null {
  const trimmed = value.trim().replace(/[\s_]/g, '');
  if (!trimmed || trimmed === '-') return null;
  try {
    let n: bigint;
    if (field === 'bin') n = BigInt('0b' + trimmed);
    else if (field === 'oct') n = BigInt('0o' + trimmed);
    else if (field === 'hex') n = BigInt('0x' + trimmed);
    else {
      n = BigInt(trimmed);
      if (signed && n < 0n) n = n + (1n << BigInt(width));
    }
    return applyMask(n, width);
  } catch {
    return null;
  }
}

function formatBin(raw: bigint, w: BitWidth): string {
  return (raw & widthMask(w)).toString(2).padStart(w, '0');
}

function formatOct(raw: bigint, w: BitWidth): string {
  return (raw & widthMask(w)).toString(8);
}

function formatHex(raw: bigint, w: BitWidth): string {
  return (raw & widthMask(w)).toString(16).toUpperCase();
}

function formatDec(raw: bigint, w: BitWidth, signed: boolean): string {
  const v = raw & widthMask(w);
  return (signed ? toSigned(v, w) : v).toString();
}

// ── presets ───────────────────────────────────────────────────────────────────

function presets(w: BitWidth): { label: string; value: bigint }[] {
  const max = widthMask(w);
  const signedMax = (1n << BigInt(w - 1)) - 1n;
  const signedMin = -(1n << BigInt(w - 1));
  return [
    { label: '0', value: 0n },
    { label: '1', value: 1n },
    { label: 'MAX_UINT', value: max },
    { label: 'MAX_INT', value: signedMax },
    { label: 'MIN_INT', value: applyMask(signedMin, w) },
    { label: '0xFF', value: applyMask(0xffn, w) },
    { label: '0xDEAD', value: applyMask(0xdeadn, w) },
  ].filter((p) => (p.value & widthMask(w)) === p.value || p.label === 'MIN_INT');
}

// ── component ─────────────────────────────────────────────────────────────────

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);
  return { copiedKey, copy };
}

export function NumberBasePanel({ panelId: _panelId }: { panelId: string }) {
  const [raw, setRaw] = useState<bigint>(0n);
  const [width, setWidth] = useState<BitWidth>(32);
  const [signed, setSigned] = useState(false);
  const [inputs, setInputs] = useState<Record<Field, string>>({
    bin: '0', oct: '0', dec: '0', hex: '0',
  });
  const { copiedKey, copy } = useCopy();

  const derived = useMemo(() => {
    const masked = raw & widthMask(width);
    return {
      bin: formatBin(masked, width),
      oct: formatOct(masked, width),
      dec: formatDec(masked, width, signed),
      hex: formatHex(masked, width),
    };
  }, [raw, width, signed]);

  const setRawAndInputs = useCallback((n: bigint, w: BitWidth, s: boolean) => {
    const masked = n & widthMask(w);
    setRaw(masked);
    setInputs({
      bin: formatBin(masked, w),
      oct: formatOct(masked, w),
      dec: formatDec(masked, w, s),
      hex: formatHex(masked, w),
    });
  }, []);

  const handleFieldChange = useCallback((field: Field, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
    const parsed = parseField(value, field, signed, width);
    if (parsed !== null) {
      const masked = parsed & widthMask(width);
      setRaw(masked);
      setInputs({
        bin: formatBin(masked, width),
        oct: formatOct(masked, width),
        dec: formatDec(masked, width, signed),
        hex: formatHex(masked, width),
        [field]: value, // keep raw input while typing
      });
    } else {
      setInputs((prev) => ({ ...prev, [field]: value }));
    }
  }, [signed, width]);

  const handleWidthChange = useCallback((w: BitWidth) => {
    setWidth(w);
    setRawAndInputs(raw, w, signed);
  }, [raw, signed, setRawAndInputs]);

  const handleSignedChange = useCallback((s: boolean) => {
    setSigned(s);
    setRawAndInputs(raw, width, s);
  }, [raw, width, setRawAndInputs]);

  const handleBitToggle = useCallback((bitIndex: number) => {
    // bitIndex 0 = LSB
    const toggled = (raw & widthMask(width)) ^ (1n << BigInt(bitIndex));
    setRawAndInputs(toggled, width, signed);
  }, [raw, width, signed, setRawAndInputs]);

  const handlePreset = useCallback((value: bigint) => {
    setRawAndInputs(value, width, signed);
  }, [width, signed, setRawAndInputs]);

  // bit grid: index 0 = MSB for display, maps to bit (width-1-i)
  const maskedRaw = raw & widthMask(width);
  const bitString = maskedRaw.toString(2).padStart(width, '0');

  const FIELDS: { field: Field; label: string; mono: boolean }[] = [
    { field: 'dec', label: 'Decimal', mono: true },
    { field: 'hex', label: 'Hex', mono: true },
    { field: 'oct', label: 'Octal', mono: true },
    { field: 'bin', label: 'Binary', mono: true },
  ];

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {/* Controls */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-border flex-wrap">
        {/* Bit width */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Width</span>
          {([8, 16, 32, 64] as BitWidth[]).map((w) => (
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

        {/* Signed/Unsigned */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Type</span>
          {[false, true].map((s) => (
            <button
              key={String(s)}
              onClick={() => handleSignedChange(s)}
              className={cn(
                'px-2 py-0.5 rounded text-xs border transition-colors',
                signed === s
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              )}
            >
              {s ? 'Signed' : 'Unsigned'}
            </button>
          ))}
        </div>
      </div>

      {/* Input fields */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3 border-b border-border">
        {FIELDS.map(({ field, label }) => (
          <div key={field} className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={field === 'bin' ? formatBin(maskedRaw, width) : inputs[field]}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                onFocus={(e) => e.target.select()}
                spellCheck={false}
                className="flex-1 min-w-0 bg-muted/40 border border-border rounded px-2 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
              />
              <button
                onClick={() => copy(derived[field], field)}
                className="shrink-0 p-1.5 rounded hover:bg-muted/40 transition-colors"
              >
                {copiedKey === field
                  ? <Check className="size-3 text-green-400" />
                  : <Copy className="size-3 text-muted-foreground" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bit grid */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Bit Pattern
          </span>
          <span className="text-[10px] text-muted-foreground/50">click to toggle</span>
        </div>

        {/* Render bytes top to bottom, each row = 8 bits */}
        <div className="flex flex-col gap-1.5 font-mono">
          {Array.from({ length: width / 8 }, (_, byteIdx) => {
            const byteNum = width / 8 - 1 - byteIdx; // MSByte first
            return (
              <div key={byteIdx} className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground/40 w-8 text-right shrink-0 select-none">
                  B{byteNum}
                </span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 8 }, (_, bitInByte) => {
                    const bitIndex = width - 1 - (byteIdx * 8 + bitInByte); // absolute bit index (0=LSB)
                    const bitPos = byteIdx * 8 + bitInByte; // position in bitString (0=MSB)
                    const isOne = bitString[bitPos] === '1';
                    const isMsb = bitIndex === width - 1;
                    return (
                      <button
                        key={bitInByte}
                        onClick={() => handleBitToggle(bitIndex)}
                        title={`Bit ${bitIndex} (2^${bitIndex})`}
                        className={cn(
                          'w-9 h-9 rounded text-xs font-mono border transition-colors select-none',
                          isOne
                            ? isMsb && signed
                              ? 'bg-red-500/20 border-red-500/40 text-red-400'
                              : 'bg-primary/20 border-primary/40 text-primary'
                            : 'bg-muted/20 border-border text-muted-foreground/30 hover:border-muted-foreground/50',
                        )}
                      >
                        {isOne ? '1' : '0'}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[9px] text-muted-foreground/40 shrink-0 select-none font-mono">
                  {/* hex byte */}
                  {parseInt(bitString.slice(byteIdx * 8, byteIdx * 8 + 8), 2).toString(16).toUpperCase().padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bit index labels */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-8 shrink-0" />
          <div className="flex gap-0.5">
            {Array.from({ length: width > 16 ? 8 : width }, (_, i) => {
              const bitIndex = width - 1 - i;
              return (
                <span key={i} className="w-9 text-[8px] text-center text-muted-foreground/30 select-none font-mono">
                  {bitIndex}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Signed interpretation */}
      {signed && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border text-xs">
          <span className="text-muted-foreground">Signed value:</span>
          <span className="font-mono text-foreground">{toSigned(maskedRaw, width).toString()}</span>
          <span className="text-muted-foreground ml-2">MSB:</span>
          <span className={cn('font-mono', maskedRaw >> BigInt(width - 1) === 1n ? 'text-red-400' : 'text-muted-foreground')}>
            {(maskedRaw >> BigInt(width - 1)).toString()}
          </span>
        </div>
      )}

      {/* Presets */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Presets</span>
        <div className="flex flex-wrap gap-1.5">
          {presets(width).map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.value)}
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
