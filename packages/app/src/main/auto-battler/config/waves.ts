import type { WaveDef } from "../../../shared/auto-battler-types";

export const WAVES: WaveDef[] = [
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
    name: "Ransomware",
    enemies: [{ enemyDefId: "ransomware_boss", count: 1 }],
    isBoss: true,
    bonusGold: 5,
    bonusSouls: 5,
  },
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
    name: "Ransomware II",
    enemies: [
      { enemyDefId: "ransomware_boss", count: 1 },
      { enemyDefId: "ddos_swarm", count: 3 },
    ],
    isBoss: true,
    bonusGold: 6,
    bonusSouls: 7,
  },
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
  },
  {
    wave: 13,
    name: "Phishing Storm",
    enemies: [
      { enemyDefId: "phishing_link", count: 3 },
      { enemyDefId: "sql_injection", count: 2 },
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
  },
  {
    wave: 15,
    name: "Stack Overflow",
    enemies: [{ enemyDefId: "stack_overflow_boss", count: 1 }],
    isBoss: true,
    bonusGold: 10,
    bonusSouls: 15,
  },
];

export const WAVE_MAP: Record<number, WaveDef> = Object.fromEntries(
  WAVES.map((w) => [w.wave, w]),
);

export const MAX_WAVE = WAVES.length;
