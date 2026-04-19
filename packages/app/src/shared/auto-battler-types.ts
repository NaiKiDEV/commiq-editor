// Auto-battler game types — shared between main and renderer

export type UnitRole = "tank" | "dps" | "support" | "assassin";

export type TargetingAI =
  | "nearest"
  | "lowest_hp"
  | "highest_attack"
  | "random"
  | "backline_first";

export type AbilityTargetType =
  | "nearest"
  | "lowest_hp"
  | "highest_attack"
  | "aoe_all"
  | "aoe_row"
  | "self"
  | "ally_lowest_hp";

export type AbilityEffect =
  | { type: "damage"; value: number; scaling?: number }
  | { type: "heal"; value: number; scaling?: number }
  | { type: "shield"; value: number; duration: number }
  | { type: "buff"; stat: string; value: number; duration: number }
  | { type: "debuff"; stat: string; value: number; duration: number }
  | { type: "stun"; duration: number; chance: number }
  | { type: "summon"; unitDefId: string; count: number }
  | { type: "dot"; damagePerTick: number; duration: number };

export type UnitStats = {
  hp: number;
  attack: number;
  attackSpeed: number;
  range: number;
  defense: number;
  mana: number;
  manaPerAttack: number;
};

export type UnitAbilityDef = {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  effects: AbilityEffect[];
  targetType: AbilityTargetType;
};

export type UnitDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tier: 1 | 2 | 3 | 4 | 5;
  role: UnitRole;
  traits: string[];
  baseStats: UnitStats;
  starScaling: { hpMult: number; attackMult: number; abilityMult: number };
  ability: UnitAbilityDef;
  targeting: TargetingAI;
  unlockNodeId?: string;
};

export type SynergyBonus =
  | {
      type: "stat_boost";
      stat: string;
      value: number;
      target: "trait_units" | "all_units";
    }
  | {
      type: "on_combat_start";
      effect: AbilityEffect;
      target: "trait_units" | "all_units";
    }
  | { type: "on_kill"; effect: AbilityEffect }
  | { type: "gold_bonus"; value: number }
  | { type: "shop_discount"; value: number };

export type SynergyThreshold = {
  count: number;
  bonus: SynergyBonus;
  description: string;
};

export type SynergyDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  trait: string;
  thresholds: SynergyThreshold[];
};

export type EnemyDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tier: number;
  stats: UnitStats;
  ability: UnitAbilityDef | null;
  targeting: TargetingAI;
  isBoss: boolean;
  soulValue: number;
  /** Boss phase abilities: fire once when tick reaches the threshold */
  phaseAbilities?: Array<{
    tick: number;
    ability: UnitAbilityDef;
    announcement?: string;
  }>;
  /** Tick at which boss enrages (permanent +ATK, +speed) */
  enrageTick?: number;
};

export type WaveModifier =
  | { type: "enrage_on_low_hp"; hpPercent: number; attackBonus: number }
  | { type: "thorns"; damage: number }
  | { type: "regen"; healPerTick: number }
  | { type: "shielded"; shieldAmount: number }
  | { type: "berserk"; attackSpeedReduction: number };

export type WaveEnemy = {
  enemyDefId: string;
  count: number;
  position?: { row: number; col: number };
};

export type WaveDef = {
  wave: number;
  name: string;
  enemies: WaveEnemy[];
  isBoss: boolean;
  bonusGold: number;
  bonusSouls: number;
  /** Modifiers applied to all enemies in this wave */
  modifiers?: WaveModifier[];
};

export type RelicRarity = "common" | "uncommon" | "rare" | "legendary";

export type RelicEffect =
  | { type: "stat_boost"; stat: string; value: number }
  | { type: "on_ability_cast"; effect: AbilityEffect }
  | { type: "on_combat_start"; effect: AbilityEffect }
  | { type: "gold_per_wave"; value: number }
  | { type: "interest_bonus"; value: number }
  | { type: "shop_size_increase"; value: number }
  | { type: "free_reroll_per_round"; value: number };

export type RelicDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rarity: RelicRarity;
  type: "unit" | "global";
  effect: RelicEffect;
  unlockNodeId?: string;
};

export type ProgressionEffect =
  | { type: "unlock_unit"; unitDefId: string }
  | { type: "unlock_relic"; relicDefId: string }
  | { type: "unlock_synergy"; synergyId: string }
  | { type: "permanent_stat"; stat: string; value: number }
  | {
      type: "starting_bonus";
      bonusType:
        | "gold"
        | "hp"
        | "shop_size"
        | "bench_size"
        | "free_reroll"
        | "income"
        | "interest_cap"
        | "reroll_cost"
        | "streak_bonus"
        | "loss_gold";
      value: number;
    }
  | { type: "unlock_mechanic"; mechanicId: string };

export type ProgressionNode = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: "unit_pool" | "relic_pool" | "synergy" | "stat_boost" | "mechanic";
  cost: number;
  prerequisites: string[];
  position: { x: number; y: number };
  effect: ProgressionEffect;
};

