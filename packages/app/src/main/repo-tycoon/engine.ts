import type {
  ActiveEvent,
  EffectKind,
  RepoTycoonAction,
  RepoTycoonState,
  ResourceId,
} from "../../shared/repo-tycoon-types";
import {
  BASE_EVENT_CHANCE_PER_ROLL,
  BASE_LOC_PER_SEC,
  COMMIT_THRESHOLD,
  EVENT_ROLL_INTERVAL_SEC,
  MANUAL_COMMIT_LOC,
  MAX_OFFLINE_SEC,
  PRESTIGE_BASE_SPONSORS,
  PRESTIGE_SPONSORS_BONUS_CAP,
  PRESTIGE_SPONSORS_PER_200K,
  PR_THRESHOLD,
  SAVE_VERSION,
  STARS_PER_PR,
} from "./config/balance";
import { EVENT_MAP, EVENTS } from "./config/events";
import { MILESTONES } from "./config/milestones";
import { PRESTIGE_UPGRADE_MAP } from "./config/prestige-upgrades";
import { UPGRADE_MAP, UPGRADES } from "./config/upgrades";
import { Rng, createSeed } from "./rng";

// ─────────── Initial state ───────────

export function createInitialState(): RepoTycoonState {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    resources: {
      loc: 0,
      commits: 0,
      prs: 0,
      stars: 0,
      contributors: 0,
      sponsors: 0,
    },
    lifetimeResources: {
      loc: 0,
      commits: 0,
      prs: 0,
      stars: 0,
      contributors: 0,
      sponsors: 0,
    },
    upgrades: {},
    prestigeLevel: 0,
    prestigeUpgrades: {},
    crystals: 0,
    milestonesUnlocked: [],
    activeEvents: [],
    lastTickAt: now,
    lastEventRollAt: now,
    rngSeed: createSeed(),
    stats: {
      totalTicks: 0,
      totalManualCommits: 0,
      runStart: now,
      lifetimeLoc: 0,
    },
    settings: {
      autoSave: true,
      reducedMotion: false,
    },
  };
}

// ─────────── Effect aggregation ───────────

type EffectContext = {
  locMult: number;
  locFlatPerSec: number;
  /** commits-to-prs threshold divisor (>1 = cheaper PRs) */
  commitToPrThresholdDiv: number;
  /** prs-to-stars ratio multiplier */
  prToStarsMult: number;
  eventChanceMult: number;
};

function emptyContext(): EffectContext {
  return {
    locMult: 1,
    locFlatPerSec: 0,
    commitToPrThresholdDiv: 1,
    prToStarsMult: 1,
    eventChanceMult: 1,
  };
}

function applyEffectToContext(ctx: EffectContext, e: EffectKind): void {
  switch (e.type) {
    case "tick_rate_mult":
      if (e.resource === "loc") ctx.locMult *= e.mult;
      break;
    case "flat_add_per_sec":
      if (e.resource === "loc") ctx.locFlatPerSec += e.amount;
      break;
    case "conversion_threshold_div":
      if (e.from === "commits" && e.to === "prs") {
        ctx.commitToPrThresholdDiv *= e.div;
      }
      break;
    case "conversion_ratio_mult":
      if (e.from === "prs" && e.to === "stars") {
        ctx.prToStarsMult *= e.mult;
      }
      break;
    case "event_chance_mult":
      ctx.eventChanceMult *= e.mult;
      break;
    case "grant_resource":
      // Instant grants are applied elsewhere (on purchase/milestone/event).
      break;
    case "prestige_start_grant":
      // Applied once at run-start after Rewrite in Rust; no-op during ticks.
      break;
  }
}

