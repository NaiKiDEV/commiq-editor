import type {
  ActiveSynergy,
  AbilityEffect,
  AbilityTargetType,
  CombatEvent,
  CombatResult,
  CombatSnapshot,
  CombatantSide,
  CombatantSnapshot,
  EnemyDef,
  PlacedUnit,
  RelicDef,
  StarLevel,
  SynergyBonus,
  TargetingAI,
  UnitAbilityDef,
  UnitDef,
  UnitStats,
  WaveDef,
} from "../../shared/auto-battler-types";
import { UNIT_MAP } from "./config/units";
import { ENEMY_MAP } from "./config/enemies";
import { RELIC_MAP } from "./config/relics";
import { SYNERGY_MAP } from "./config/synergies";
import {
  MAX_COMBAT_TICKS,
  WAVE_SOUL_MULTIPLIER,
  damageFromLostCombat,
} from "./config/balance";
import { Rng } from "./rng";

// ─────────── Internal combatant state ───────────

type Combatant = {
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
  manaPerAttack: number;
  attack: number;
  attackSpeed: number;
  range: number;
  defense: number;
  shield: number;
  shieldTicksLeft: number;
  stunTicksLeft: number;
  attackCooldown: number;
  targeting: TargetingAI;
  ability: UnitAbilityDef | null;
  buffs: Array<{ stat: string; value: number; ticksLeft: number }>;
  dots: Array<{ damagePerTick: number; ticksLeft: number }>;
  equippedRelicId: string | null;
};

function starMult(base: number, mult: number, starLevel: StarLevel): number {
  // 1★ = base, 2★ = base * mult, 3★ = base * mult^2
  return Math.round(base * Math.pow(mult, starLevel - 1));
}

function buildFromPlaced(unit: PlacedUnit): Combatant {
  const def: UnitDef = UNIT_MAP[unit.unitDefId];
  const stats: UnitStats = def.baseStats;
  const hp = starMult(stats.hp, def.starScaling.hpMult, unit.starLevel);
  const attack = starMult(
    stats.attack,
    def.starScaling.attackMult,
    unit.starLevel,
  );
  return {
    instanceId: unit.instanceId,
    side: "player",
    unitDefId: unit.unitDefId,
    emoji: def.emoji,
    name: def.name,
    starLevel: unit.starLevel,
    row: unit.position.row,
    col: unit.position.col,
    hp,
    maxHp: hp,
    mana: 0,
    maxMana: stats.mana,
    manaPerAttack: stats.manaPerAttack,
    attack,
    attackSpeed: stats.attackSpeed,
    range: stats.range,
    defense: stats.defense,
    shield: 0,
    shieldTicksLeft: 0,
    stunTicksLeft: 0,
    attackCooldown: stats.attackSpeed,
    targeting: def.targeting,
    ability: def.ability,
    buffs: [],
    dots: [],
    equippedRelicId: unit.equippedRelicId,
  };
}

function buildEnemyCombatant(
  enemy: EnemyDef,
  instanceId: string,
  row: number,
  col: number,
): Combatant {
  return {
    instanceId,
    side: "enemy",
    unitDefId: enemy.id,
    emoji: enemy.emoji,
    name: enemy.name,
    starLevel: 1,
    row,
    col,
    hp: enemy.stats.hp,
    maxHp: enemy.stats.hp,
    mana: 0,
    maxMana: enemy.stats.mana,
    manaPerAttack: enemy.stats.manaPerAttack,
    attack: enemy.stats.attack,
    attackSpeed: enemy.stats.attackSpeed,
    range: enemy.stats.range,
    defense: enemy.stats.defense,
    shield: 0,
    shieldTicksLeft: 0,
    stunTicksLeft: 0,
    attackCooldown: enemy.stats.attackSpeed,
    targeting: enemy.targeting,
    ability: enemy.ability,
    buffs: [],
    dots: [],
    equippedRelicId: null,
  };
}

