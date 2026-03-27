// ── conversion ────────────────────────────────────────────────────────────────

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 3 && clean.length !== 6) return null;
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const n = parseInt(full, 16);
  if (isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100, ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb(hsl));
}

export function rgbToCss({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function hslToCss({ h, s, l }: HSL): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// ── contrast (WCAG 2.1) ───────────────────────────────────────────────────────

function linearize(c: number): number {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'AA Large' | 'Fail' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

// ── shades ────────────────────────────────────────────────────────────────────

/** Generate 9 shades (100–900) from a base color. */
export function generateShades(hex: string): { label: string; hex: string }[] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [];
  const hsl = rgbToHsl(rgb);
  const steps = [95, 85, 75, 60, 50, 40, 28, 18, 10]; // lightness values
  const labels = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
  return steps.map((l, i) => ({
    label: labels[i],
    hex: hslToHex({ h: hsl.h, s: hsl.s, l }),
  }));
}

// ── schemes ───────────────────────────────────────────────────────────────────

export type SchemeType = 'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'split-complementary';

function rotateHue(hsl: HSL, deg: number): string {
  return hslToHex({ ...hsl, h: (hsl.h + deg + 360) % 360 });
}

export function generateScheme(hex: string, type: SchemeType): { label: string; hex: string }[] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [];
  const hsl = rgbToHsl(rgb);
  const base = { label: 'Base', hex };

  switch (type) {
    case 'complementary':
      return [base, { label: 'Complement', hex: rotateHue(hsl, 180) }];
    case 'analogous':
      return [
        { label: '-30°', hex: rotateHue(hsl, -30) },
        base,
        { label: '+30°', hex: rotateHue(hsl, 30) },
      ];
    case 'triadic':
      return [base, { label: '+120°', hex: rotateHue(hsl, 120) }, { label: '+240°', hex: rotateHue(hsl, 240) }];
    case 'tetradic':
      return [
        base,
        { label: '+90°', hex: rotateHue(hsl, 90) },
        { label: '+180°', hex: rotateHue(hsl, 180) },
        { label: '+270°', hex: rotateHue(hsl, 270) },
      ];
    case 'split-complementary':
      return [base, { label: '+150°', hex: rotateHue(hsl, 150) }, { label: '+210°', hex: rotateHue(hsl, 210) }];
  }
}
