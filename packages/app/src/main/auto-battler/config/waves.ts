import type { WaveDef } from "../../../shared/auto-battler-types";

export const WAVES: WaveDef[] = [
  // ─── Act 1: The First Sprint (Waves 1-5) ───
  {
    wave: 1,
    name: "First Deploy",
    enemies: [{ enemyDefId: "null_pointer", count: 2 }],
    isBoss: false,
    bonusGold: 0,
    bonusSouls: 0,
  },
  {
    wave: 2,
    name: "Swarm Warning",
    enemies: [
      { enemyDefId: "null_pointer", count: 2 },
      { enemyDefId: "ddos_swarm", count: 2 },
    ],
    isBoss: false,
    bonusGold: 1,
    bonusSouls: 0,
  },
  {
    wave: 3,
    name: "Memory Issues",
    enemies: [
      { enemyDefId: "memory_leak", count: 1 },
      { enemyDefId: "null_pointer", count: 3 },
    ],
    isBoss: false,
    bonusGold: 1,
    bonusSouls: 0,
  },
  {
    wave: 4,
    name: "Concurrency Hell",
    enemies: [
      { enemyDefId: "race_condition", count: 2 },
      { enemyDefId: "ddos_swarm", count: 2 },
    ],
    isBoss: false,
    bonusGold: 2,
    bonusSouls: 1,
  },
  {
    wave: 5,
    name: "🔒 Ransomware",
    enemies: [{ enemyDefId: "ransomware_boss", count: 1 }],
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
    name: "Zombie Horde",
    enemies: [
      { enemyDefId: "zombie_process", count: 3 },
      { enemyDefId: "memory_leak", count: 1 },
    ],
    isBoss: false,
    bonusGold: 3,
    bonusSouls: 2,
    modifiers: [{ type: "enrage_on_low_hp", hpPercent: 30, attackBonus: 5 }],
  },
  {
    wave: 9,
    name: "Cron Fire",
    enemies: [
      { enemyDefId: "cron_daemon", count: 2 },
      { enemyDefId: "null_pointer", count: 3 },
    ],
    isBoss: false,
    bonusGold: 3,
    bonusSouls: 2,
  },
  {
    wave: 10,
    name: "📡 DDoS Amplifier",
    enemies: [
      { enemyDefId: "ddos_amplifier_boss", count: 1 },
      { enemyDefId: "ddos_swarm", count: 2 },
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
    name: "Cryptomining Farm",
    enemies: [
      { enemyDefId: "cryptominer", count: 3 },
      { enemyDefId: "buffer_overflow", count: 1 },
    ],
    isBoss: false,
    bonusGold: 4,
    bonusSouls: 3,
  },
  {
    wave: 14,
    name: "Incident Pre-Mortem",
    enemies: [
      { enemyDefId: "kernel_panic", count: 2 },
      { enemyDefId: "sql_injection", count: 2 },
      { enemyDefId: "null_pointer", count: 2 },
    ],
    isBoss: false,
    bonusGold: 4,
    bonusSouls: 3,
    modifiers: [{ type: "regen", healPerTick: 2 }],
  },
  {
    wave: 15,
    name: "🔒 Ransomware II",
    enemies: [
      { enemyDefId: "ransomware_boss", count: 1 },
      { enemyDefId: "cryptominer", count: 2 },
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
    name: "Coordinated Attack",
    enemies: [
      { enemyDefId: "apt_threat", count: 1 },
      { enemyDefId: "zero_day", count: 2 },
      { enemyDefId: "rootkit", count: 1 },
    ],
    isBoss: false,
    bonusGold: 5,
    bonusSouls: 4,
  },
  {
    wave: 19,
    name: "System Meltdown",
    enemies: [
      { enemyDefId: "kernel_panic", count: 2 },
      { enemyDefId: "deadlock", count: 2 },
      { enemyDefId: "buffer_overflow", count: 2 },
    ],
    isBoss: false,
    bonusGold: 5,
    bonusSouls: 4,
    modifiers: [
      { type: "thorns", damage: 5 },
      { type: "regen", healPerTick: 3 },
    ],
  },
  {
    wave: 20,
    name: "📚 Stack Overflow",
    enemies: [{ enemyDefId: "stack_overflow_boss", count: 1 }],
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
    name: "Cascading Failure",
    enemies: [
      { enemyDefId: "deadlock", count: 3 },
      { enemyDefId: "kernel_panic", count: 2 },
      { enemyDefId: "buffer_overflow", count: 2 },
    ],
    isBoss: false,
    bonusGold: 7,
    bonusSouls: 5,
    modifiers: [
      { type: "thorns", damage: 6 },
      { type: "regen", healPerTick: 4 },
    ],
  },
  {
    wave: 24,
    name: "The Gauntlet",
    enemies: [
      { enemyDefId: "apt_threat", count: 2 },
      { enemyDefId: "zero_day", count: 2 },
      { enemyDefId: "rootkit", count: 2 },
      { enemyDefId: "cryptominer", count: 1 },
    ],
    isBoss: false,
    bonusGold: 7,
    bonusSouls: 5,
    modifiers: [
      { type: "berserk", attackSpeedReduction: 1 },
      { type: "enrage_on_low_hp", hpPercent: 40, attackBonus: 12 },
    ],
  },
  {
    wave: 25,
    name: "🌀 The Singularity",
    enemies: [{ enemyDefId: "singularity_boss", count: 1 }],
    isBoss: true,
    bonusGold: 15,
    bonusSouls: 20,
  },
];

export const WAVE_MAP: Record<number, WaveDef> = Object.fromEntries(
  WAVES.map((w) => [w.wave, w]),
);

export const MAX_WAVE = WAVES.length;