function applyRelicStat(combatant: Combatant, relic: RelicDef): void {
  if (relic.effect.type !== "stat_boost") return;
  const { stat, value } = relic.effect;
  switch (stat) {
    case "attack":
      combatant.attack += value;
      break;
    case "hp":
      combatant.hp += value;
      combatant.maxHp += value;
      break;
    case "defense":
      combatant.defense += value;
      break;
    case "attackSpeed":
      combatant.attackSpeed = Math.max(1, combatant.attackSpeed + value);
      combatant.attackCooldown = combatant.attackSpeed;
      break;
    case "manaPerAttack":
      combatant.manaPerAttack += value;
      break;
  }
}

function applySynergyBonus(
  combatants: Combatant[],
  def: ReturnType<typeof SYNERGY_MAP>[string],
  bonus: SynergyBonus,
  events: CombatEvent[],
): void {
  if (bonus.type === "stat_boost") {
    for (const c of combatants) {
      if (c.side !== "player") continue;
      const unitDef = UNIT_MAP[c.unitDefId];
      if (!unitDef) continue;
      if (bonus.target === "trait_units" && !unitDef.traits.includes(def.trait)) {
        continue;
      }
      switch (bonus.stat) {
        case "attack":
          c.attack += bonus.value;
          break;
        case "hp":
          c.hp += bonus.value;
          c.maxHp += bonus.value;
          break;
        case "defense":
          c.defense += bonus.value;
          break;
        case "attackSpeed":
          c.attackSpeed = Math.max(1, c.attackSpeed + bonus.value);
          c.attackCooldown = c.attackSpeed;
          break;
        case "manaPerAttack":
          c.manaPerAttack += bonus.value;
          break;
      }
    }
    events.push({
      type: "synergy_proc",
      synergyId: def.id,
      description: `${def.name}: ${bonus.stat} ${bonus.value >= 0 ? "+" : ""}${bonus.value}`,
    });
  } else if (bonus.type === "on_combat_start") {
    events.push({
      type: "synergy_proc",
      synergyId: def.id,
      description: `${def.name}: combat-start effect`,
    });
    // Applied once at combat start; damage/heal handled below
    for (const c of combatants) {
      if (c.side !== "player") continue;
      const unitDef = UNIT_MAP[c.unitDefId];
      if (!unitDef) continue;
      if (bonus.target === "trait_units" && !unitDef.traits.includes(def.trait)) {
        continue;
      }
      // Apply the effect to all enemies if damage, to self if heal
      if (bonus.effect.type === "damage") {
        // Damages all enemies by the value (simple interpretation)
        for (const enemy of combatants) {
          if (enemy.side !== "enemy" || enemy.hp <= 0) continue;
          const dmg = Math.max(1, bonus.effect.value - enemy.defense);
          applyDamage(enemy, dmg, events, c.instanceId);
        }
      } else if (bonus.effect.type === "heal") {
        c.hp = Math.min(c.maxHp, c.hp + bonus.effect.value);
        events.push({
          type: "heal",
          targetId: c.instanceId,
          sourceId: c.instanceId,
          value: bonus.effect.value,
        });
      }
    }
  }
}

function applyDamage(
  target: Combatant,
  rawDamage: number,
  events: CombatEvent[],
  sourceId: string,
): void {
  let remaining = Math.max(0, rawDamage);
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;
  if (target.hp <= 0) {
    target.hp = 0;
    events.push({ type: "death", unitId: target.instanceId, killerSourceId: sourceId });
  }
}

function anyAlive(combatants: readonly Combatant[], side: CombatantSide): boolean {
  for (const c of combatants) {
    if (c.side === side && c.hp > 0) return true;
  }
  return false;
}

function aliveOnSide(
  combatants: readonly Combatant[],
  side: CombatantSide,
): Combatant[] {
  return combatants.filter((c) => c.side === side && c.hp > 0);
}