// --- Runtime / run state ---

export type StarLevel = 1 | 2 | 3;

export type PlacedUnit = {
  instanceId: string;
  unitDefId: string;
  starLevel: StarLevel;
  currentHp: number;
  maxHp: number;
  equippedRelicIds: string[];
  position: { row: number; col: number };
};

export type BenchUnit = {
  instanceId: string;
  unitDefId: string;
  starLevel: StarLevel;
  equippedRelicIds: string[];
};

export type BoardGrid = {
  rows: number;
  cols: number;
  slots: (PlacedUnit | null)[];
};

export type Bench = {
  maxSize: number;
  units: BenchUnit[];
};

export type ShopSlot = {
  unitDefId: string;
  cost: number;
  sold: boolean;
};

export type ShopState = {
  available: ShopSlot[];
  rerollCost: number;
  frozen: boolean;
};

export type ActiveSynergy = {
  synergyId: string;
  unitCount: number;
  activeThreshold: number;
  bonusDescription: string;
};

export type RunPhase =
  | "draft"
  | "combat"
  | "combat_result"
  | "game_over"
  | "victory";

export type ResolvedEffect = { description: string; value: number };

export type CombatEvent =
  | { type: "attack"; sourceId: string; targetId: string; damage: number }
  | {
      type: "ability";
      sourceId: string;
      abilityId: string;
      targets: string[];
      effects: ResolvedEffect[];
    }
  | { type: "death"; unitId: string; killerSourceId: string }
  | {
      type: "buff_applied";
      targetId: string;
      stat: string;
      value: number;
      duration: number;
    }
  | {
      type: "debuff_applied";
      targetId: string;
      stat: string;
      value: number;
      duration: number;
    }
  | { type: "heal"; targetId: string; sourceId: string; value: number }
  | { type: "shield"; targetId: string; value: number }
  | { type: "summon"; sourceId: string; unitDefId: string }
  | { type: "synergy_proc"; synergyId: string; description: string }
  | { type: "relic_proc"; relicId: string; description: string }
  | { type: "announcement"; text: string };

export type CombatTick = {
  tick: number;
  events: CombatEvent[];
};

export type CombatantSide = "player" | "enemy";

/** Snapshot of a combatant at a given tick — used for UI replay */
export type CombatantSnapshot = {
  instanceId: string;
  side: CombatantSide;
  unitDefId: string;
  emoji: string;
  name: string;
  starLevel: StarLevel;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: number;
  stunned: boolean;
  alive: boolean;
};

export type CombatSnapshot = {
  tick: number;
  combatants: CombatantSnapshot[];
  events: CombatEvent[];
};

export type CombatResult = {
  snapshots: CombatSnapshot[];
  winner: CombatantSide | "draw";
  damageToServer: number;
  goldEarned: number;
  soulsEarned: number;
};

export type AutoBattlerRun = {
  id: string;
  seed: number;
  rngState: number;
  wave: number;
  phase: RunPhase;
  board: BoardGrid;
  bench: Bench;
  shop: ShopState;
  gold: number;
  serverHp: number;
  maxServerHp: number;
  activeRelics: string[];
  synergies: ActiveSynergy[];
  combatResult: CombatResult | null;
  lastCombatResolved: boolean;
  winStreak: number;
  loseStreak: number;
  freeRerollsAvailable: number;
};

export type AutoBattlerMeta = {
  totalRuns: number;
  bestWave: number;
  totalKills: number;
  souls: number;
  unlockedUnits: string[];
  unlockedRelics: string[];
  unlockedSynergies: string[];
  progressionNodes: string[];
  unlockedMechanics: string[];
  statistics: Record<string, number>;
};

export type GameSettings = {
  combatSpeed: "instant" | "fast" | "normal" | "slow";
  autoSave: boolean;
  showDamageNumbers: boolean;
};

export type AutoBattlerSave = {
  version: number;
  meta: AutoBattlerMeta;
  activeRun: AutoBattlerRun | null;
  settings: GameSettings;
};

// --- Actions ---

export type GameAction =
  | { type: "START_RUN"; seed?: number }
  | { type: "BUY_UNIT"; shopIndex: number }
  | { type: "SELL_UNIT"; instanceId: string }
  | {
      type: "PLACE_UNIT";
      instanceId: string;
      row: number;
      col: number;
    }
  | {
      type: "MOVE_UNIT";
      instanceId: string;
      row: number;
      col: number;
    }
  | { type: "BENCH_UNIT"; instanceId: string }
  | { type: "EQUIP_RELIC"; relicId: string; unitInstanceId: string }
  | { type: "UNEQUIP_RELIC"; unitInstanceId: string }
  | { type: "REROLL_SHOP" }
  | { type: "FREEZE_SHOP" }
  | { type: "START_COMBAT" }
  | { type: "NEXT_ROUND" }
  | { type: "END_RUN" }
  | { type: "UNLOCK_NODE"; nodeId: string }
  | { type: "UPDATE_SETTINGS"; settings: Partial<GameSettings> };
