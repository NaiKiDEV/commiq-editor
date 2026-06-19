export type CoinSide = "green" | "red";

export const SIDES: readonly CoinSide[] = ["green", "red"] as const;

export const SIDE_LABEL: Record<CoinSide, string> = {
  green: "Green",
  red: "Red",
};

/** The opposite side of a coin face. */
export function otherSide(side: CoinSide): CoinSide {
  return side === "green" ? "red" : "green";
}

/** Fair 50/50 coin flip, independent of stake sizes. */
export function flipCoin(): CoinSide {
  return Math.random() < 0.5 ? "green" : "red";
}

/** Both sides always have an even chance. */
export const FAIR_CHANCE = 0.5;

/** Flat face color used by the coin, per side. */
export const SIDE_COLOR: Record<CoinSide, string> = {
  green: "#16a34a",
  red: "#dc2626",
};

/** Accent text class for a side. */
export function sideTextClass(side: CoinSide): string {
  return side === "green" ? "text-emerald-400" : "text-red-400";
}

/** Side-selection button styling, solid when selected. */
export function sideButtonClasses(side: CoinSide, selected: boolean): string {
  const base =
    "relative flex flex-col items-center justify-center gap-0.5 rounded-lg py-3 font-bold text-white transition-all hover:brightness-110 active:translate-y-px";
  if (side === "green") {
    return `${base} bg-emerald-600 ${
      selected
        ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-background"
        : "opacity-80"
    }`;
  }
  return `${base} bg-red-600 ${
    selected
      ? "ring-2 ring-red-300 ring-offset-2 ring-offset-background"
      : "opacity-80"
  }`;
}

/** Player-card border + tint for a side, brighter when it is the active/winning side. */
export function sideCardClasses(side: CoinSide, active: boolean): string {
  if (side === "green") {
    return active
      ? "border-emerald-400/70 bg-emerald-500/10"
      : "border-emerald-500/20 bg-emerald-500/[0.03]";
  }
  return active
    ? "border-red-400/70 bg-red-500/10"
    : "border-red-500/20 bg-red-500/[0.03]";
}