function distance(a: Combatant, b: Combatant): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function selectTarget(
  attacker: Combatant,
  enemies: Combatant[],
  rng: Rng,
): Combatant | null {
  if (enemies.length === 0) return null;
  switch (attacker.targeting) {
    case "nearest": {
      let best = enemies[0];
      let bestDist = distance(attacker, best);
      for (const e of enemies) {
        const d = distance(attacker, e);
        if (d < bestDist) {
          best = e;
          bestDist = d;
        }
      }
      return best;
    }
    case "lowest_hp":
      return enemies.reduce((a, b) => (a.hp < b.hp ? a : b));
    case "highest_attack":
      return enemies.reduce((a, b) => (a.attack > b.attack ? a : b));
    case "random":
      return rng.pick(enemies);
    case "backline_first": {
      const back = enemies.filter((e) => e.row === (attacker.side === "player" ? 0 : 1));
      const pool = back.length > 0 ? back : enemies;
      let best = pool[0];
      let bestDist = distance(attacker, best);
      for (const e of pool) {
        const d = distance(attacker, e);
        if (d < bestDist) {
          best = e;
          bestDist = d;
        }
      }
      return best;
    }
  }
}

function resolveAbilityTargets(
  caster: Combatant,
  targetType: AbilityTargetType,
  combatants: Combatant[],
  rng: Rng,
): Combatant[] {
  const enemySide: CombatantSide = caster.side === "player" ? "enemy" : "player";
  const allies = aliveOnSide(combatants, caster.side);
  const enemies = aliveOnSide(combatants, enemySide);
  switch (targetType) {
    case "self":
      return [caster];
    case "aoe_all":
      return enemies;
    case "aoe_row": {
      if (enemies.length === 0) return [];
      // Pick a target first, then hit everyone in their row
      const focus = selectTarget(caster, enemies, rng);
      if (!focus) return [];
      return enemies.filter((e) => e.row === focus.row);
    }
    case "ally_lowest_hp": {
      if (allies.length === 0) return [];
      return [allies.reduce((a, b) => (a.hp < b.hp ? a : b))];
    }
    case "nearest":
    case "lowest_hp":
    case "highest_attack": {
      const faux: Combatant = { ...caster, targeting: targetType as TargetingAI };
      const t = selectTarget(faux, enemies, rng);
      return t ? [t] : [];
    }
  }
}

function castAbility(
  caster: Combatant,
  combatants: Combatant[],
  events: CombatEvent[],
  rng: Rng,
): void {
  const ability = caster.ability;
  if (!ability) return;
  const targets = resolveAbilityTargets(
    caster,
    ability.targetType,
    combatants,
    rng,
  );
  if (targets.length === 0) return;
  const starMultiplier =
    caster.side === "player"
      ? Math.pow(UNIT_MAP[caster.unitDefId]?.starScaling.abilityMult ?? 1, caster.starLevel - 1)
      : 1;

  const resolvedEffects: { description: string; value: number }[] = [];
  for (const effect of ability.effects) {
    applyEffect(caster, targets, effect, starMultiplier, events, resolvedEffects, rng);
  }

  events.push({
    type: "ability",
    sourceId: caster.instanceId,
    abilityId: ability.id,
    targets: targets.map((t) => t.instanceId),
    effects: resolvedEffects,
  });

  caster.mana = 0;

  // Relic on_ability_cast
  if (caster.equippedRelicId) {
    const relic = RELIC_MAP[caster.equippedRelicId];
    if (relic && relic.effect.type === "on_ability_cast") {
      applyEffect(caster, [caster], relic.effect.effect, 1, events, [], rng);
      events.push({
        type: "relic_proc",
        relicId: relic.id,
        description: relic.name,
      });
    }
  }
}

