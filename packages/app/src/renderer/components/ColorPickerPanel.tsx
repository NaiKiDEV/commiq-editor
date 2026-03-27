import { useState, useMemo, useCallback, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  hslToHex,
  rgbToCss,
  hslToCss,
  contrastRatio,
  wcagLevel,
  generateShades,
  generateScheme,
  type SchemeType,
} from './color/colorUtils';

const DEFAULT_HEX = '#3b82f6';
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

const SCHEME_TYPES: { value: SchemeType; label: string }[] = [
  { value: 'complementary', label: 'Complementary' },
  { value: 'analogous', label: 'Analogous' },
  { value: 'triadic', label: 'Triadic' },
  { value: 'tetradic', label: 'Tetradic' },
  { value: 'split-complementary', label: 'Split-Comp' },
];

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);
  return { copiedKey, copy };
}

function CopyableValue({ label, value, copyKey, copiedKey, onCopy }: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (v: string, k: string) => void;
}) {
  return (
    <button
      onClick={() => onCopy(value, copyKey)}
      className="flex items-center justify-between w-full px-3 py-1.5 rounded hover:bg-muted/40 transition-colors text-left group"
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-12 shrink-0">{label}</span>
      <span className="flex-1 font-mono text-xs text-foreground">{value}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
        {copiedKey === copyKey
          ? <Check className="size-3 text-green-400" />
          : <Copy className="size-3 text-muted-foreground" />}
      </span>
    </button>
  );
}

function Swatch({ hex, label, onClick, size = 'md' }: {
  hex: string;
  label?: string;
  onClick?: () => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn('flex flex-col items-center gap-1', onClick && 'cursor-pointer')}
      onClick={onClick}
    >
      <div
        className={cn(
          'rounded border border-black/10',
          size === 'sm' ? 'w-7 h-7' : 'w-10 h-10',
        )}
        style={{ background: hex }}
      />
      {label && <span className="text-[9px] text-muted-foreground font-mono">{label}</span>}
    </div>
  );
}

