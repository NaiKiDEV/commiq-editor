export type RouletteColor = "red" | "black" | "green";

export interface WheelSlot {
  /** Number shown on the tile (0 = green). */
  n: number;
  color: RouletteColor;
}

/**
 * CSGO-style single-zero wheel: 1 green (0), 7 red, 7 black, 15 slots total.
 * Order mirrors the classic "csgo roll" arrangement so the strip reads naturally.
 */
export const WHEEL: readonly WheelSlot[] = [
  { n: 0, color: "green" },
  { n: 11, color: "black" },
  { n: 5, color: "red" },
  { n: 10, color: "black" },
  { n: 6, color: "red" },
  { n: 9, color: "black" },
  { n: 7, color: "red" },
  { n: 8, color: "black" },
  { n: 1, color: "red" },
  { n: 14, color: "black" },
  { n: 2, color: "red" },
  { n: 13, color: "black" },
  { n: 3, color: "red" },
  { n: 12, color: "black" },
  { n: 4, color: "red" },
];

/** Payout multiplier applied to the stake on the winning color (stake-inclusive). */
export const MULTIPLIER: Record<RouletteColor, number> = {
  red: 2,
  black: 2,
  green: 14,
};

/** Pixel stride between tile centers (tile box + horizontal padding). */
export const TILE_STRIDE = 72;
/** Inner colored box width inside each stride. */
export const TILE_INNER = 64;

/** How many full copies of the wheel the reel contains. */
const REEL_REPEAT = 40;
/** Land this many wheel-cycles from the end so there's runway + buffer. */
const LANDING_OFFSET = 6;

/** Build the long scrolling strip by repeating the wheel. */
export function buildReel(): WheelSlot[] {
  const reel: WheelSlot[] = [];
  for (let i = 0; i < REEL_REPEAT; i++) reel.push(...WHEEL);
  return reel;
}

/** Index within the built reel where the chosen winning slot should land. */
export function landingReelIndex(winningWheelIndex: number): number {
  return (REEL_REPEAT - LANDING_OFFSET) * WHEEL.length + winningWheelIndex;
}

/** Uniformly pick a winning wheel index (0..14). */
export function pickWinnerIndex(): number {
  return Math.floor(Math.random() * WHEEL.length);
}

/** Tailwind classes for a tile of the given color. */
export function tileClasses(color: RouletteColor): string {
  switch (color) {
    case "red":
      return "bg-red-600 text-white";
    case "green":
      return "bg-emerald-500 text-white";
    case "black":
      return "bg-zinc-900 text-zinc-100 border border-white/10";
  }
}

/** Range label shown on each color's bet bar. */
export const COLOR_RANGE_LABEL: Record<RouletteColor, string> = {
  red: "1 to 7",
  green: "0",
  black: "8 to 14",
};

/** Solid colored bet bar for the given color. */
export function betButtonClasses(color: RouletteColor): string {
  const base =
    "flex flex-col items-center justify-center gap-0.5 rounded-md py-3 font-bold text-white transition-all hover:brightness-110 active:translate-y-px";
  switch (color) {
    case "red":
      return `${base} bg-red-600`;
    case "green":
      return `${base} bg-emerald-600`;
    case "black":
      return `${base} bg-zinc-800`;
  }
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatMoney(n: number): string {
  return moneyFormatter.format(n);
}