function applyEffect(
  caster: Combatant,
  targets: Combatant[],
  effect: AbilityEffect,
  starMultiplier: number,
  events: CombatEvent[],
  resolved: { description: string; value: number }[],
  rng: Rng,
): void {
  switch (effect.type) {
    case "damage": {
      const base = effect.value * (effect.scaling ?? 1) * starMultiplier;
      for (const t of targets) {
        const dmg = Math.max(1, Math.round(base) - t.defense);
        applyDamage(t, dmg, events, caster.instanceId);
      }
      resolved.push({ description: "damage", value: Math.round(base) });
      break;
    }
    case "heal": {
      const amt = Math.round(effect.value * (effect.scaling ?? 1) * starMultiplier);
      for (const t of targets) {
        t.hp = Math.min(t.maxHp, t.hp + amt);
        events.push({
          type: "heal",
          targetId: t.instanceId,
          sourceId: caster.instanceId,
          value: amt,
        });
      }
      resolved.push({ description: "heal", value: amt });
      break;
    }
    case "shield": {
      for (const t of targets) {
        t.shield = Math.max(t.shield, effect.value);
        t.shieldTicksLeft = Math.max(t.shieldTicksLeft, effect.duration);
        events.push({
          type: "shield",
          targetId: t.instanceId,
          value: effect.value,
        });
      }
      resolved.push({ description: "shield", value: effect.value });
      break;
    }
    case "buff": {
      for (const t of targets) {
        t.buffs.push({
          stat: effect.stat,
          value: effect.value,
          ticksLeft: effect.duration,
        });
        if (effect.stat === "attack") t.attack += effect.value;
        else if (effect.stat === "defense") t.defense += effect.value;
        events.push({
          type: "buff_applied",
          targetId: t.instanceId,
          stat: effect.stat,
          value: effect.value,
          duration: effect.duration,
        });
      }
      resolved.push({ description: `buff ${effect.stat}`, value: effect.value });
      break;
    }
    case "debuff": {
      for (const t of targets) {
        t.buffs.push({
          stat: effect.stat,
          value: -effect.value,
          ticksLeft: effect.duration,
        });
        if (effect.stat === "attack") t.attack = Math.max(0, t.attack - effect.value);
        else if (effect.stat === "defense")
          t.defense = Math.max(0, t.defense - effect.value);
        events.push({
          type: "debuff_applied",
          targetId: t.instanceId,
          stat: effect.stat,
          value: effect.value,
          duration: effect.duration,
        });
      }
      resolved.push({
        description: `debuff ${effect.stat}`,
        value: -effect.value,
      });
      break;
    }
    case "stun": {
      for (const t of targets) {
        if (rng.chance(effect.chance)) {
          t.stunTicksLeft = Math.max(t.stunTicksLeft, effect.duration);
        }
      }
      resolved.push({ description: "stun", value: effect.duration });
      break;
    }
    case "dot": {
      for (const t of targets) {
        t.dots.push({
          damagePerTick: effect.damagePerTick,
          ticksLeft: effect.duration,
        });
      }
      resolved.push({ description: "dot", value: effect.damagePerTick });
      break;
    }
    case "summon": {
      // MVP: log but don't actually spawn. Could be expanded later.
      events.push({
        type: "summon",
        sourceId: caster.instanceId,
        unitDefId: effect.unitDefId,
      });
      resolved.push({ description: "summon", value: effect.count });
      break;
    }
  }
}

function tickStatusEffects(c: Combatant, events: CombatEvent[]): void {
  // Shield decay
  if (c.shieldTicksLeft > 0) {
    c.shieldTicksLeft--;
    if (c.shieldTicksLeft === 0) c.shield = 0;
  }
  // Stun
  if (c.stunTicksLeft > 0) c.stunTicksLeft--;

  // DoTs
  c.dots = c.dots.filter((d) => {
    c.hp -= d.damagePerTick;
    d.ticksLeft--;
    if (c.hp <= 0) {
      c.hp = 0;
      events.push({
        type: "death",
        unitId: c.instanceId,
        killerSourceId: "dot",
      });
    }
    return d.ticksLeft > 0;
  });

  // Expire buffs
  c.buffs = c.buffs.filter((b) => {
    b.ticksLeft--;
    if (b.ticksLeft <= 0) {
      // Revert buff
      if (b.stat === "attack") c.attack -= b.value;
      else if (b.stat === "defense") c.defense -= b.value;
      return false;
    }
    return true;
  });
}