export function ColorPickerPanel({ panelId: _panelId }: { panelId: string }) {
  const [hex, setHex] = useState(DEFAULT_HEX);
  const [rawHex, setRawHex] = useState(DEFAULT_HEX);
  const [scheme, setScheme] = useState<SchemeType>('complementary');
  const nativeRef = useRef<HTMLInputElement>(null);
  const { copiedKey, copy } = useCopy();

  const rgb = useMemo(() => hexToRgb(hex) ?? { r: 59, g: 130, b: 246 }, [hex]);
  const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);
  const shades = useMemo(() => generateShades(hex), [hex]);
  const schemeColors = useMemo(() => generateScheme(hex, scheme), [hex, scheme]);
  const contrastWhite = useMemo(() => contrastRatio(rgb, WHITE), [rgb]);
  const contrastBlack = useMemo(() => contrastRatio(rgb, BLACK), [rgb]);

  const commitHex = useCallback((value: string) => {
    const trimmed = value.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    const parsed = hexToRgb(withHash);
    if (parsed) {
      const normalized = rgbToHex(parsed);
      setHex(normalized);
      setRawHex(normalized);
    }
  }, []);

  const handleHexInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawHex(e.target.value);
  }, []);

  const handleHexBlur = useCallback(() => {
    commitHex(rawHex);
  }, [rawHex, commitHex]);

  const handleHexKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitHex(rawHex);
  }, [rawHex, commitHex]);

  const handleNativeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setHex(v);
    setRawHex(v);
  }, []);

  const handleHslField = useCallback((field: 'h' | 's' | 'l', value: number) => {
    const next = { ...hsl, [field]: value };
    const newHex = hslToHex(next);
    setHex(newHex);
    setRawHex(newHex);
  }, [hsl]);

  const handleRgbField = useCallback((field: 'r' | 'g' | 'b', value: number) => {
    const next = { ...rgb, [field]: Math.max(0, Math.min(255, value)) };
    const newHex = rgbToHex(next);
    setHex(newHex);
    setRawHex(newHex);
  }, [rgb]);

  const handleSwatchClick = useCallback((swatchHex: string) => {
    setHex(swatchHex);
    setRawHex(swatchHex);
  }, []);

  const levelWhite = wcagLevel(contrastWhite);
  const levelBlack = wcagLevel(contrastBlack);
  const bestTextColor = contrastBlack >= contrastWhite ? '#000000' : '#ffffff';

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {/* Color hero */}
      <div
        className="shrink-0 flex items-end px-4 pb-3 gap-3"
        style={{ background: hex, height: 96 }}
      >
        {/* Native color picker trigger */}
        <div className="relative">
          <input
            ref={nativeRef}
            type="color"
            value={hex}
            onChange={handleNativeChange}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
          <div
            className="w-10 h-10 rounded-lg border-2 border-white/30 shadow cursor-pointer"
            style={{ background: hex }}
          />
        </div>

        {/* Hex input */}
        <input
          type="text"
          value={rawHex}
          onChange={handleHexInput}
          onBlur={handleHexBlur}
          onKeyDown={handleHexKeyDown}
          spellCheck={false}
          className="font-mono text-sm outline-none rounded px-2 py-1 w-28"
          style={{ background: 'rgba(0,0,0,0.35)', color: '#fff', caretColor: '#fff' }}
        />

        {/* Copy hex */}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => copy(hex, 'hex-hero')}
          className="ml-auto"
          style={{ color: bestTextColor, opacity: 0.8 }}
        >
          {copiedKey === 'hex-hero' ? <Check /> : <Copy />}
        </Button>
      </div>

      {/* Values */}
      <div className="border-b border-border py-1">
        <CopyableValue label="HEX" value={hex} copyKey="hex" copiedKey={copiedKey} onCopy={copy} />
        <CopyableValue label="RGB" value={rgbToCss(rgb)} copyKey="rgb" copiedKey={copiedKey} onCopy={copy} />
        <CopyableValue label="HSL" value={hslToCss(hsl)} copyKey="hsl" copiedKey={copiedKey} onCopy={copy} />
      </div>

      {/* HSL sliders */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Adjust</span>
        {(
          [
            { label: 'H', field: 'h', max: 360, value: hsl.h, gradient: `hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%)` },
            { label: 'S', field: 's', max: 100, value: hsl.s, gradient: `hsl(${hsl.h},0%,${hsl.l}%), hsl(${hsl.h},100%,${hsl.l}%)` },
            { label: 'L', field: 'l', max: 100, value: hsl.l, gradient: `hsl(${hsl.h},${hsl.s}%,0%), hsl(${hsl.h},${hsl.s}%,50%), hsl(${hsl.h},${hsl.s}%,100%)` },
          ] as const
        ).map(({ label, field, max, value, gradient }) => (
          <div key={field} className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground w-3 shrink-0">{label}</span>
            <div className="relative flex-1 h-2 rounded-full" style={{ background: `linear-gradient(to right, ${gradient})` }}>
              <input
                type="range"
                min={0}
                max={max}
                value={value}
                onChange={(e) => handleHslField(field, Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow"
                style={{ left: `calc(${(value / max) * 100}% - 6px)`, background: hex }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* Contrast */}
      <div className="flex gap-3 px-4 py-3 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground self-center">Contrast</span>
        {[
          { bg: '#ffffff', label: 'on White', ratio: contrastWhite, level: levelWhite },
          { bg: '#000000', label: 'on Black', ratio: contrastBlack, level: levelBlack },
        ].map(({ bg, label, ratio, level }) => (
          <div key={bg} className="flex items-center gap-2 flex-1 rounded-md px-2 py-1.5 border border-border">
            <div className="w-5 h-5 rounded shrink-0 border border-border" style={{ background: bg }} />
            <div className="min-w-0">
              <div className="text-[9px] text-muted-foreground">{label}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono">{ratio.toFixed(2)}:1</span>
                <span className={cn(
                  'text-[9px] font-medium px-1 rounded',
                  level === 'AAA' && 'bg-green-500/20 text-green-400',
                  level === 'AA' && 'bg-blue-500/20 text-blue-400',
                  level === 'AA Large' && 'bg-yellow-500/20 text-yellow-400',
                  level === 'Fail' && 'bg-red-500/20 text-red-400',
                )}>
                  {level}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Shades */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Shades</span>
        <div className="flex gap-1.5 flex-wrap">
          {shades.map((shade) => (
            <Swatch
              key={shade.label}
              hex={shade.hex}
              label={shade.label}
              onClick={() => handleSwatchClick(shade.hex)}
            />
          ))}
        </div>
      </div>

      {/* Color scheme */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Scheme</span>
          <div className="flex gap-1 flex-wrap justify-end">
            {SCHEME_TYPES.map((s) => (
              <button
                key={s.value}
                onClick={() => setScheme(s.value)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] border transition-colors',
                  scheme === s.value
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {schemeColors.map((color) => (
            <div key={color.hex} className="flex flex-col items-center gap-1">
              <Swatch hex={color.hex} onClick={() => handleSwatchClick(color.hex)} />
              <button
                onClick={() => copy(color.hex, `scheme-${color.hex}`)}
                className="text-[9px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedKey === `scheme-${color.hex}` ? '✓' : color.hex}
              </button>
              <span className="text-[9px] text-muted-foreground/60">{color.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
