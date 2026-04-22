import type { WaveDef, EventChoice } from "../../../shared/auto-battler-types";

// ─── Event choice pools ───────────────────────────────────────

const EVENT_CHOICES_ACT2: EventChoice[] = [
  {
    id: "evt_free_reroll",
    name: "Optimized Pipeline",
    emoji: "🔄",
    description: "Gain 1 free reroll every round for the rest of this run.",
    effect: { type: "free_reroll_permanent", value: 1 },
  },
  {
    id: "evt_gold_injection",
    name: "Venture Capital",
    emoji: "💰",
    description: "Receive 12 gold immediately.",
    effect: { type: "gold", value: 12 },
  },
  {
    id: "evt_upgrade_unit",
    name: "Code Review",
    emoji: "🔍",
    description: "Upgrade a random unit on your board by 1★.",
    effect: { type: "upgrade_random_unit" },
  },
];

const SACRIFICE_CHOICES_ACT2: EventChoice[] = [
  {
    id: "sac_income_for_gold",
    name: "Technical Debt",
    emoji: "💳",
    description: "Lose 1 income per round permanently, gain 15 gold now.",
    effect: { type: "reduce_income_permanent", value: 1 },
  },
  {
    id: "sac_shop_slot_for_upgrade",
    name: "Vendor Lock-in",
    emoji: "🔒",
    description: "Lose 1 shop slot permanently, upgrade a random unit by 1★.",
    effect: { type: "lose_shop_slot_permanent", value: 1 },
  },
  {
    id: "sac_reroll_for_discount",
    name: "Bulk License",
    emoji: "🏷️",
    description: "Rerolls cost 1 more permanently, but shop units cost 1 less.",
    effect: { type: "shop_discount_permanent", value: 1 },
  },
];

const EVENT_CHOICES_ACT3: EventChoice[] = [
  {
    id: "evt_gold_big",
    name: "Series B Funding",
    emoji: "🏦",
    description: "Receive 18 gold immediately.",
    effect: { type: "gold", value: 18 },
  },
  {
    id: "evt_sacrifice_relic",
    name: "Open Source Contribution",
    emoji: "📦",
    description: "Sacrifice your weakest unit for a random relic.",
    effect: { type: "sacrifice_unit_for_relic" },
  },
  {
    id: "evt_heal_big",
    name: "Disaster Recovery",
    emoji: "🏥",
    description: "Heal 12 server HP.",
    effect: { type: "heal", value: 12 },
  },
];

const SACRIFICE_CHOICES_ACT4: EventChoice[] = [
  {
    id: "sac_income_for_gold_big",
    name: "Sell User Data",
    emoji: "🕵️",
    description: "Lose 2 income per round permanently, gain 25 gold now.",
    effect: { type: "reduce_income_permanent", value: 2 },
  },
  {
    id: "sac_downgrade_for_relic",
    name: "Forced Migration",
    emoji: "🚀",
    description: "Downgrade a random unit by 1★, gain a random relic.",
    effect: { type: "downgrade_random_unit" },
  },
  {
    id: "sac_hp_for_rerolls",
    name: "AI Autocomplete",
    emoji: "🤖",
    description: "Take 6 server damage, gain 2 free rerolls every round.",
    effect: { type: "server_damage_for_rerolls", damage: 6, rerolls: 2 },
  },
];

const EVENT_CHOICES_ACT5: EventChoice[] = [
  {
    id: "evt_gold_huge",
    name: "IPO",
    emoji: "📈",
    description: "Receive 25 gold immediately.",
    effect: { type: "gold", value: 25 },
  },
  {
    id: "evt_heal_huge",
    name: "Full Restore",
    emoji: "💚",
    description: "Heal 15 server HP.",
    effect: { type: "heal", value: 15 },
  },
  {
    id: "evt_sacrifice_relic_late",
    name: "Acqui-hire",
    emoji: "🤝",
    description: "Sacrifice your weakest unit for a random relic.",
    effect: { type: "sacrifice_unit_for_relic" },
  },
];