function snapshotCombatants(
  combatants: readonly Combatant[],
): CombatantSnapshot[] {
  return combatants.map((c) => ({
    instanceId: c.instanceId,
    side: c.side,
    unitDefId: c.unitDefId,
    emoji: c.emoji,
    name: c.name,
    starLevel: c.starLevel,
    row: c.row,
    col: c.col,
    hp: c.hp,
    maxHp: c.maxHp,
    mana: c.mana,
    maxMana: c.maxMana,
    shield: c.shield,
    stunned: c.stunTicksLeft > 0,
    alive: c.hp > 0,
  }));
}

// Place enemies on a virtual grid (back row = row 0 for enemy, front row = row 1)
function placeEnemies(wave: WaveDef, rng: Rng): Combatant[] {
  const enemies: Combatant[] = [];
  let instance = 0;
  let col = 0;
  let row = 1; // enemies deploy front row first
  for (const group of wave.enemies) {
    const enemy = ENEMY_MAP[group.enemyDefId];
    if (!enemy) continue;
    for (let i = 0; i < group.count; i++) {
      const id = `enemy-${wave.wave}-${instance++}`;
      if (enemy.isBoss) {
        enemies.push(buildEnemyCombatant(enemy, id, 1, 1));
        continue;
      }
      enemies.push(buildEnemyCombatant(enemy, id, row, col));
      col++;
      if (col >= 4) {
        col = 0;
        row = row === 1 ? 0 : 1;
      }
    }
  }
  return enemies;
}

// ─────────── Public API ───────────

