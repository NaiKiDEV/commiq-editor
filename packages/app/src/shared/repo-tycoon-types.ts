// Repo Tycoon — shared types between main and renderer.

export type ResourceId =
  | "loc"
  | "commits"
  | "prs"
  | "stars"
  | "contributors"
  | "sponsors";

export type UpgradeCategory = "tooling" | "team" | "cicd" | "community";

export type MilestoneImpact = "small" | "medium" | "large" | "huge";

export type EffectKind =
  | { type: "tick_rate_mult"; resource: ResourceId; mult: number }
  | { type: "flat_add_per_sec"; resource: ResourceId; amount: number }
  | {
      type: "conversion_ratio_mult";
      from: ResourceId;
      to: ResourceId;
      mult: number;
    }
  | {
      type: "conversion_threshold_div";
      from: ResourceId;
      to: ResourceId;
      div: number;
    }
  | { type: "grant_resource"; resource: ResourceId; amount: number }
  | { type: "event_chance_mult"; mult: number }
  /** Applied once at the start of each run after a Rewrite in Rust prestige. */
  | { type: "prestige_start_grant"; resource: ResourceId; amount: number };

export type TierDef = {
  level: number;
  name: string;
  cost: { resource: ResourceId; amount: number };
  effects: EffectKind[];
  description: string;
};

export type UpgradeDef = {
  id: string;
  category: UpgradeCategory;
  name: string;
  emoji: string;
  flavorText: string;
  tiers: TierDef[];
};

export type PrestigeUpgradeDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  flavorText: string;
  /** Cost in sponsors (flat, one-time purchase). */
  cost: number;
  effects: EffectKind[];
};

export type MilestoneDef = {
  id: string;
  requires: { resource: ResourceId; amount: number };
  title: string;
  description: string;
  impact: MilestoneImpact;
  flags: string[];
  rewards?: EffectKind[];
};

export type EventDef = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  weight: number;
  effects: EffectKind[];
  durationSec?: number;
};

export type ActiveEvent = {
  id: string;
  startedAt: number;
  endsAt: number;
};

export type RepoTycoonStats = {
  totalTicks: number;
  totalManualCommits: number;
  runStart: number;
  lifetimeLoc: number;
};

export type RepoTycoonSettings = {
  autoSave: boolean;
  reducedMotion: boolean;
};

export type RepoTycoonState = {
  version: number;
  resources: Record<ResourceId, number>;
  /** Monotonically increasing totals — never decremented. Used for milestone checks. */
  lifetimeResources: Record<ResourceId, number>;
  /** upgradeId → owned tier level (0 = not purchased) */
  upgrades: Record<string, number>;
  /** How many times the player has prestiged (Rewrite in Rust). */
  prestigeLevel: number;
  /** Prestige upgrade id → 1 if owned. Persists across all runs. */
  prestigeUpgrades: Record<string, number>;
  /**
   * Crystals earned exclusively from "Rewrite in Rust" prestige resets.
   * Spent on prestige upgrades. Never earned from in-run Funding upgrades.
   */
  crystals: number;
  milestonesUnlocked: string[];
  activeEvents: ActiveEvent[];
  lastTickAt: number;
  lastEventRollAt: number;
  rngSeed: number;
  stats: RepoTycoonStats;
  settings: RepoTycoonSettings;
};

export type RepoTycoonAction =
  | { type: "TICK"; now: number }
  | { type: "MANUAL_COMMIT" }
  | { type: "BUY_UPGRADE"; upgradeId: string }
  | { type: "PRESTIGE" }
  | { type: "BUY_PRESTIGE_UPGRADE"; upgradeId: string }
  | { type: "CLAIM_EVENT"; eventId: string }
  | { type: "UPDATE_SETTINGS"; settings: Partial<RepoTycoonSettings> }
  | { type: "RESET" };

export type RepoTycoonConfigPayload = {
  upgrades: UpgradeDef[];
  milestones: MilestoneDef[];
  events: EventDef[];
  prestigeUpgrades: PrestigeUpgradeDef[];
  balance: {
    baseLocPerSec: number;
    commitThreshold: number;
    prThreshold: number;
    starsPerPr: number;
    eventRollIntervalSec: number;
    baseEventChancePerRoll: number;
    maxOfflineSec: number;
    manualCommitLoc: number;
    prestigeThreshold: number;
  };
};