function computeContext(state: RepoTycoonState, now: number): EffectContext {
  const ctx = emptyContext();

  // Upgrades
  for (const up of UPGRADES) {
    const ownedLevel = state.upgrades[up.id] ?? 0;
    for (const tier of up.tiers) {
      if (tier.level <= ownedLevel) {
        for (const e of tier.effects) applyEffectToContext(ctx, e);
      }
    }
  }

  // Milestone rewards that are ongoing (event_chance_mult, etc.)
  for (const milestoneId of state.milestonesUnlocked) {
    const m = MILESTONES.find((x) => x.id === milestoneId);
    if (!m?.rewards) continue;
    for (const e of m.rewards) {
      // Skip one-shot grants (already applied on unlock)
      if (e.type === "grant_resource") continue;
      applyEffectToContext(ctx, e);
    }
  }

  // Active events (temporary effects)
  for (const ev of state.activeEvents) {
    if (ev.endsAt <= now) continue;
    const def = EVENT_MAP[ev.id];
    if (!def?.durationSec) continue;
    for (const e of def.effects) applyEffectToContext(ctx, e);
  }

  // Contributor multiplier: each contributor adds +2% LoC rate.
  const contributors = state.resources.contributors;
  if (contributors > 0) {
    ctx.locMult *= 1 + contributors * 0.02;
  }

  // Prestige upgrades — permanent cross-run production boosts.
  for (const upId of Object.keys(state.prestigeUpgrades)) {
    const def = PRESTIGE_UPGRADE_MAP[upId];
    if (!def) continue;
    for (const e of def.effects) {
      // prestige_start_grant fires at run-start only, not during ticks.
      if (e.type !== "prestige_start_grant") {
        applyEffectToContext(ctx, e);
      }
    }
  }

  return ctx;
}

// ─────────── Resource math ───────────

function addResource(
  state: RepoTycoonState,
  id: ResourceId,
  amount: number,
): RepoTycoonState {
  if (amount === 0) return state;
  return {
    ...state,
    resources: {
      ...state.resources,
      [id]: state.resources[id] + amount,
    },
    lifetimeResources: {
      ...state.lifetimeResources,
      [id]: state.lifetimeResources[id] + Math.max(0, amount),
    },
  };
}

function applyInstantEffects(
  state: RepoTycoonState,
  effects: EffectKind[],
): RepoTycoonState {
  let next = state;
  for (const e of effects) {
    if (e.type === "grant_resource") {
      next = addResource(next, e.resource, e.amount);
    }
  }
  return next;
}

// ─────────── Tick advance ───────────

function advanceProduction(
  state: RepoTycoonState,
  dt: number,
  now: number,
): RepoTycoonState {
  if (dt <= 0) return state;
  const ctx = computeContext(state, now);

  const locRate = BASE_LOC_PER_SEC * ctx.locMult + ctx.locFlatPerSec;
  const locGained = locRate * dt;

  let loc = state.resources.loc + locGained;
  let commits = state.resources.commits;
  let prs = state.resources.prs;
  let stars = state.resources.stars;

  // LoC → commits
  const commitThreshold = COMMIT_THRESHOLD;
  let newCommits = 0;
  if (loc >= commitThreshold) {
    newCommits = Math.floor(loc / commitThreshold);
    loc -= newCommits * commitThreshold;
    commits += newCommits;
  }

  // commits → PRs
  const prThreshold = Math.max(1, PR_THRESHOLD / ctx.commitToPrThresholdDiv);
  let newPrs = 0;
  if (commits >= prThreshold) {
    newPrs = Math.floor(commits / prThreshold);
    commits -= newPrs * prThreshold;
    prs += newPrs;
  }

  // PRs → stars (only convert PRs that existed at the START of this tick).
  // Freshly-minted PRs are left on the counter so checkMilestones can see them
  // on this same tick before they get consumed on the next one.
  const initialPrs = state.resources.prs;
  let newStars = 0;
  if (initialPrs >= 1) {
    const producedPrs = Math.floor(initialPrs);
    prs -= producedPrs;
    newStars = producedPrs * STARS_PER_PR * ctx.prToStarsMult;
    stars += newStars;
  }

  return {
    ...state,
    resources: {
      ...state.resources,
      loc,
      commits,
      prs,
      stars,
    },
    lifetimeResources: {
      ...state.lifetimeResources,
      loc: state.lifetimeResources.loc + locGained,
      commits: state.lifetimeResources.commits + newCommits,
      prs: state.lifetimeResources.prs + newPrs,
      stars: state.lifetimeResources.stars + newStars,
    },
    stats: {
      ...state.stats,
      totalTicks: state.stats.totalTicks + 1,
      lifetimeLoc: state.stats.lifetimeLoc + locGained,
    },
  };
}

