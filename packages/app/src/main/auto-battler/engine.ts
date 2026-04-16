import type {
  AutoBattlerMeta,
  AutoBattlerRun,
  AutoBattlerSave,
  Bench,
  BenchUnit,
  BoardGrid,
  GameAction,
  GameSettings,
  PlacedUnit,
  ProgressionNode,
} from "../../shared/auto-battler-types";
import {
  BASE_INCOME_PER_ROUND,
  BOARD_COLS,
  BOARD_ROWS,
  BOARD_SLOTS,
  DEFAULT_BENCH_SIZE,
  DEFAULT_MAX_SERVER_HP,
  DEFAULT_REROLL_COST,
  DEFAULT_SHOP_SIZE,
  INITIAL_STARTING_GOLD,
  INTEREST_MAX,
  INTEREST_RATE,
  SAVE_VERSION,
  SELL_REFUND_BY_STAR,
  STREAK_BONUSES,
  UNIT_TIER_COST,
  soulsFromRun,
} from "./config/balance";
import {
  DEFAULT_UNLOCKED_UNITS,
  UNIT_MAP,
} from "./config/units";
import { DEFAULT_UNLOCKED_RELICS, RELIC_MAP } from "./config/relics";
import {
  DEFAULT_UNLOCKED_SYNERGIES,
  PROGRESSION_MAP,
} from "./config/progression";
import { WAVE_MAP, MAX_WAVE } from "./config/waves";
import { Rng, createSeed } from "./rng";
import { createInitialShop, rerollShop } from "./shop";
import { findAllMerges } from "./merge";
import { computeActiveSynergies } from "./synergy-resolver";
import { simulateCombat } from "./combat-sim";

// ─────────── Initial state ───────────

function emptyBoard(): BoardGrid {
  return {
    rows: BOARD_ROWS,
    cols: BOARD_COLS,
    slots: Array(BOARD_SLOTS).fill(null),
  };
}

function emptyBench(size = DEFAULT_BENCH_SIZE): Bench {
  return { maxSize: size, units: [] };
}

export function createInitialMeta(): AutoBattlerMeta {
  return {
    totalRuns: 0,
    bestWave: 0,
    totalKills: 0,
    souls: 0,
    unlockedUnits: [...DEFAULT_UNLOCKED_UNITS],
    unlockedRelics: [...DEFAULT_UNLOCKED_RELICS],
    unlockedSynergies: [...DEFAULT_UNLOCKED_SYNERGIES],
    progressionNodes: [],
    statistics: {},
  };
}

export function createInitialSettings(): GameSettings {
  return {
    combatSpeed: "normal",
    autoSave: true,
    showDamageNumbers: true,
  };
}

export function createInitialSave(): AutoBattlerSave {
  return {
    version: SAVE_VERSION,
    meta: createInitialMeta(),
    activeRun: null,
    settings: createInitialSettings(),
  };
}

// ─────────── Helpers ───────────

function makeId(prefix: string, rng: Rng): string {
  return `${prefix}-${(rng.next() * 1e9).toFixed(0)}`;
}

function slotIndex(row: number, col: number): number {
  return row * BOARD_COLS + col;
}

function boardUnits(board: BoardGrid): PlacedUnit[] {
  return board.slots.filter((u): u is PlacedUnit => u !== null);
}

type MetaBonuses = {
  gold: number;
  hp: number;
  shopSize: number;
  benchSize: number;
  freeReroll: number;
  income: number;
  interestCap: number;
  rerollCost: number;
  streakBonus: number;
  lossGold: number;
};

