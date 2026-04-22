import type { ProgressionNode } from "../../../shared/auto-battler-types";

// Positions are in pixels (top-left of each 80×80 node).
// Layout uses lanes spaced 140px apart, rows spaced 110px.
//
// Tier 0 (row 0): Starter nodes — no prereqs, cheap
// Tier 1 (row 1-2): Early unlocks — unit/relic/synergy basics
// Tier 2 (row 3-4): Mid-game power — economy, synergies, combat stats
// Tier 3 (row 5-6): Late-game defining — board size, dual sockets, T5 access
export const PROGRESSION_NODES: ProgressionNode[] = [
  // ═══════════════════════════════════════════════════════════════
  //  TIER 0 — STARTER (row 0, no prerequisites)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "extra_gold",
    name: "Seed Funding",
    description: "+3 starting gold",
    emoji: "💵",
    category: "stat_boost",
    cost: 5,
    prerequisites: [],
    position: { x: 0, y: 0 },
    effect: { type: "starting_bonus", bonusType: "gold", value: 3 },
  },
  {
    id: "passive_attack_1",
    name: "Sharp Pointers",
    description: "+1 attack to all units",
    emoji: "🔪",
    category: "stat_boost",
    cost: 5,
    prerequisites: [],
    position: { x: 140, y: 0 },
    effect: { type: "permanent_stat", stat: "attack", value: 1 },
  },
  {
    id: "passive_hp_1",
    name: "Buffer Overflow",
    description: "+10 HP to all units",
    emoji: "💪",
    category: "stat_boost",
    cost: 5,
    prerequisites: [],
    position: { x: 280, y: 0 },
    effect: { type: "permanent_stat", stat: "hp", value: 10 },
  },
  {
    id: "unlock_stackoverflow",
    name: "SO Bookmark",
    description: "Adds Stack Overflow Bookmark relic to the pool",
    emoji: "🔖",
    category: "relic_pool",
    cost: 8,
    prerequisites: [],
    position: { x: 420, y: 0 },
    effect: { type: "unlock_relic", relicDefId: "stackoverflow_bookmark" },
  },
  {
    id: "unlock_frontend_syn",
    name: "Frontend Synergy",
    description: "Unlocks the Frontend trait",
    emoji: "🎨",
    category: "synergy",
    cost: 10,
    prerequisites: [],
    position: { x: 560, y: 0 },
    effect: { type: "unlock_synergy", synergyId: "frontend" },
  },
  {
    id: "starting_hp",
    name: "Hardened Stack",
    description: "+10 starting server HP",
    emoji: "❤️",
    category: "stat_boost",
    cost: 8,
    prerequisites: [],
    position: { x: 700, y: 0 },
    effect: { type: "starting_bonus", bonusType: "hp", value: 10 },
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 1 — EARLY (rows 1-2, light prereqs)
  // ═══════════════════════════════════════════════════════════════

  // --- Unit unlocks ---
  {
    id: "unlock_postgres",
    name: "Unlock PostgreSQL",
    description: "Adds PostgreSQL to the unit pool",
    emoji: "🐘",
    category: "unit_pool",
    cost: 12,
    prerequisites: ["extra_gold"],
    position: { x: 0, y: 110 },
    effect: { type: "unlock_unit", unitDefId: "postgresql" },
  },
  {
    id: "unlock_prometheus",
    name: "Unlock Prometheus",
    description: "Adds Prometheus to the unit pool",
    emoji: "🔥",
    category: "unit_pool",
    cost: 12,
    prerequisites: ["passive_hp_1"],
    position: { x: 280, y: 110 },
    effect: { type: "unlock_unit", unitDefId: "prometheus" },
  },

  // --- Passive stat chains ---
  {
    id: "passive_attack_2",
    name: "Sharp Pointers II",
    description: "+1 attack to all units",
    emoji: "🔪",
    category: "stat_boost",
    cost: 8,
    prerequisites: ["passive_attack_1"],
    position: { x: 140, y: 110 },
    effect: { type: "permanent_stat", stat: "attack", value: 1 },
  },
  {
    id: "passive_hp_2",
    name: "Buffer Overflow II",
    description: "+10 HP to all units",
    emoji: "💪",
    category: "stat_boost",
    cost: 8,
    prerequisites: ["passive_hp_1"],
    position: { x: 280, y: 220 },
    effect: { type: "permanent_stat", stat: "hp", value: 10 },
  },

  // --- Relic unlocks ---
  {
    id: "unlock_rubber_duck_debugger",
    name: "Rubber Duck Debugger",
    description: "Adds Rubber Duck Debugger relic (+3 ATK to all)",
    emoji: "🦆",
    category: "relic_pool",
    cost: 15,
    prerequisites: ["unlock_stackoverflow"],
    position: { x: 420, y: 110 },
    effect: { type: "unlock_relic", relicDefId: "rubber_duck_debugger" },
  },
  {
    id: "unlock_hotfix_patch",
    name: "Hotfix Patch",
    description: "Adds Hotfix Patch relic (heal lowest ally at combat start)",
    emoji: "🩹",
    category: "relic_pool",
    cost: 15,
    prerequisites: ["starting_hp"],
    position: { x: 700, y: 110 },
    effect: { type: "unlock_relic", relicDefId: "hotfix_patch" },
  },

  // --- Synergy ---
  {
    id: "unlock_monitoring",
    name: "Monitoring Synergy",
    description: "Unlocks the Monitoring trait",
    emoji: "📊",
    category: "synergy",
    cost: 15,
    prerequisites: ["unlock_prometheus"],
    position: { x: 560, y: 110 },
    effect: { type: "unlock_synergy", synergyId: "monitoring" },
  },

  // --- Economy ---
  {
    id: "devs_crying",
    name: "Devs Crying",
    description: "+2 gold when you lose a combat",
    emoji: "😭",
    category: "stat_boost",
    cost: 12,
    prerequisites: ["extra_gold"],
    position: { x: 0, y: 220 },
    effect: { type: "starting_bonus", bonusType: "loss_gold", value: 2 },
  },
  {
    id: "bigger_bench",
    name: "Bigger Bench",
    description: "+1 bench slot",
    emoji: "🪑",
    category: "mechanic",
    cost: 15,
    prerequisites: ["passive_attack_1"],
    position: { x: 140, y: 220 },
    effect: { type: "starting_bonus", bonusType: "bench_size", value: 1 },
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 2 — MID-GAME (rows 3-4, multiple prereqs)
  // ═══════════════════════════════════════════════════════════════

  // --- Unit unlocks ---
  {
    id: "unlock_jenkins",
    name: "Unlock Jenkins",
    description: "Adds Jenkins to the unit pool",
    emoji: "👴",
    category: "unit_pool",
    cost: 20,
    prerequisites: ["unlock_postgres"],
    position: { x: 0, y: 330 },
    effect: { type: "unlock_unit", unitDefId: "jenkins" },
  },
  {
    id: "unlock_elk_stack",
    name: "Unlock ELK Stack",
    description: "Adds ELK Stack (T4) to the unit pool",
    emoji: "📚",
    category: "unit_pool",
    cost: 25,
    prerequisites: ["unlock_prometheus", "unlock_monitoring"],
    position: { x: 560, y: 220 },
    effect: { type: "unlock_unit", unitDefId: "elk_stack" },
  },

  // --- Passive stat chain (tier 3) ---
  {
    id: "passive_attack_3",
    name: "Sharp Pointers III",
    description: "+1 attack to all units",
    emoji: "🔪",
    category: "stat_boost",
    cost: 12,
    prerequisites: ["passive_attack_2"],
    position: { x: 140, y: 330 },
    effect: { type: "permanent_stat", stat: "attack", value: 1 },
  },
  {
    id: "passive_hp_3",
    name: "Buffer Overflow III",
    description: "+10 HP to all units",
    emoji: "💪",
    category: "stat_boost",
    cost: 12,
    prerequisites: ["passive_hp_2"],
    position: { x: 280, y: 330 },
    effect: { type: "permanent_stat", stat: "hp", value: 10 },
  },

  // --- Economy chain ---
  {
    id: "caffeine_boost",
    name: "Caffeine Boost",
    description: "+2 gold income every round",
    emoji: "☕",
    category: "stat_boost",
    cost: 25,
    prerequisites: ["devs_crying"],
    position: { x: 0, y: 440 },
    effect: { type: "starting_bonus", bonusType: "income", value: 2 },
  },
  {
    id: "hedge_fund_unlock",
    name: "Hedge Fund",
    description: "Adds Hedge Fund relic (+2 interest cap)",
    emoji: "🏦",
    category: "relic_pool",
    cost: 20,
    prerequisites: ["devs_crying"],
    position: { x: 0, y: 330 },
    effect: { type: "unlock_relic", relicDefId: "hedge_fund" },
  },
  {
    id: "hype_train",
    name: "Hype Train",
    description: "+1 gold on win/loss streak bonus",
    emoji: "🚄",
    category: "stat_boost",
    cost: 20,
    prerequisites: ["hedge_fund_unlock"],
    position: { x: 0, y: 550 },
    effect: { type: "starting_bonus", bonusType: "streak_bonus", value: 1 },
  },

  // --- Relic unlocks ---
  {
    id: "unlock_bigger_monitor",
    name: "Bigger Monitor",
    description: "Adds Bigger Monitor relic (+1 shop slot)",
    emoji: "🖥️",
    category: "relic_pool",
    cost: 20,
    prerequisites: ["unlock_rubber_duck_debugger"],
    position: { x: 420, y: 220 },
    effect: { type: "unlock_relic", relicDefId: "bigger_monitor" },
  },
  {
    id: "unlock_load_balancer",
    name: "Load Balancer",
    description: "Adds Load Balancer relic (shield all at combat start)",
    emoji: "⚖️",
    category: "relic_pool",
    cost: 25,
    prerequisites: ["unlock_hotfix_patch"],
    position: { x: 700, y: 220 },
    effect: { type: "unlock_relic", relicDefId: "load_balancer" },
  },
  {
    id: "unlock_pair_programmer",
    name: "Pair Programmer",
    description: "Adds Pair Programmer relic to the pool",
    emoji: "👥",
    category: "relic_pool",
    cost: 25,
    prerequisites: ["unlock_bigger_monitor"],
    position: { x: 420, y: 330 },
    effect: { type: "unlock_relic", relicDefId: "pair_programmer" },
  },

  // --- Synergy ---
  {
    id: "unlock_orchestrator_syn",
    name: "Orchestrator Synergy",
    description: "Unlocks the Orchestrator trait",
    emoji: "🎯",
    category: "synergy",
    cost: 25,
    prerequisites: ["unlock_frontend_syn", "unlock_monitoring"],
    position: { x: 560, y: 330 },
    effect: { type: "unlock_synergy", synergyId: "orchestrator" },
  },

  // --- Warm Cache ---
  {
    id: "passive_mana_start",
    name: "Warm Cache",
    description: "Units start combat with +20% mana",
    emoji: "🔋",
    category: "stat_boost",
    cost: 20,
    prerequisites: ["passive_attack_2", "passive_hp_2"],
    position: { x: 210, y: 440 },
    effect: { type: "permanent_stat", stat: "mana_start_pct", value: 20 },
  },

  // --- Survivability ---
  {
    id: "second_screen",
    name: "Second Screen",
    description: "+1 bench slot",
    emoji: "🖥️",
    category: "mechanic",
    cost: 25,
    prerequisites: ["bigger_bench", "unlock_load_balancer"],
    position: { x: 700, y: 330 },
    effect: { type: "starting_bonus", bonusType: "bench_size", value: 1 },
  },
  {
    id: "starting_shop",
    name: "Bigger Shop",
    description: "+1 shop slot at run start",
    emoji: "🏪",
    category: "mechanic",
    cost: 30,
    prerequisites: ["unlock_bigger_monitor", "caffeine_boost"],
    position: { x: 420, y: 440 },
    effect: { type: "starting_bonus", bonusType: "shop_size", value: 1 },
  },

  // ═══════════════════════════════════════════════════════════════
  //  TIER 3 — LATE-GAME (rows 5-6, deep prereqs, expensive)
  // ═══════════════════════════════════════════════════════════════

  // --- T4/T5 unit unlocks ---
  {
    id: "unlock_redis_cluster",
    name: "Unlock Redis Cluster",
    description: "Adds Redis Cluster (T4) to the unit pool",
    emoji: "🔴",
    category: "unit_pool",
    cost: 30,
    prerequisites: ["unlock_jenkins"],
    position: { x: 0, y: 660 },
    effect: { type: "unlock_unit", unitDefId: "redis_cluster" },
  },
  {
    id: "unlock_datadog",
    name: "Unlock Datadog",
    description: "Adds Datadog (T5) to the unit pool",
    emoji: "🐕",
    category: "unit_pool",
    cost: 50,
    prerequisites: ["unlock_elk_stack", "unlock_orchestrator_syn"],
    position: { x: 560, y: 440 },
    effect: { type: "unlock_unit", unitDefId: "datadog" },
  },

  // --- Economy finishers ---
  {
    id: "hot_reload",
    name: "Hot Reload",
    description: "+1 free reroll at the start of every round",
    emoji: "♻️",
    category: "mechanic",
    cost: 30,
    prerequisites: ["caffeine_boost"],
    position: { x: 0, y: 770 },
    effect: { type: "starting_bonus", bonusType: "free_reroll", value: 1 },
  },
  {
    id: "cheap_laptop",
    name: "Cheap Laptop",
    description: "Reroll cost reduced by 1 gold",
    emoji: "💻",
    category: "mechanic",
    cost: 25,
    prerequisites: ["hot_reload"],
    position: { x: 0, y: 880 },
    effect: { type: "starting_bonus", bonusType: "reroll_cost", value: 1 },
  },
  {
    id: "diversified_portfolio",
    name: "Diversified Portfolio",
    description: "+2 max interest per round",
    emoji: "📈",
    category: "stat_boost",
    cost: 35,
    prerequisites: ["hedge_fund_unlock", "caffeine_boost"],
    position: { x: 140, y: 550 },
    effect: { type: "starting_bonus", bonusType: "interest_cap", value: 2 },
  },

  // --- Powerful relics ---
  {
    id: "unlock_keyboard_of_typing",
    name: "Keyboard of +5 Typing",
    description: "Adds Keyboard of +5 Typing relic (+5 ATK to all)",
    emoji: "⌨️",
    category: "relic_pool",
    cost: 40,
    prerequisites: ["unlock_pair_programmer", "passive_attack_3"],
    position: { x: 420, y: 550 },
    effect: { type: "unlock_relic", relicDefId: "keyboard_of_typing" },
  },
  {
    id: "unlock_copilot",
    name: "GitHub Copilot",
    description: "Legendary relic that damages all enemies at combat start",
    emoji: "🤖",
    category: "relic_pool",
    cost: 60,
    prerequisites: ["unlock_keyboard_of_typing", "unlock_orchestrator_syn"],
    position: { x: 560, y: 550 },
    effect: { type: "unlock_relic", relicDefId: "github_copilot" },
  },

  // --- GAME-DEFINING MECHANICS (deepest in the tree) ---
  {
    id: "mechanic_early_t5",
    name: "Bleeding Edge",
    description: "Shop tier odds are shifted by +5 waves",
    emoji: "🚀",
    category: "mechanic",
    cost: 40,
    prerequisites: ["caffeine_boost", "starting_shop"],
    position: { x: 280, y: 660 },
    effect: { type: "unlock_mechanic", mechanicId: "early_t5" },
  },
  {
    id: "mechanic_extra_board_row",
    name: "Horizontal Scaling",
    description: "Board grows from 2×4 to 3×4 slots",
    emoji: "📐",
    category: "mechanic",
    cost: 75,
    prerequisites: ["second_screen", "passive_mana_start", "unlock_orchestrator_syn"],
    position: { x: 700, y: 550 },
    effect: { type: "unlock_mechanic", mechanicId: "extra_board_row" },
  },
  {
    id: "mechanic_relic_socket_2",
    name: "Dual Sockets",
    description: "Units can equip 2 relics instead of 1",
    emoji: "💎",
    category: "mechanic",
    cost: 60,
    prerequisites: ["unlock_keyboard_of_typing", "second_screen"],
    position: { x: 700, y: 660 },
    effect: { type: "unlock_mechanic", mechanicId: "relic_socket_2" },
  },
];

export const PROGRESSION_MAP: Record<string, ProgressionNode> =
  Object.fromEntries(PROGRESSION_NODES.map((n) => [n.id, n]));

// Default unlocked synergies (available before any progression purchase)
export const DEFAULT_UNLOCKED_SYNERGIES: string[] = [
  "infrastructure",
  "database",
  "cache",
  "ci",
  "observability",
  "testing",
  "security",
];
