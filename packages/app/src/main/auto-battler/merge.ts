import type {
  BenchUnit,
  PlacedUnit,
  StarLevel,
} from "../../shared/auto-battler-types";

export type MergeCandidate = {
  // Where each candidate lives
  kind: "bench" | "board";
  instanceId: string;
};

export type MergeResult = {
  consumed: MergeCandidate[];
  newStarLevel: StarLevel;
  unitDefId: string;
  keptRelicId: string | null;
};

// Returns a merge if 3 units with the same unitDefId + starLevel exist on bench+board
export function findMerge(
  bench: BenchUnit[],
  board: (PlacedUnit | null)[],
  unitDefId: string,
  starLevel: StarLevel,
): MergeResult | null {
  if (starLevel === 3) return null;

  const matches: MergeCandidate[] = [];
  let keptRelicId: string | null = null;

  // Check board first so board units are preferred as the "keep" target
  for (const unit of board) {
    if (unit && unit.unitDefId === unitDefId && unit.starLevel === starLevel) {
      matches.push({ kind: "board", instanceId: unit.instanceId });
      if (keptRelicId === null && unit.equippedRelicId) {
        keptRelicId = unit.equippedRelicId;
      }
    }
  }
  for (const unit of bench) {
    if (unit.unitDefId === unitDefId && unit.starLevel === starLevel) {
      matches.push({ kind: "bench", instanceId: unit.instanceId });
      if (keptRelicId === null && unit.equippedRelicId) {
        keptRelicId = unit.equippedRelicId;
      }
    }
  }

  if (matches.length < 3) return null;

  return {
    consumed: matches.slice(0, 3),
    newStarLevel: (starLevel + 1) as StarLevel,
    unitDefId,
    keptRelicId,
  };
}

// Find all merge chains iteratively (so a merge to ★★ can re-trigger ★★★)
export function findAllMerges(
  bench: BenchUnit[],
  board: (PlacedUnit | null)[],
  unitDefId: string,
): MergeResult[] {
  const results: MergeResult[] = [];
  // Check 1★ first, then 2★
  for (const star of [1, 2] as StarLevel[]) {
    const merge = findMerge(bench, board, unitDefId, star);
    if (merge) results.push(merge);
  }
  return results;
}