function computeMetaBonuses(meta: AutoBattlerMeta): MetaBonuses {
  const bonuses: MetaBonuses = {
    gold: 0,
    hp: 0,
    shopSize: 0,
    benchSize: 0,
    freeReroll: 0,
    income: 0,
    interestCap: 0,
    rerollCost: 0,
    streakBonus: 0,
    lossGold: 0,
  };
  for (const nodeId of meta.progressionNodes) {
    const node = PROGRESSION_MAP[nodeId];
    if (!node) continue;
    if (node.effect.type !== "starting_bonus") continue;
    const v = node.effect.value;
    switch (node.effect.bonusType) {
      case "gold":
        bonuses.gold += v;
        break;
      case "hp":
        bonuses.hp += v;
        break;
      case "shop_size":
        bonuses.shopSize += v;
        break;
      case "bench_size":
        bonuses.benchSize += v;
        break;
      case "free_reroll":
        bonuses.freeReroll += v;
        break;
      case "income":
        bonuses.income += v;
        break;
      case "interest_cap":
        bonuses.interestCap += v;
        break;
      case "reroll_cost":
        bonuses.rerollCost += v;
        break;
      case "streak_bonus":
        bonuses.streakBonus += v;
        break;
      case "loss_gold":
        bonuses.lossGold += v;
        break;
    }
  }
  return bonuses;
}

function startNewRun(meta: AutoBattlerMeta, seed: number): AutoBattlerRun {
  const rng = new Rng(seed);
  const b = computeMetaBonuses(meta);
  const shopSize = DEFAULT_SHOP_SIZE + b.shopSize;
  const benchSize = DEFAULT_BENCH_SIZE + b.benchSize;
  const serverHp = DEFAULT_MAX_SERVER_HP + b.hp;
  const gold = INITIAL_STARTING_GOLD + b.gold;
  const shop = createInitialShop(rng, meta.unlockedUnits, 1, shopSize);
  return {
    id: makeId("run", rng),
    seed,
    rngState: rng.getState(),
    wave: 1,
    phase: "draft",
    board: emptyBoard(),
    bench: emptyBench(benchSize),
    shop: {
      ...shop,
      rerollCost: Math.max(0, DEFAULT_REROLL_COST - b.rerollCost),
    },
    gold,
    serverHp,
    maxServerHp: serverHp,
    activeRelics: [],
    synergies: [],
    combatResult: null,
    lastCombatResolved: false,
    winStreak: 0,
    loseStreak: 0,
    freeRerollsAvailable: b.freeReroll,
  };
}

// ─────────── Merge resolution ───────────

function resolveMerges(
  run: AutoBattlerRun,
  rng: Rng,
  unitDefId: string,
  unlockedSynergies: string[],
): AutoBattlerRun {
  let bench = run.bench;
  let board = run.board;

  let iterations = 0;
  while (iterations < 3) {
    const merges = findAllMerges(bench.units, board.slots, unitDefId);
    if (merges.length === 0) break;
    const merge = merges[0];

    // Remove 2 of the consumed; keep 1 and upgrade it (becomes the merged unit)
    const [keep, ...toRemove] = merge.consumed;
    const toRemoveIds = new Set(toRemove.map((c) => c.instanceId));

    bench = {
      ...bench,
      units: bench.units.filter((u) => !toRemoveIds.has(u.instanceId)),
    };
    board = {
      ...board,
      slots: board.slots.map((u) =>
        u && toRemoveIds.has(u.instanceId) ? null : u,
      ),
    };

    // Upgrade the kept unit
    if (keep.kind === "bench") {
      bench = {
        ...bench,
        units: bench.units.map((u) =>
          u.instanceId === keep.instanceId
            ? {
                ...u,
                starLevel: merge.newStarLevel,
                equippedRelicId: merge.keptRelicId,
              }
            : u,
        ),
      };
    } else {
      board = {
        ...board,
        slots: board.slots.map((u) =>
          u && u.instanceId === keep.instanceId
            ? {
                ...u,
                starLevel: merge.newStarLevel,
                maxHp: Math.round(
                  UNIT_MAP[u.unitDefId].baseStats.hp *
                    Math.pow(
                      UNIT_MAP[u.unitDefId].starScaling.hpMult,
                      merge.newStarLevel - 1,
                    ),
                ),
                currentHp: Math.round(
                  UNIT_MAP[u.unitDefId].baseStats.hp *
                    Math.pow(
                      UNIT_MAP[u.unitDefId].starScaling.hpMult,
                      merge.newStarLevel - 1,
                    ),
                ),
                equippedRelicId: merge.keptRelicId,
              }
            : u,
        ),
      };
    }
    iterations++;
  }

  const synergies = computeActiveSynergies(board.slots, unlockedSynergies);
  return { ...run, bench, board, synergies, rngState: rng.getState() };
}

