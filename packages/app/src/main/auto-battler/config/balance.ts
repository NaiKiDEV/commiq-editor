// Auto-battler economy and balance constants

export const BOARD_ROWS = 2;
export const BOARD_COLS = 4;
export const BOARD_SLOTS = BOARD_ROWS * BOARD_COLS;

export const DEFAULT_BENCH_SIZE = 6;
export const DEFAULT_MAX_SERVER_HP = 30;
export const DEFAULT_SHOP_SIZE = 5;

export const BASE_INCOME_PER_ROUND = 5;
export const INTEREST_RATE = 0.1;
export const INTEREST_MAX = 5;

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
export const SELL_REFUND_BY_STAR: Record<1 | 2 | 3, number> = {
  1: 1,
  2: 3,
  3: 9,
};

// Probability distribution of shop tiers by wave level
// Row is wave bracket (1-3, 4-6, 7-9, 10+), columns are tier 1..5 probabilities
export const SHOP_TIER_ODDS: Array<[number, number, number, number, number]> = [
  [0.75, 0.25, 0.0, 0.0, 0.0],      // waves 1-3
  [0.55, 0.35, 0.1, 0.0, 0.0],      // waves 4-6
  [0.4, 0.35, 0.2, 0.05, 0.0],      // waves 7-9
  [0.25, 0.3, 0.3, 0.1, 0.05],      // waves 10-14
  [0.15, 0.25, 0.3, 0.2, 0.1],      // waves 15-19
  [0.1, 0.15, 0.3, 0.25, 0.2],       // waves 20+
];

export function getShopOddsForWave(
  wave: number,
): [number, number, number, number, number] {
  if (wave <= 3) return SHOP_TIER_ODDS[0];
  if (wave <= 6) return SHOP_TIER_ODDS[1];
  if (wave <= 9) return SHOP_TIER_ODDS[2];
  if (wave <= 14) return SHOP_TIER_ODDS[3];
  if (wave <= 19) return SHOP_TIER_ODDS[4];
  return SHOP_TIER_ODDS[5];
}

// Combat simulation safety
export const MAX_COMBAT_TICKS = 200;

// Damage from lost combat = 2 + wave (capped at 10)
export function damageFromLostCombat(wave: number): number {
  return Math.min(2 + Math.floor(wave / 2), 15);
}

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
export const SAVE_VERSION = 1;

export const INITIAL_STARTING_GOLD = 4;