// ─────────── Milestones ───────────

function checkMilestones(state: RepoTycoonState): RepoTycoonState {
  let next = state;
  const already = new Set(next.milestonesUnlocked);

  for (const m of MILESTONES) {
    if (already.has(m.id)) continue;
    // Use lifetime totals so milestones don't break when consumed resources
    // (commits, prs, stars) are drained by the pipeline or upgrade purchases.
    const haveAmount = next.lifetimeResources[m.requires.resource];
    if (haveAmount < m.requires.amount) continue;

    next = {
      ...next,
      milestonesUnlocked: [...next.milestonesUnlocked, m.id],
    };
    if (m.rewards) next = applyInstantEffects(next, m.rewards);
    already.add(m.id);
  }

  return next;
}

// ─────────── Events ───────────

function pruneExpiredEvents(
  state: RepoTycoonState,
  now: number,
): RepoTycoonState {
  const kept = state.activeEvents.filter((e) => e.endsAt > now);
  if (kept.length === state.activeEvents.length) return state;
  return { ...state, activeEvents: kept };
}

function maybeRollEvent(
  state: RepoTycoonState,
  now: number,
): RepoTycoonState {
  const elapsed = (now - state.lastEventRollAt) / 1000;
  if (elapsed < EVENT_ROLL_INTERVAL_SEC) return state;

  const ctx = computeContext(state, now);
  const rng = new Rng(state.rngSeed);

  let next: RepoTycoonState = { ...state, lastEventRollAt: now };

  const chance = BASE_EVENT_CHANCE_PER_ROLL * ctx.eventChanceMult;
  if (!rng.chance(chance)) {
    return { ...next, rngSeed: rng.getState() };
  }

  const weights = EVENTS.map((e) => e.weight);
  const idx = rng.weightedIndex(weights);
  const evDef = EVENTS[idx];
  if (!evDef) return { ...next, rngSeed: rng.getState() };

  // Apply instant grant effects now
  next = applyInstantEffects(next, evDef.effects);

  // Persistent (durational) events go on activeEvents
  if (evDef.durationSec) {
    const active: ActiveEvent = {
      id: evDef.id,
      startedAt: now,
      endsAt: now + evDef.durationSec * 1000,
    };
    next = { ...next, activeEvents: [...next.activeEvents, active] };
  }

  return { ...next, rngSeed: rng.getState() };
}

// ─────────── Upgrade purchase ───────────

function tryBuyUpgrade(
  state: RepoTycoonState,
  upgradeId: string,
): RepoTycoonState {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return state;

  const ownedLevel = state.upgrades[upgradeId] ?? 0;
  const nextTier = def.tiers.find((t) => t.level === ownedLevel + 1);
  if (!nextTier) return state;

  const haveAmount = state.resources[nextTier.cost.resource];
  if (haveAmount < nextTier.cost.amount) return state;

  let next: RepoTycoonState = {
    ...state,
    resources: {
      ...state.resources,
      [nextTier.cost.resource]:
        haveAmount - nextTier.cost.amount,
    },
    upgrades: {
      ...state.upgrades,
      [upgradeId]: nextTier.level,
    },
  };

  next = applyInstantEffects(next, nextTier.effects);
  next = checkMilestones(next);
  return next;
}

// ─────────── Prestige ───────────

