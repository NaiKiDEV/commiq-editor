import { randomBettorName, randomBetAmount } from "../roulette/bettors";

/** Round lifecycle: take bets, climb the curve, then bust. */
export type CrashPhase = "betting" | "running" | "crashed";

/**
 * Exponential growth rate per millisecond for the multiplier curve.
 * Tuned so the rocket reaches ~2x near 4.6s and ~10x near 15s — a steady,
 * tense climb rather than an instant spike.
 */
export const GROWTH_RATE_PER_MS = 0.00015;

/** Current multiplier for a given elapsed time, m(t) = e^(rate * t). */
export function multiplierAt(elapsedMs: number): number {
  return Math.exp(GROWTH_RATE_PER_MS * Math.max(0, elapsedMs));
}

/** Inverse of {@link multiplierAt}: the elapsed time at which a multiplier is hit. */
export function elapsedForMultiplier(multiplier: number): number {
  return Math.log(Math.max(1, multiplier)) / GROWTH_RATE_PER_MS;
}

/** Hard ceiling so a freak round can't run forever. */
const MAX_CRASH_POINT = 1000;
/** Share of rounds that bust instantly at 1.00x — the house edge. */
const INSTANT_BUST_CHANCE = 0.03;

/**
 * Pick the multiplier this round will bust at. Heavy-tailed: most rounds end
 * early, but the long tail keeps the big multipliers alive. P(bust >= x) ≈ 0.99/x,
 * giving a median near 2x and a built-in house edge.
 */
export function generateCrashPoint(): number {
  if (Math.random() < INSTANT_BUST_CHANCE) return 1.0;
  const raw = 0.99 / (1 - Math.random());
  const capped = Math.min(raw, MAX_CRASH_POINT);
  return Math.max(1.0, Math.floor(capped * 100) / 100);
}

/** "2.41x" — multiplier rendered to two decimals. */
export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`;
}

/**
 * Tiered glow color for the multiplier as it climbs, so a 12x feels different
 * from a 1.3x. Returns a raw hex used for both the curve stroke and the head glow.
 */
export function multiplierColor(multiplier: number): string {
  if (multiplier >= 10) return "#fbbf24"; // amber — jackpot territory
  if (multiplier >= 5) return "#a78bfa"; // violet
  if (multiplier >= 2) return "#22d3ee"; // cyan
  return "#34d399"; // emerald — the calm early climb
}

/** Tailwind text class mirroring {@link multiplierColor} for the big readout. */
export function multiplierTextClass(multiplier: number): string {
  if (multiplier >= 10) return "text-amber-400";
  if (multiplier >= 5) return "text-violet-400";
  if (multiplier >= 2) return "text-cyan-400";
  return "text-emerald-400";
}

/** A simulated lobby player who auto-cashes at their own planned target. */
export interface CrashBot {
  id: string;
  name: string;
  bet: number;
  /** Multiplier they intend to cash out at; they bust if the round ends first. */
  target: number;
}

/** A bot's planned cashout — mostly cautious, occasionally greedy. */
function rollBotTarget(): number {
  const greed = Math.random() * Math.random(); // skew toward low targets
  return Math.round((1.15 + greed * 9) * 100) / 100;
}

/** Populate the round's lobby with a handful of fake bettors for atmosphere. */
export function makeBots(): CrashBot[] {
  const count = 3 + Math.floor(Math.random() * 5); // 3-7 players
  return Array.from({ length: count }, (_, i) => ({
    id: `${Date.now()}-${i}`,
    name: randomBettorName(),
    bet: randomBetAmount(),
    target: rollBotTarget(),
  }));
}
