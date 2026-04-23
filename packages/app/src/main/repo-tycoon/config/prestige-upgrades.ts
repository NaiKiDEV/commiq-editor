import type { PrestigeUpgradeDef } from "../../../shared/repo-tycoon-types";

/**
 * Prestige upgrades are bought with Sponsors and persist across all future runs.
 * Production effects (tick_rate_mult, flat_add_per_sec, etc.) are applied every
 * tick via computeContext.
 * prestige_start_grant effects are applied once at the start of each new run
 * (immediately after a Rewrite in Rust).
 */
export const PRESTIGE_UPGRADES: PrestigeUpgradeDef[] = [
  {
    id: "headstart",
    name: "Head Start",
    emoji: "🏁",
    flavorText: "You've done this before.",
    description: "Begin every run with 50 LoC already written.",
    cost: 1,
    effects: [{ type: "prestige_start_grant", resource: "loc", amount: 50 }],
  },
  {
    id: "veteran-contributors",
    name: "Veteran Contributors",
    emoji: "🧑‍💻",
    flavorText: "They followed you from the last project.",
    description: "Begin every run with 3 contributors already on board.",
    cost: 2,
    effects: [
      { type: "prestige_start_grant", resource: "contributors", amount: 3 },
    ],
  },
  {
    id: "prior-art",
    name: "Prior Art",
    emoji: "📚",
    flavorText: "Built on everything that came before.",
    description: "+2 flat LoC/sec. Permanent across all runs.",
    cost: 3,
    effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 2 }],
  },
  {
    id: "muscle-memory",
    name: "Muscle Memory",
    emoji: "⚡",
    flavorText: "Your fingers know the way.",
    description: "1.5× LoC/sec multiplier. Permanent.",
    cost: 4,
    effects: [{ type: "tick_rate_mult", resource: "loc", mult: 1.5 }],
  },
  {
    id: "streamlined-reviews",
    name: "Streamlined Reviews",
    emoji: "✅",
    flavorText: "LGTM is muscle memory now.",
    description: "Commits-to-PR threshold ÷1.5 permanently.",
    cost: 5,
    effects: [
      {
        type: "conversion_threshold_div",
        from: "commits",
        to: "prs",
        div: 1.5,
      },
    ],
  },
  {
    id: "stellar-reputation",
    name: "Stellar Reputation",
    emoji: "🌟",
    flavorText: "Word got around. People are watching.",
    description: "1.5× stars per PR. Permanent.",
    cost: 6,
    effects: [
      { type: "conversion_ratio_mult", from: "prs", to: "stars", mult: 1.5 },
    ],
  },
  {
    id: "founding-team",
    name: "Founding Team",
    emoji: "🏆",
    flavorText: "They believed before anyone else.",
    description: "Start with 8 contributors every run. +5 flat LoC/sec. Permanent.",
    cost: 8,
    effects: [
      { type: "prestige_start_grant", resource: "contributors", amount: 8 },
      { type: "flat_add_per_sec", resource: "loc", amount: 5 },
    ],
  },
  {
    id: "venture-backed",
    name: "Venture Backed",
    emoji: "💸",
    flavorText: "Runway. Not much, but enough.",
    description: "2× LoC/sec multiplier. Permanent.",
    cost: 10,
    effects: [{ type: "tick_rate_mult", resource: "loc", mult: 2 }],
  },
  {
    id: "viral-loop",
    name: "Viral Loop",
    emoji: "🔄",
    flavorText: "Stars beget stars.",
    description: "2× stars per PR. Permanent.",
    cost: 12,
    effects: [
      { type: "conversion_ratio_mult", from: "prs", to: "stars", mult: 2 },
    ],
  },
  {
    id: "seasoned-engineers",
    name: "Seasoned Engineers",
    emoji: "🎖️",
    flavorText: "They shipped before. They'll ship again.",
    description: "Start with 15 contributors every run. +10 flat LoC/sec. Permanent.",
    cost: 15,
    effects: [
      { type: "prestige_start_grant", resource: "contributors", amount: 15 },
      { type: "flat_add_per_sec", resource: "loc", amount: 10 },
    ],
  },
  {
    id: "compounding-returns",
    name: "Compounding Returns",
    emoji: "📈",
    flavorText: "Each run faster than the last.",
    description: "3× LoC/sec mult. 1.5× stars/PR. Permanent.",
    cost: 18,
    effects: [
      { type: "tick_rate_mult", resource: "loc", mult: 3 },
      { type: "conversion_ratio_mult", from: "prs", to: "stars", mult: 1.5 },
    ],
  },
  {
    id: "open-source-foundation",
    name: "Open Source Foundation",
    emoji: "🏛️",
    flavorText: "An institution now. The project outlives any one maintainer.",
    description:
      "Start with 20 contributors. +20 LoC/sec. 2× stars/PR. Permanent.",
    cost: 25,
    effects: [
      { type: "prestige_start_grant", resource: "contributors", amount: 20 },
      { type: "flat_add_per_sec", resource: "loc", amount: 20 },
      { type: "conversion_ratio_mult", from: "prs", to: "stars", mult: 2 },
    ],
  },
];

export const PRESTIGE_UPGRADE_MAP: Record<string, PrestigeUpgradeDef> =
  Object.fromEntries(PRESTIGE_UPGRADES.map((u) => [u.id, u]));
