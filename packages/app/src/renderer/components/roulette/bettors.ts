import type { RouletteColor } from "./engine";

export interface Bettor {
  id: string;
  name: string;
  amount: number;
  /** True for the local player's own bet row. */
  isYou?: boolean;
}

export type BettorBoard = Record<RouletteColor, Bettor[]>;

export const EMPTY_BOARD: BettorBoard = { red: [], black: [], green: [] };

const NAME_POOL = [
  "xX_Sniper_Xx",
  "ferret_lord",
  "ak47_andy",
  "PixelPusher",
  "null_ptr",
  "SegFaulty",
  "gg_ez",
  "noscope420",
  "CtrlAltDefeat",
  "RubberDuck",
  "Stackoverflowed",
  "KernelPanic",
  "byte_me",
  "404NotFound",
  "CommitCrimes",
  "MergeConflict",
  "DarkModeOnly",
  "semicolon",
  "rm_rf_slash",
  "HashSlinger",
  "LootGoblin",
  "CritHappens",
  "RNGesus",
  "TiltedTower",
  "BunnyHop",
  "HeadshotHarry",
  "ClutchOrKick",
  "EcoRound",
  "SprayControl",
  "FlashbangFred",
  "SmokeCriminal",
  "WallbangWill",
  "ProdDeployer",
  "YeetMaster",
  "SudoNim",
  "GitBlame",
  "NaN_problems",
  "OffByOne",
  "TabsNotSpaces",
  "BigOhNo",
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomBettorName(): string {
  return NAME_POOL[randInt(0, NAME_POOL.length - 1)];
}

/** Bot stake, skewed toward small bets with the occasional whale. */
export function randomBetAmount(): number {
  const r = Math.random();
  let raw: number;
  if (r < 0.6) raw = randInt(10, 500);
  else if (r < 0.9) raw = randInt(500, 3000);
  else raw = randInt(3000, 15000);
  return Math.round(raw / 10) * 10;
}

/** Color a bot bets on. Red and black common, green rare. */
export function randomBetColor(): RouletteColor {
  const r = Math.random();
  if (r < 0.45) return "red";
  if (r < 0.9) return "black";
  return "green";
}

/** Deterministic, distinct avatar color from a name (theme-agnostic HSL). */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

export function bettorInitial(name: string): string {
  const c = name.replace(/[^a-zA-Z0-9]/g, "")[0];
  return (c ?? "?").toUpperCase();
}
