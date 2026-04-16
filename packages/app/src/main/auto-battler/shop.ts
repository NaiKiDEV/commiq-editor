import type {
  ShopSlot,
  ShopState,
} from "../../shared/auto-battler-types";
import { UNITS, UNIT_MAP } from "./config/units";
import {
  DEFAULT_REROLL_COST,
  DEFAULT_SHOP_SIZE,
  UNIT_TIER_COST,
  getShopOddsForWave,
} from "./config/balance";
import { Rng } from "./rng";

function unitsByTier(unlocked: string[]): Record<1 | 2 | 3 | 4 | 5, string[]> {
  const buckets: Record<1 | 2 | 3 | 4 | 5, string[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };
  for (const id of unlocked) {
    const def = UNIT_MAP[id];
    if (!def) continue;
    buckets[def.tier].push(id);
  }
  return buckets;
}

export function generateShop(
  rng: Rng,
  unlockedUnits: string[],
  wave: number,
  shopSize = DEFAULT_SHOP_SIZE,
): ShopSlot[] {
  const odds = getShopOddsForWave(wave);
  const byTier = unitsByTier(unlockedUnits);
  const slots: ShopSlot[] = [];

  for (let i = 0; i < shopSize; i++) {
    // Try up to 5 times to find a tier with available units
    let chosenId: string | null = null;
    for (let attempt = 0; attempt < 5 && !chosenId; attempt++) {
      const tierIdx = rng.weightedIndex(odds);
      const tier = (tierIdx + 1) as 1 | 2 | 3 | 4 | 5;
      const pool = byTier[tier];
      if (pool.length > 0) {
        chosenId = rng.pick(pool);
      }
    }
    if (!chosenId) {
      // fallback to any tier-1 unit
      const fallback = UNITS.find((u) => u.tier === 1);
      if (!fallback) continue;
      chosenId = fallback.id;
    }
    const def = UNIT_MAP[chosenId];
    slots.push({
      unitDefId: chosenId,
      cost: UNIT_TIER_COST[def.tier],
      sold: false,
    });
  }
  return slots;
}

export function createInitialShop(
  rng: Rng,
  unlockedUnits: string[],
  wave: number,
  shopSize = DEFAULT_SHOP_SIZE,
): ShopState {
  return {
    available: generateShop(rng, unlockedUnits, wave, shopSize),
    rerollCost: DEFAULT_REROLL_COST,
    frozen: false,
  };
}

export function rerollShop(
  shop: ShopState,
  rng: Rng,
  unlockedUnits: string[],
  wave: number,
  shopSize = DEFAULT_SHOP_SIZE,
): ShopState {
  if (shop.frozen) return shop;
  return {
    ...shop,
    available: generateShop(rng, unlockedUnits, wave, shopSize),
  };
}