export const WAVES: WaveDef[] = [
  // ─── Act 1: The First Sprint (Waves 1-5) ───
  {
    wave: 1,
    name: "First Deploy",
    enemies: [{ enemyDefId: "null_pointer", count: 3 }],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
  },
  {
    wave: 2,
    name: "Swarm Warning",
    enemies: [
      { enemyDefId: "null_pointer", count: 2 },
      { enemyDefId: "ddos_swarm", count: 3 },
    ],
    isBoss: false,
    bonusGold: 1,
    bonusSouls: 0,
  },
  {
    wave: 3,
    name: "Memory Issues",
    enemies: [
      { enemyDefId: "memory_leak", count: 2 },
      { enemyDefId: "null_pointer", count: 3 },
    ],
    isBoss: false,
    bonusGold: 1,
    bonusSouls: 0,
  },
  {
    wave: 4,
    name: "⚡ Concurrency Hell",
    type: "elite",
    enemies: [
      { enemyDefId: "race_condition", count: 2 },
      { enemyDefId: "ddos_swarm", count: 3 },
    ],
    isBoss: false,
    bonusGold: 3,
    bonusSouls: 2,
    modifiers: [{ type: "enrage_on_low_hp", hpPercent: 40, attackBonus: 4 }],
  },
  {
    wave: 5,
    name: "🔒 Ransomware",
    enemies: [
      { enemyDefId: "ransomware_boss", count: 1 },
      { enemyDefId: "null_pointer", count: 2 },
    ],
    isBoss: true,
    bonusGold: 5,
    bonusSouls: 5,
  },

  // ─── Act 2: Growing Pains (Waves 6-10) ───
  {
    wave: 6,
    name: "SQL Injections",
    enemies: [
      { enemyDefId: "sql_injection", count: 2 },
      { enemyDefId: "null_pointer", count: 2 },
    ],
    isBoss: false,
    bonusGold: 2,
    bonusSouls: 1,
  },
  {
    wave: 7,
    name: "Phishing Campaign",
    enemies: [
      { enemyDefId: "phishing_link", count: 2 },
      { enemyDefId: "race_condition", count: 2 },
    ],
    isBoss: false,
    bonusGold: 2,
    bonusSouls: 1,
  },
  {
    wave: 8,
    name: "🎪 Incident Review",
    type: "event",
    enemies: [],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
    eventChoices: EVENT_CHOICES_ACT2,
  },
  {
    wave: 9,
    name: "🔧 Maintenance Window",
    type: "sacrifice",
    enemies: [],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
    eventChoices: SACRIFICE_CHOICES_ACT2,
  },
  {
    wave: 10,
    name: "📡 DDoS Amplifier",
    enemies: [
      { enemyDefId: "ddos_amplifier_boss", count: 1 },
      { enemyDefId: "ddos_swarm", count: 3 },
      { enemyDefId: "null_pointer", count: 1 },
    ],
    isBoss: true,
    bonusGold: 6,
    bonusSouls: 7,
  },

  // ─── Act 3: Escalation (Waves 11-15) ───
  {
    wave: 11,
    name: "Kernel Chaos",
    enemies: [
      { enemyDefId: "kernel_panic", count: 2 },
      { enemyDefId: "race_condition", count: 2 },
    ],
    isBoss: false,
    bonusGold: 3,
    bonusSouls: 2,
  },
  {
    wave: 12,
    name: "Critical Lock",
    enemies: [
      { enemyDefId: "deadlock", count: 2 },
      { enemyDefId: "zombie_process", count: 2 },
    ],
    isBoss: false,
    bonusGold: 4,
    bonusSouls: 2,
    modifiers: [{ type: "thorns", damage: 3 }],
  },
  {
    wave: 13,
    name: "🎪 Architecture Review",
    type: "event",
    enemies: [],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
    eventChoices: EVENT_CHOICES_ACT3,
  },
  {
    wave: 14,
    name: "⚡ Incident Pre-Mortem",
    type: "elite",
    enemies: [
      { enemyDefId: "kernel_panic", count: 2 },
      { enemyDefId: "sql_injection", count: 2 },
      { enemyDefId: "null_pointer", count: 3 },
    ],
    isBoss: false,
    bonusGold: 5,
    bonusSouls: 4,
    modifiers: [
      { type: "regen", healPerTick: 2 },
      { type: "shielded", shieldAmount: 15 },
    ],
  },
  {
    wave: 15,
    name: "🔒 Ransomware II",
    enemies: [
      { enemyDefId: "ransomware_boss", count: 1 },
      { enemyDefId: "cryptominer", count: 2 },
      { enemyDefId: "race_condition", count: 2 },
    ],
    isBoss: true,
    bonusGold: 7,
    bonusSouls: 8,
  },

  // ─── Act 4: Advanced Threats (Waves 16-20) ───
  {
    wave: 16,
    name: "Zero Day Exploits",
    enemies: [
      { enemyDefId: "zero_day", count: 2 },
      { enemyDefId: "phishing_link", count: 2 },
    ],
    isBoss: false,
    bonusGold: 5,
    bonusSouls: 3,
  },
  {
    wave: 17,
    name: "Rootkit Infestation",
    enemies: [
      { enemyDefId: "rootkit", count: 2 },
      { enemyDefId: "buffer_overflow", count: 2 },
    ],
    isBoss: false,
    bonusGold: 5,
    bonusSouls: 3,
    modifiers: [{ type: "enrage_on_low_hp", hpPercent: 50, attackBonus: 8 }],
  },
  {
    wave: 18,
    name: "🔧 War Room",
    type: "sacrifice",
    enemies: [],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
    eventChoices: SACRIFICE_CHOICES_ACT4,
  },
  {
    wave: 19,
    name: "⚡ System Meltdown",
    type: "elite",
    enemies: [
      { enemyDefId: "kernel_panic", count: 2 },
      { enemyDefId: "deadlock", count: 2 },
      { enemyDefId: "buffer_overflow", count: 2 },
    ],
    isBoss: false,
    bonusGold: 6,
    bonusSouls: 5,
    modifiers: [
      { type: "thorns", damage: 5 },
      { type: "regen", healPerTick: 3 },
      { type: "berserk", attackSpeedReduction: 1 },
    ],
  },
  {
    wave: 20,
    name: "📚 Stack Overflow",
    enemies: [
      { enemyDefId: "stack_overflow_boss", count: 1 },
      { enemyDefId: "buffer_overflow", count: 2 },
    ],
    isBoss: true,
    bonusGold: 10,
    bonusSouls: 12,
  },

  // ─── Act 5: The Final Incident (Waves 21-25) ───
  {
    wave: 21,
    name: "APT Siege",
    enemies: [
      { enemyDefId: "apt_threat", count: 2 },
      { enemyDefId: "rootkit", count: 2 },
      { enemyDefId: "cryptominer", count: 2 },
    ],
    isBoss: false,
    bonusGold: 6,
    bonusSouls: 4,
    modifiers: [{ type: "shielded", shieldAmount: 20 }],
  },
  {
    wave: 22,
    name: "Full Breach",
    enemies: [
      { enemyDefId: "zero_day", count: 3 },
      { enemyDefId: "sql_injection", count: 2 },
      { enemyDefId: "phishing_link", count: 2 },
    ],
    isBoss: false,
    bonusGold: 6,
    bonusSouls: 5,
    modifiers: [{ type: "enrage_on_low_hp", hpPercent: 50, attackBonus: 10 }],
  },
  {
    wave: 23,
    name: "🎪 Final Stand Prep",
    type: "event",
    enemies: [],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
    eventChoices: EVENT_CHOICES_ACT5,
  },
  {
    wave: 24,
    name: "⚡ The Gauntlet",
    type: "elite",
    enemies: [
      { enemyDefId: "apt_threat", count: 1 },
      { enemyDefId: "zero_day", count: 2 },
      { enemyDefId: "rootkit", count: 1 },
      { enemyDefId: "cryptominer", count: 2 },
    ],
    isBoss: false,
    bonusGold: 8,
    bonusSouls: 6,
    modifiers: [
      { type: "berserk", attackSpeedReduction: 1 },
      { type: "enrage_on_low_hp", hpPercent: 30, attackBonus: 8 },
    ],
  },
  {
    wave: 25,
    name: "📚 Stack Overflow II",
    enemies: [
      { enemyDefId: "stack_overflow_boss", count: 1 },
      { enemyDefId: "buffer_overflow", count: 2 },
      { enemyDefId: "kernel_panic", count: 1 },
    ],
    isBoss: true,
    bonusGold: 10,
    bonusSouls: 12,
  },

  // ─── Act 6: Persistent Threats (Waves 26-30) ───
  {
    wave: 26,
    name: "Worm Propagation",
    enemies: [
      { enemyDefId: "rootkit", count: 2 },
      { enemyDefId: "memory_leak", count: 3 },
      { enemyDefId: "ddos_swarm", count: 3 },
    ],
    isBoss: false,
    bonusGold: 6,
    bonusSouls: 4,
    modifiers: [{ type: "regen", healPerTick: 3 }],
  },
  {
    wave: 27,
    name: "Supply Chain Attack",
    enemies: [
      { enemyDefId: "apt_threat", count: 2 },
      { enemyDefId: "sql_injection", count: 3 },
      { enemyDefId: "phishing_link", count: 2 },
    ],
    isBoss: false,
    bonusGold: 7,
    bonusSouls: 5,
    modifiers: [{ type: "shielded", shieldAmount: 15 }],
  },
  {
    wave: 28,
    name: "🎪 Post-Mortem",
    type: "event",
    enemies: [],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
    eventChoices: EVENT_CHOICES_ACT5,
  },
  {
    wave: 29,
    name: "⚡ Cascading Failure",
    type: "elite",
    enemies: [
      { enemyDefId: "kernel_panic", count: 3 },
      { enemyDefId: "buffer_overflow", count: 2 },
      { enemyDefId: "deadlock", count: 2 },
    ],
    isBoss: false,
    bonusGold: 8,
    bonusSouls: 6,
    modifiers: [
      { type: "thorns", damage: 4 },
      { type: "enrage_on_low_hp", hpPercent: 40, attackBonus: 8 },
    ],
  },
  {
    wave: 30,
    name: "📡 DDoS Amplifier II",
    enemies: [
      { enemyDefId: "ddos_amplifier_boss", count: 1 },
      { enemyDefId: "ddos_swarm", count: 4 },
    ],
    isBoss: true,
    bonusGold: 12,
    bonusSouls: 15,
  },

  // ─── Act 7: The Singularity (Waves 31-35) ───
  {
    wave: 31,
    name: "Total Recall",
    enemies: [
      { enemyDefId: "zero_day", count: 3 },
      { enemyDefId: "rootkit", count: 2 },
      { enemyDefId: "apt_threat", count: 2 },
    ],
    isBoss: false,
    bonusGold: 8,
    bonusSouls: 6,
    modifiers: [{ type: "berserk", attackSpeedReduction: 1 }],
  },
  {
    wave: 32,
    name: "Protocol Collapse",
    enemies: [
      { enemyDefId: "kernel_panic", count: 3 },
      { enemyDefId: "deadlock", count: 2 },
      { enemyDefId: "cryptominer", count: 2 },
    ],
    isBoss: false,
    bonusGold: 8,
    bonusSouls: 6,
    modifiers: [
      { type: "regen", healPerTick: 3 },
      { type: "shielded", shieldAmount: 20 },
    ],
  },
  {
    wave: 33,
    name: "🔧 War Room II",
    type: "sacrifice",
    enemies: [],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
    eventChoices: SACRIFICE_CHOICES_ACT4,
  },
  {
    wave: 34,
    name: "⚡ Total Meltdown",
    type: "elite",
    enemies: [
      { enemyDefId: "apt_threat", count: 2 },
      { enemyDefId: "zero_day", count: 2 },
      { enemyDefId: "rootkit", count: 2 },
      { enemyDefId: "buffer_overflow", count: 2 },
    ],
    isBoss: false,
    bonusGold: 10,
    bonusSouls: 8,
    modifiers: [
      { type: "berserk", attackSpeedReduction: 1 },
      { type: "enrage_on_low_hp", hpPercent: 35, attackBonus: 10 },
      { type: "shielded", shieldAmount: 20 },
    ],
  },
  {
    wave: 35,
    name: "🌀 The Singularity",
    enemies: [{ enemyDefId: "singularity_boss", count: 1 }],
    isBoss: true,
    bonusGold: 20,
    bonusSouls: 25,
  },
];

export const WAVE_MAP: Record<number, WaveDef> = Object.fromEntries(
  WAVES.map((w) => [w.wave, w]),
);

export const MAX_WAVE = WAVES.length;