function handlePrestige(state: RepoTycoonState): RepoTycoonState {
  // Only available once the Unicorn milestone is unlocked.
  if (!state.milestonesUnlocked.includes("unicorn")) return state;

  // Crystals earned from this run: flat base + scaling on peak stars.
  // These are the ONLY source of crystals — in-run sponsors cannot buy prestige upgrades.
  const peakStars = state.lifetimeResources.stars;
  const scalingBonus = Math.min(
    PRESTIGE_SPONSORS_BONUS_CAP,
    Math.floor((peakStars * PRESTIGE_SPONSORS_PER_200K) / 200_000),
  );
  const earnedCrystals = PRESTIGE_BASE_SPONSORS + scalingBonus;

  // Start fresh, preserving only prestige-persistent data.
  const fresh = createInitialState();
  let next: RepoTycoonState = {
    ...fresh,
    prestigeLevel: state.prestigeLevel + 1,
    prestigeUpgrades: state.prestigeUpgrades,
    crystals: (state.crystals ?? 0) + earnedCrystals,
    resources: {
      ...fresh.resources,
      // In-run sponsors carry over (cosmetic continuity), but are NOT crystals.
      sponsors: state.resources.sponsors,
    },
    lifetimeResources: {
      ...fresh.lifetimeResources,
      sponsors: state.lifetimeResources.sponsors,
    },
    // Keep RNG continuity so the next run doesn't replay the same sequence.
    rngSeed: state.rngSeed,
    stats: {
      ...fresh.stats,
      runStart: Date.now(),
    },
  };

  // Apply prestige_start_grant effects for owned prestige upgrades.
  for (const upId of Object.keys(state.prestigeUpgrades)) {
    const def = PRESTIGE_UPGRADE_MAP[upId];
    if (!def) continue;
    for (const e of def.effects) {
      if (e.type === "prestige_start_grant") {
        next = addResource(next, e.resource, e.amount);
      }
    }
  }

  return next;
}

function tryBuyPrestigeUpgrade(
  state: RepoTycoonState,
  upgradeId: string,
): RepoTycoonState {
  const def = PRESTIGE_UPGRADE_MAP[upgradeId];
  if (!def) return state;
  if (state.prestigeUpgrades[upgradeId]) return state; // already owned
  const crystals = state.crystals ?? 0;
  if (crystals < def.cost) return state;

  return {
    ...state,
    crystals: crystals - def.cost,
    prestigeUpgrades: {
      ...state.prestigeUpgrades,
      [upgradeId]: 1,
    },
  };
}

// ─────────── Reducer ───────────

export function gameReducer(
  state: RepoTycoonState,
  action: RepoTycoonAction,
): RepoTycoonState {
  switch (action.type) {
    case "TICK": {
      const now = action.now;
      const elapsedMs = now - state.lastTickAt;
      if (elapsedMs <= 0) return state;

      const clampedSec = Math.min(MAX_OFFLINE_SEC, elapsedMs / 1000);

      let next = advanceProduction(state, clampedSec, now);
      next = pruneExpiredEvents(next, now);
      next = maybeRollEvent(next, now);
      next = checkMilestones(next);
      next = { ...next, lastTickAt: now };
      return next;
    }
    case "MANUAL_COMMIT": {
      // Grant 3 seconds of auto-production as a manual bonus (min MANUAL_COMMIT_LOC).
      // This keeps clicking relevant at every upgrade tier.
      const ctx = computeContext(state, state.lastTickAt);
      const locRate = BASE_LOC_PER_SEC * ctx.locMult + ctx.locFlatPerSec;
      const bonus = Math.max(MANUAL_COMMIT_LOC, Math.ceil(locRate * 3));
      // addResource already updates lifetimeResources
      let next = addResource(state, "loc", bonus);
      next = {
        ...next,
        stats: {
          ...next.stats,
          totalManualCommits: next.stats.totalManualCommits + 1,
        },
      };
      next = checkMilestones(next);
      return next;
    }
    case "BUY_UPGRADE":
      return tryBuyUpgrade(state, action.upgradeId);
    case "PRESTIGE":
      return handlePrestige(state);
    case "BUY_PRESTIGE_UPGRADE":
      return tryBuyPrestigeUpgrade(state, action.upgradeId);
    case "CLAIM_EVENT": {
      // v1: no claimable events; reserved for future one-shot choice events.
      return state;
    }
    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.settings },
      };
    case "RESET":
      return createInitialState();
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