// ─────────── Reducer ───────────

export function gameReducer(
  state: AutoBattlerSave,
  action: GameAction,
): AutoBattlerSave {
  switch (action.type) {
    case "START_RUN": {
      const seed = action.seed ?? createSeed();
      const run = startNewRun(state.meta, seed);
      const meta: AutoBattlerMeta = {
        ...state.meta,
        totalRuns: state.meta.totalRuns + 1,
      };
      return { ...state, meta, activeRun: run };
    }

    case "END_RUN": {
      const run = state.activeRun;
      if (!run) return state;
      const bossWavesCleared = Array.from({ length: run.wave }, (_, i) => {
        const w = WAVE_MAP[i + 1];
        return w?.isBoss;
      }).filter(Boolean).length;
      const wavesCleared = Math.max(0, run.wave - 1);
      const soulsEarned = soulsFromRun(wavesCleared, bossWavesCleared);
      return {
        ...state,
        meta: { ...state.meta, souls: state.meta.souls + soulsEarned },
        activeRun: null,
      };
    }

    case "BUY_UNIT": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;
      const slot = run.shop.available[action.shopIndex];
      if (!slot || slot.sold) return state;
      if (run.gold < slot.cost) return state;

      if (run.bench.units.length >= run.bench.maxSize) {
        // Allow buy if adding this unit would immediately trigger a merge.
        // Count existing 1★ copies of this unit on bench+board; need >= 2.
        const existingOnes =
          run.bench.units.filter(
            (u) => u.unitDefId === slot.unitDefId && u.starLevel === 1,
          ).length +
          run.board.slots.filter(
            (u) => u?.unitDefId === slot.unitDefId && u.starLevel === 1,
          ).length;
        if (existingOnes < 2) return state;
      }

      const rng = new Rng(run.rngState);
      const instanceId = makeId("unit", rng);
      const newUnit: BenchUnit = {
        instanceId,
        unitDefId: slot.unitDefId,
        starLevel: 1,
        equippedRelicId: null,
      };

      const updatedShop = {
        ...run.shop,
        available: run.shop.available.map((s, i) =>
          i === action.shopIndex ? { ...s, sold: true } : s,
        ),
      };

      let newRun: AutoBattlerRun = {
        ...run,
        gold: run.gold - slot.cost,
        shop: updatedShop,
        bench: { ...run.bench, units: [...run.bench.units, newUnit] },
        rngState: rng.getState(),
      };

      newRun = resolveMerges(
        newRun,
        rng,
        slot.unitDefId,
        state.meta.unlockedSynergies,
      );

      return { ...state, activeRun: newRun };
    }

    case "SELL_UNIT": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;

      // Search bench
      const benchIdx = run.bench.units.findIndex(
        (u) => u.instanceId === action.instanceId,
      );
      if (benchIdx >= 0) {
        const unit = run.bench.units[benchIdx];
        const tier = UNIT_MAP[unit.unitDefId]?.tier ?? 1;
        const refund =
          UNIT_TIER_COST[tier] * SELL_REFUND_BY_STAR[unit.starLevel];
        return {
          ...state,
          activeRun: {
            ...run,
            gold: run.gold + refund,
            bench: {
              ...run.bench,
              units: run.bench.units.filter((u, i) => i !== benchIdx),
            },
          },
        };
      }

      // Search board
      const boardIdx = run.board.slots.findIndex(
        (u) => u?.instanceId === action.instanceId,
      );
      if (boardIdx >= 0) {
        const unit = run.board.slots[boardIdx]!;
        const tier = UNIT_MAP[unit.unitDefId]?.tier ?? 1;
        const refund =
          UNIT_TIER_COST[tier] * SELL_REFUND_BY_STAR[unit.starLevel];
        const nextBoard: BoardGrid = {
          ...run.board,
          slots: run.board.slots.map((u, i) => (i === boardIdx ? null : u)),
        };
        return {
          ...state,
          activeRun: {
            ...run,
            gold: run.gold + refund,
            board: nextBoard,
            synergies: computeActiveSynergies(
              nextBoard.slots,
              state.meta.unlockedSynergies,
            ),
          },
        };
      }

      return state;
    }

    case "PLACE_UNIT": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;
      const { row, col } = action;
      const idx = slotIndex(row, col);
      if (idx < 0 || idx >= BOARD_SLOTS) return state;
      if (run.board.slots[idx] !== null) return state;

      const benchIdx = run.bench.units.findIndex(
        (u) => u.instanceId === action.instanceId,
      );
      if (benchIdx < 0) return state;

      const benchUnit = run.bench.units[benchIdx];
      const def = UNIT_MAP[benchUnit.unitDefId];
      if (!def) return state;
      const maxHp = Math.round(
        def.baseStats.hp * Math.pow(def.starScaling.hpMult, benchUnit.starLevel - 1),
      );

      const placed: PlacedUnit = {
        instanceId: benchUnit.instanceId,
        unitDefId: benchUnit.unitDefId,
        starLevel: benchUnit.starLevel,
        currentHp: maxHp,
        maxHp,
        equippedRelicId: benchUnit.equippedRelicId,
        position: { row, col },
      };

      const nextBoard: BoardGrid = {
        ...run.board,
        slots: run.board.slots.map((u, i) => (i === idx ? placed : u)),
      };
      const nextBench: Bench = {
        ...run.bench,
        units: run.bench.units.filter((_, i) => i !== benchIdx),
      };

      return {
        ...state,
        activeRun: {
          ...run,
          board: nextBoard,
          bench: nextBench,
          synergies: computeActiveSynergies(
            nextBoard.slots,
            state.meta.unlockedSynergies,
          ),
        },
      };
    }

    case "MOVE_UNIT": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;
      const newIdx = slotIndex(action.row, action.col);
      if (newIdx < 0 || newIdx >= BOARD_SLOTS) return state;

      const oldIdx = run.board.slots.findIndex(
        (u) => u?.instanceId === action.instanceId,
      );
      if (oldIdx < 0) return state;
      if (oldIdx === newIdx) return state;

      const slots = [...run.board.slots];
      const moving = slots[oldIdx]!;
      const other = slots[newIdx];
      // Swap or place
      slots[newIdx] = { ...moving, position: { row: action.row, col: action.col } };
      slots[oldIdx] = other
        ? {
            ...other,
            position: {
              row: Math.floor(oldIdx / BOARD_COLS),
              col: oldIdx % BOARD_COLS,
            },
          }
        : null;

      const nextBoard = { ...run.board, slots };
      return {
        ...state,
        activeRun: {
          ...run,
          board: nextBoard,
          synergies: computeActiveSynergies(
            nextBoard.slots,
            state.meta.unlockedSynergies,
          ),
        },
      };
    }

    case "BENCH_UNIT": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;
      const idx = run.board.slots.findIndex(
        (u) => u?.instanceId === action.instanceId,
      );
      if (idx < 0) return state;
      if (run.bench.units.length >= run.bench.maxSize) return state;
      const unit = run.board.slots[idx]!;

      const nextBoard: BoardGrid = {
        ...run.board,
        slots: run.board.slots.map((u, i) => (i === idx ? null : u)),
      };
      const benched: BenchUnit = {
        instanceId: unit.instanceId,
        unitDefId: unit.unitDefId,
        starLevel: unit.starLevel,
        equippedRelicId: unit.equippedRelicId,
      };

      return {
        ...state,
        activeRun: {
          ...run,
          board: nextBoard,
          bench: { ...run.bench, units: [...run.bench.units, benched] },
          synergies: computeActiveSynergies(
            nextBoard.slots,
            state.meta.unlockedSynergies,
          ),
        },
      };
    }

    case "EQUIP_RELIC": {
      const run = state.activeRun;
      if (!run) return state;
      const relic = RELIC_MAP[action.relicId];
      if (!relic || relic.type !== "unit") return state;
      if (!run.activeRelics.includes(action.relicId)) return state;

      const bench = run.bench.units.map((u) =>
        u.instanceId === action.unitInstanceId
          ? { ...u, equippedRelicId: action.relicId }
          : u,
      );
      const board = run.board.slots.map((u) =>
        u && u.instanceId === action.unitInstanceId
          ? { ...u, equippedRelicId: action.relicId }
          : u,
      );

      return {
        ...state,
        activeRun: {
          ...run,
          bench: { ...run.bench, units: bench },
          board: { ...run.board, slots: board },
          activeRelics: run.activeRelics.filter((r) => r !== action.relicId),
        },
      };
    }

    case "UNEQUIP_RELIC": {
      const run = state.activeRun;
      if (!run) return state;
      let unequippedId: string | null = null;
      const bench = run.bench.units.map((u) => {
        if (u.instanceId === action.unitInstanceId && u.equippedRelicId) {
          unequippedId = u.equippedRelicId;
          return { ...u, equippedRelicId: null };
        }
        return u;
      });
      const board = run.board.slots.map((u) => {
        if (u && u.instanceId === action.unitInstanceId && u.equippedRelicId) {
          unequippedId = u.equippedRelicId;
          return { ...u, equippedRelicId: null };
        }
        return u;
      });
      if (!unequippedId) return state;
      return {
        ...state,
        activeRun: {
          ...run,
          bench: { ...run.bench, units: bench },
          board: { ...run.board, slots: board },
          activeRelics: [...run.activeRelics, unequippedId],
        },
      };
    }

    case "REROLL_SHOP": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;
      const rng = new Rng(run.rngState);
      const isFree = run.freeRerollsAvailable > 0;
      if (!isFree && run.gold < run.shop.rerollCost) return state;
      const newShop = rerollShop(
        run.shop,
        rng,
        state.meta.unlockedUnits,
        run.wave,
        run.shop.available.length,
      );
      return {
        ...state,
        activeRun: {
          ...run,
          shop: { ...newShop, rerollCost: run.shop.rerollCost },
          gold: isFree ? run.gold : run.gold - run.shop.rerollCost,
          freeRerollsAvailable: isFree
            ? run.freeRerollsAvailable - 1
            : run.freeRerollsAvailable,
          rngState: rng.getState(),
        },
      };
    }

    case "FREEZE_SHOP": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;
      return {
        ...state,
        activeRun: {
          ...run,
          shop: { ...run.shop, frozen: !run.shop.frozen },
        },
      };
    }

    case "START_COMBAT": {
      const run = state.activeRun;
      if (!run || run.phase !== "draft") return state;
      const wave = WAVE_MAP[run.wave];
      if (!wave) return state;

      const rng = new Rng(run.rngState);
      const synergies = computeActiveSynergies(
        run.board.slots,
        state.meta.unlockedSynergies,
      );
      const result = simulateCombat(
        boardUnits(run.board),
        wave,
        synergies,
        run.activeRelics,
        rng,
      );

      const winStreak =
        result.winner === "player" ? run.winStreak + 1 : 0;
      const loseStreak =
        result.winner === "enemy" ? run.loseStreak + 1 : 0;

      const newServerHp = Math.max(0, run.serverHp - result.damageToServer);
      const phase =
        newServerHp <= 0
          ? "game_over"
          : run.wave >= MAX_WAVE && result.winner === "player"
          ? "victory"
          : "combat_result";

      const enemyKills =
        result.winner === "player"
          ? wave.enemies.reduce((s, g) => s + g.count, 0)
          : 0;

      return {
        ...state,
        activeRun: {
          ...run,
          phase,
          combatResult: result,
          lastCombatResolved: true,
          serverHp: newServerHp,
          winStreak,
          loseStreak,
          synergies,
          rngState: rng.getState(),
        },
        meta: {
          ...state.meta,
          bestWave: Math.max(state.meta.bestWave, run.wave),
          totalKills: state.meta.totalKills + enemyKills,
          souls: state.meta.souls + result.soulsEarned,
        },
      };
    }

    case "NEXT_ROUND": {
      const run = state.activeRun;
      if (!run) return state;
      if (run.phase === "game_over" || run.phase === "victory") {
        // Finalize — earn souls based on progress
        const bossWavesCleared = Array.from({ length: run.wave }, (_, i) => {
          const w = WAVE_MAP[i + 1];
          return w?.isBoss;
        }).filter(Boolean).length;
        const soulsEarned = soulsFromRun(run.wave - 1, bossWavesCleared);
        return {
          ...state,
          meta: { ...state.meta, souls: state.meta.souls + soulsEarned },
          activeRun: null,
        };
      }
      if (run.phase !== "combat_result") return state;

      // Determine if we advance (winner) or stay on same wave (loser)
      const didWin = run.combatResult?.winner === "player";
      const rng = new Rng(run.rngState);
      const nextWaveNum = didWin ? run.wave + 1 : run.wave;

      const b = computeMetaBonuses(state.meta);

      const interest = Math.min(
        Math.floor(run.gold * INTEREST_RATE),
        INTEREST_MAX + b.interestCap,
      );
      const streakCount = Math.min(4, Math.max(run.winStreak, run.loseStreak));
      const baseStreak = STREAK_BONUSES[streakCount] ?? 0;
      const streakBonus = streakCount >= 2 ? baseStreak + b.streakBonus : 0;
      const globalReward = run.activeRelics.reduce((sum, rid) => {
        const r = RELIC_MAP[rid];
        if (r?.effect.type === "gold_per_wave") return sum + r.effect.value;
        return sum;
      }, 0);
      const combatGold = run.combatResult?.goldEarned ?? 0;
      const lossGold = didWin ? 0 : b.lossGold;
      const roundGold =
        BASE_INCOME_PER_ROUND +
        b.income +
        interest +
        streakBonus +
        globalReward +
        combatGold +
        lossGold;

      const shopSize =
        DEFAULT_SHOP_SIZE +
        b.shopSize +
        run.activeRelics.reduce((sum, rid) => {
          const r = RELIC_MAP[rid];
          if (r?.effect.type === "shop_size_increase") return sum + r.effect.value;
          return sum;
        }, 0);
      const freeRerolls =
        b.freeReroll +
        run.activeRelics.reduce((sum, rid) => {
          const r = RELIC_MAP[rid];
          if (r?.effect.type === "free_reroll_per_round")
            return sum + r.effect.value;
          return sum;
        }, 0);

      const newShop = run.shop.frozen
        ? run.shop
        : createInitialShop(
            rng,
            state.meta.unlockedUnits,
            nextWaveNum,
            shopSize,
          );

      // Heal placed units to full between rounds
      const healedSlots = run.board.slots.map((u) =>
        u ? { ...u, currentHp: u.maxHp } : u,
      );

      const discountedRerollCost = Math.max(0, DEFAULT_REROLL_COST - b.rerollCost);

      return {
        ...state,
        activeRun: {
          ...run,
          wave: nextWaveNum,
          phase: "draft",
          shop: { ...newShop, rerollCost: discountedRerollCost },
          gold: run.gold + roundGold,
          combatResult: null,
          lastCombatResolved: false,
          board: { ...run.board, slots: healedSlots },
          freeRerollsAvailable: freeRerolls,
          rngState: rng.getState(),
        },
      };
    }

    case "UNLOCK_NODE": {
      const node: ProgressionNode | undefined =
        PROGRESSION_MAP[action.nodeId];
      if (!node) return state;
      if (state.meta.progressionNodes.includes(node.id)) return state;
      if (state.meta.souls < node.cost) return state;
      for (const prereq of node.prerequisites) {
        if (!state.meta.progressionNodes.includes(prereq)) return state;
      }

      let meta: AutoBattlerMeta = {
        ...state.meta,
        souls: state.meta.souls - node.cost,
        progressionNodes: [...state.meta.progressionNodes, node.id],
      };

      switch (node.effect.type) {
        case "unlock_unit":
          meta = {
            ...meta,
            unlockedUnits: Array.from(
              new Set([...meta.unlockedUnits, node.effect.unitDefId]),
            ),
          };
          break;
        case "unlock_relic":
          meta = {
            ...meta,
            unlockedRelics: Array.from(
              new Set([...meta.unlockedRelics, node.effect.relicDefId]),
            ),
          };
          break;
        case "unlock_synergy":
          meta = {
            ...meta,
            unlockedSynergies: Array.from(
              new Set([...meta.unlockedSynergies, node.effect.synergyId]),
            ),
          };
          break;
      }

      return { ...state, meta };
    }

    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.settings },
      };

    default:
      return state;
  }
}
