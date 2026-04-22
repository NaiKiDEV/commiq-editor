// Auto-battler economy and balance constants

export const BOARD_ROWS = 2;
export const BOARD_COLS = 4;
export const BOARD_SLOTS = BOARD_ROWS * BOARD_COLS;

export const DEFAULT_BENCH_SIZE = 6;
export const DEFAULT_MAX_SERVER_HP = 25;
export const DEFAULT_SHOP_SIZE = 5;

export const BASE_INCOME_PER_ROUND = 4;
export const INTEREST_RATE = 0.1;
export const INTEREST_MAX = 3;

export const STREAK_BONUSES: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
};

export const DEFAULT_REROLL_COST = 2;

export const UNIT_TIER_COST: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
};

// Sell refund multiplier by star level (1★, 2★, 3★)
// Selling 1★ gives nothing back — buying is a commitment, not free storage.
export const SELL_REFUND_BY_STAR: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 2,
  3: 6,
};

// Probability distribution of shop tiers by wave level
// Row is wave bracket, columns are tier 1..5 probabilities
export const SHOP_TIER_ODDS: Array<[number, number, number, number, number]> = [
  [0.70, 0.30, 0.00, 0.00, 0.00],   // waves 1-3
  [0.50, 0.35, 0.15, 0.00, 0.00],   // waves 4-6
  [0.35, 0.35, 0.20, 0.10, 0.00],   // waves 7-9
  [0.20, 0.30, 0.30, 0.15, 0.05],   // waves 10-14
  [0.10, 0.20, 0.30, 0.25, 0.15],   // waves 15-19
  [0.05, 0.15, 0.25, 0.30, 0.25],   // waves 20-29
  [0.00, 0.10, 0.20, 0.35, 0.35],   // waves 30+
];

export function getShopOddsForWave(
  wave: number,
): [number, number, number, number, number] {
  if (wave <= 3) return SHOP_TIER_ODDS[0];
  if (wave <= 6) return SHOP_TIER_ODDS[1];
  if (wave <= 9) return SHOP_TIER_ODDS[2];
  if (wave <= 14) return SHOP_TIER_ODDS[3];
  if (wave <= 19) return SHOP_TIER_ODDS[4];
  if (wave <= 29) return SHOP_TIER_ODDS[5];
  return SHOP_TIER_ODDS[6];
}

// Combat simulation safety
export const MAX_COMBAT_TICKS = 200;

// Damage from lost combat. Tank-role units on the board reduce incoming
// loss damage by 2 each, keeping defensive comps meaningful late-game.
export function damageFromLostCombat(wave: number, tankCount = 0): number {
  const base = Math.min(3 + Math.floor(wave * 0.7), 15);
  return Math.max(2, base - tankCount * 2);
}

// ── Dynamic wave scaling ───────────────────────────────────────
// Enemies scale HP & attack by this multiplier.  Uses diminishing
// returns so early game has teeth but late game doesn't spike into
// a wall.  First 10 effective waves scale at full rate, then 60%.
export function enemyWaveScaling(wave: number, isBoss = false): number {
  if (wave <= 2) return 1;
  const effective = wave - 2;
  const rate = isBoss ? 0.04 : 0.08;
  if (effective <= 10) return 1 + effective * rate;
  return 1 + 10 * rate + (effective - 10) * rate * 0.6;
}

// Maximum ± variance applied to non-boss enemy group counts so that
// the exact wave composition can't be memorised across runs.
export const ENEMY_COUNT_VARIANCE = 1;

// Souls earned from a completed run (meta-currency)
// Tuned so that even a perfect clear awards ~15-20 souls, enough for one
// mid-tier upgrade; stacking progression requires multiple successful runs.
export function soulsFromRun(wavesCleared: number, bossesKilled: number): number {
  return Math.floor(wavesCleared / 3) + bossesKilled * 3;
}

// Multiplier applied to per-wave soul rewards (kills + bonusSouls).
// Lower values make progression unlock slower; tune here to rebalance globally.
export const WAVE_SOUL_MULTIPLIER = 0.35;

// Save file format version
export const SAVE_VERSION = 2;

export const INITIAL_STARTING_GOLD = 3;

// ── Relic economy ──────────────────────────────────────────────
export const MAX_ACTIVE_RELICS = 6;
export const RELIC_OFFER_CHOICES = 3;
export const RELIC_NONBOSS_OFFER_CHANCE = 0.33;
export const RELIC_SKIP_GOLD = 5;

// [common, uncommon, rare, legendary]
export const RELIC_RARITY_ODDS_BY_WAVE: Array<[number, number, number, number]> = [
  [0.70, 0.25, 0.05, 0.00],  // waves 1-5
  [0.40, 0.35, 0.20, 0.05],  // waves 6-10
  [0.20, 0.30, 0.35, 0.15],  // waves 11-15
  [0.10, 0.20, 0.40, 0.30],  // waves 16-25
  [0.05, 0.10, 0.35, 0.50],  // waves 26+
];

export function getRelicRarityOddsForWave(
  wave: number,
): [number, number, number, number] {
  if (wave <= 5) return RELIC_RARITY_ODDS_BY_WAVE[0];
  if (wave <= 10) return RELIC_RARITY_ODDS_BY_WAVE[1];
  if (wave <= 15) return RELIC_RARITY_ODDS_BY_WAVE[2];
  if (wave <= 25) return RELIC_RARITY_ODDS_BY_WAVE[3];
  return RELIC_RARITY_ODDS_BY_WAVE[4];
}

// ── Comeback economy ───────────────────────────────────────────
export const COMEBACK_LOSS_STREAK_THRESHOLD = 3;