export function simulateCombat(
  playerUnits: PlacedUnit[],
  wave: WaveDef,
  synergies: ActiveSynergy[],
  globalRelicIds: string[],
  rng: Rng,
): CombatResult {
  const combatants: Combatant[] = [];

  // Build player combatants
  for (const pu of playerUnits) {
    const def = UNIT_MAP[pu.unitDefId];
    if (!def) continue;
    const c = buildFromPlaced(pu);
    // Apply equipped relic (unit-scoped stat only)
    if (pu.equippedRelicId) {
      const relic = RELIC_MAP[pu.equippedRelicId];
      if (relic && relic.type === "unit") applyRelicStat(c, relic);
    }
    combatants.push(c);
  }

  const enemyCombatants = placeEnemies(wave, rng);
  combatants.push(...enemyCombatants);

  const snapshots: CombatSnapshot[] = [];
  const tickEvents: CombatEvent[] = [];

  // ── on_combat_start — synergies
  for (const s of synergies) {
    const def = SYNERGY_MAP[s.synergyId];
    if (!def) continue;
    const threshold = def.thresholds.find((t) => t.count === s.activeThreshold);
    if (!threshold) continue;
    applySynergyBonus(combatants, def, threshold.bonus, tickEvents);
  }

  // ── on_combat_start — global relics
  for (const id of globalRelicIds) {
    const relic = RELIC_MAP[id];
    if (!relic || relic.type !== "global") continue;
    if (relic.effect.type === "on_combat_start") {
      const effect = relic.effect.effect;
      if (effect.type === "heal") {
        for (const c of combatants) {
          if (c.side !== "player") continue;
          c.hp = Math.min(c.maxHp, c.hp + effect.value);
          tickEvents.push({
            type: "heal",
            targetId: c.instanceId,
            sourceId: "relic",
            value: effect.value,
          });
        }
      } else if (effect.type === "damage") {
        for (const c of combatants) {
          if (c.side !== "enemy") continue;
          const dmg = Math.max(1, effect.value - c.defense);
          applyDamage(c, dmg, tickEvents, "relic");
        }
      }
      tickEvents.push({
        type: "relic_proc",
        relicId: relic.id,
        description: relic.name,
      });
    }
  }

  // Tick 0 snapshot
  snapshots.push({
    tick: 0,
    combatants: snapshotCombatants(combatants),
    events: tickEvents.splice(0),
  });

  // ── Main tick loop
  let tick = 0;
  while (
    tick < MAX_COMBAT_TICKS &&
    anyAlive(combatants, "player") &&
    anyAlive(combatants, "enemy")
  ) {
    tick++;
    const events: CombatEvent[] = [];

    // Status effects (shield/stun/dots/buff decay)
    for (const c of combatants) {
      if (c.hp <= 0) continue;
      tickStatusEffects(c, events);
    }

    // Actions
    for (const c of combatants) {
      if (c.hp <= 0 || c.stunTicksLeft > 0) continue;

      // Ability fires when full mana
      if (c.ability && c.mana >= c.maxMana) {
        castAbility(c, combatants, events, rng);
        continue;
      }

      // Attack cooldown
      c.attackCooldown--;
      if (c.attackCooldown > 0) continue;
      c.attackCooldown = c.attackSpeed;

      const enemySide: CombatantSide = c.side === "player" ? "enemy" : "player";
      const enemies = aliveOnSide(combatants, enemySide);
      const target = selectTarget(c, enemies, rng);
      if (!target) continue;

      const dmg = Math.max(1, c.attack - target.defense);
      const hpBefore = target.hp;
      applyDamage(target, dmg, events, c.instanceId);
      events.push({
        type: "attack",
        sourceId: c.instanceId,
        targetId: target.instanceId,
        damage: dmg,
      });
      c.mana = Math.min(c.maxMana, c.mana + c.manaPerAttack);

      // On-kill synergies
      if (hpBefore > 0 && target.hp <= 0) {
        for (const s of synergies) {
          const def = SYNERGY_MAP[s.synergyId];
          if (!def) continue;
          const threshold = def.thresholds.find(
            (t) => t.count === s.activeThreshold,
          );
          if (!threshold || threshold.bonus.type !== "on_kill") continue;
          if (c.side !== "player") continue;
          const effect = threshold.bonus.effect;
          if (effect.type === "heal") {
            const allies = aliveOnSide(combatants, "player");
            if (allies.length > 0) {
              const ally = allies.reduce((a, b) => (a.hp < b.hp ? a : b));
              ally.hp = Math.min(ally.maxHp, ally.hp + effect.value);
              events.push({
                type: "heal",
                targetId: ally.instanceId,
                sourceId: c.instanceId,
                value: effect.value,
              });
            }
          }
        }
      }
    }

    snapshots.push({
      tick,
      combatants: snapshotCombatants(combatants),
      events,
    });
  }

  const playerAlive = anyAlive(combatants, "player");
  const enemyAlive = anyAlive(combatants, "enemy");
  const winner: CombatantSide | "draw" =
    playerAlive && !enemyAlive
      ? "player"
      : enemyAlive && !playerAlive
      ? "enemy"
      : "draw";

  const rawSouls =
    winner === "player"
      ? combatants
          .filter((c) => c.side === "enemy")
          .reduce((sum, c) => sum + (ENEMY_MAP[c.unitDefId]?.soulValue ?? 0), 0) +
        wave.bonusSouls
      : Math.floor(wave.bonusSouls / 2);
  const soulsEarned = Math.floor(rawSouls * WAVE_SOUL_MULTIPLIER);

  const goldEarned =
    winner === "player" ? wave.bonusGold : 0;

  const damageToServer =
    winner === "player" ? 0 : damageFromLostCombat(wave.wave);

  return {
    snapshots,
    winner,
    damageToServer,
    goldEarned,
    soulsEarned,
  };
}
