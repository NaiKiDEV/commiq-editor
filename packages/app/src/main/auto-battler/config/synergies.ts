import type { SynergyDef } from "../../../shared/auto-battler-types";

export const SYNERGIES: SynergyDef[] = [
  {
    id: "infrastructure",
    name: "Infrastructure",
    emoji: "🏗️",
    description: "Infrastructure units harden the deployment.",
    trait: "infrastructure",
    thresholds: [
      {
        count: 2,
        bonus: {
          type: "stat_boost",
          stat: "defense",
          value: 2,
          target: "all_units",
        },
        description: "+2 defense to all units",
      },
      {
        count: 4,
        bonus: {
          type: "stat_boost",
          stat: "defense",
          value: 5,
          target: "all_units",
        },
        description: "+5 defense to all units",
      },
    ],
  },
  {
    id: "database",
    name: "Database",
    emoji: "🗄️",
    description: "Database units crank mana generation.",
    trait: "database",
    thresholds: [
      {
        count: 2,
        bonus: {
          type: "stat_boost",
          stat: "manaPerAttack",
          value: 5,
          target: "trait_units",
        },
        description: "DB units gain +5 mana/attack",
      },
      {
        count: 3,
        bonus: {
          type: "stat_boost",
          stat: "manaPerAttack",
          value: 10,
          target: "all_units",
        },
        description: "All units gain +10 mana/attack",
      },
    ],
  },
  {
    id: "cache",
    name: "Cache Layer",
    emoji: "💨",
    description: "Cached units strike faster.",
    trait: "cache",
    thresholds: [
      {
        count: 2,
        bonus: {
          type: "stat_boost",
          stat: "attackSpeed",
          value: -1,
          target: "trait_units",
        },
        description: "Cache units attack faster",
      },
    ],
  },
  {
    id: "frontend",
    name: "Frontend",
    emoji: "🎨",
    description: "Frontend units land crits on combat start.",
    trait: "frontend",
    thresholds: [
      {
        count: 2,
        bonus: {
          type: "on_combat_start",
          effect: { type: "damage", value: 15 },
          target: "trait_units",
        },
        description: "Front units deal 15 damage at start",
      },
      {
        count: 3,
        bonus: {
          type: "on_combat_start",
          effect: { type: "damage", value: 30 },
          target: "trait_units",
        },
        description: "Front units deal 30 damage at start",
      },
    ],
  },
  {
    id: "monitoring",
    name: "Monitoring",
    emoji: "📈",
    description: "Monitoring units buff the team's attack.",
    trait: "monitoring",
    thresholds: [
      {
        count: 2,
        bonus: {
          type: "stat_boost",
          stat: "attack",
          value: 4,
          target: "all_units",
        },
        description: "+4 attack to all units",
      },
    ],
  },
  {
    id: "orchestrator",
    name: "Orchestrator",
    emoji: "🎯",
    description: "Orchestrators heal allies on kill.",
    trait: "orchestrator",
    thresholds: [
      {
        count: 2,
        bonus: {
          type: "on_kill",
          effect: { type: "heal", value: 8 },
        },
        description: "Heal 8 HP to lowest ally on kill",
      },
      {
        count: 3,
        bonus: {
          type: "on_kill",
          effect: { type: "heal", value: 20 },
        },
        description: "Heal 20 HP to lowest ally on kill",
      },
    ],
  },
];

export const SYNERGY_MAP: Record<string, SynergyDef> = Object.fromEntries(
  SYNERGIES.map((s) => [s.id, s]),
);
