// Bump whenever save shape or balance-critical semantics change.
export const SAVE_VERSION = 5;

export const TICK_INTERVAL_MS = 250;
export const MAX_OFFLINE_SEC = 8 * 60 * 60;

export const BASE_LOC_PER_SEC = 1;

/** LoC consumed to produce 1 commit. */
export const COMMIT_THRESHOLD = 5;
/** Commits consumed to produce 1 PR. */
export const PR_THRESHOLD = 3;
/** Stars produced per merged PR (before Community mult). */
export const STARS_PER_PR = 2;

export const MANUAL_COMMIT_LOC = 2;

export const EVENT_ROLL_INTERVAL_SEC = 45;
export const BASE_EVENT_CHANCE_PER_ROLL = 0.35;

/** Stars required to unlock the Rewrite in Rust prestige. */
export const PRESTIGE_THRESHOLD_STARS = 1_000_000;
/** Flat sponsor bonus on every prestige. */
export const PRESTIGE_BASE_SPONSORS = 5;
/** Additional sponsors per 200K lifetime stars earned in the run. */
export const PRESTIGE_SPONSORS_PER_200K = 1;
/** Cap on the scaling sponsor bonus (excludes the flat base). */
export const PRESTIGE_SPONSORS_BONUS_CAP = 25;
