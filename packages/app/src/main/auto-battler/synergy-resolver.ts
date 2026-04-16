import type {
  ActiveSynergy,
  PlacedUnit,
  SynergyDef,
  SynergyThreshold,
} from "../../shared/auto-battler-types";
import { SYNERGY_MAP } from "./config/synergies";
import { UNIT_MAP } from "./config/units";

// Count unique unitDefIds per trait on board (multiple copies of same unit = 1)
function countTraitUnits(
  board: (PlacedUnit | null)[],
): Record<string, Set<string>> {
  const trait2ids: Record<string, Set<string>> = {};
  for (const unit of board) {
    if (!unit) continue;
    const def = UNIT_MAP[unit.unitDefId];
    if (!def) continue;
    for (const trait of def.traits) {
      if (!trait2ids[trait]) trait2ids[trait] = new Set();
      trait2ids[trait].add(unit.unitDefId);
    }
  }
  return trait2ids;
}

// Returns the highest threshold met, or null if none met
function highestThreshold(
  thresholds: readonly SynergyThreshold[],
  count: number,
): SynergyThreshold | null {
  let best: SynergyThreshold | null = null;
  for (const t of thresholds) {
    if (count >= t.count && (!best || t.count > best.count)) {
      best = t;
    }
  }
  return best;
}

export function computeActiveSynergies(
  board: (PlacedUnit | null)[],
  unlockedSynergies: string[],
): ActiveSynergy[] {
  const trait2ids = countTraitUnits(board);
  const result: ActiveSynergy[] = [];

  for (const synergyId of unlockedSynergies) {
    const def: SynergyDef | undefined = SYNERGY_MAP[synergyId];
    if (!def) continue;
    const unique = trait2ids[def.trait];
    const count = unique ? unique.size : 0;
    if (count === 0) continue;
    const met = highestThreshold(def.thresholds, count);
    result.push({
      synergyId,
      unitCount: count,
      activeThreshold: met ? met.count : 0,
      bonusDescription: met ? met.description : "",
    });
  }
  return result;
}
