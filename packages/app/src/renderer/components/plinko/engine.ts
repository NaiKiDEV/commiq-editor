/**
 * Plinko game logic: peg-row geometry, payout tables, and ball physics.
 *
 * A ball drops from the top centre and bounces left/right off each peg row.
 * After `rows` decisions it settles in one of `rows + 1` buckets. The bucket
 * index equals the number of right bounces, so outcomes follow a binomial
 * distribution, so the centre is most likely (low multiplier) and the edges are
 * rare (big multiplier).
 */

export type Risk = "low" | "medium" | "high";

/** Number of peg rows the player can choose between. */
export const ROW_OPTIONS = [8, 12, 16] as const;
export type Rows = (typeof ROW_OPTIONS)[number];

export const RISKS: Risk[] = ["low", "medium", "high"];

export const RISK_LABEL: Record<Risk, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Spread factor per risk level: bigger base = steeper edges, lower centre. */
const RISK_BASE: Record<Risk, number> = {
  low: 1.32,
  medium: 1.62,
  high: 2.0,
};

/** Target return-to-player; the ~3% gap is the house edge. */
const TARGET_RTP = 0.97;

/** Binomial coefficients for row `n` (Pascal's triangle row). */
function binomialRow(n: number): number[] {
  const row = [1];
  let c = 1;
  for (let k = 0; k < n; k++) {
    c = (c * (n - k)) / (k + 1);
    row.push(c);
  }
  return row;
}

/** Round a multiplier to a clean, plinko-looking value for display + payout. */
function niceMultiplier(m: number): number {
  if (m >= 100) return Math.round(m / 10) * 10;
  if (m >= 10) return Math.round(m);
  if (m >= 1) return Math.round(m * 10) / 10;
  return Math.round(m * 100) / 100;
}

/**
 * Build a symmetric multiplier table for the given rows + risk. The shape grows
 * geometrically toward the edges, then is scaled so the expected payout equals
 * TARGET_RTP before rounding.
 */
function buildMultipliers(rows: number, risk: Risk): number[] {
  const base = RISK_BASE[risk];
  const coeffs = binomialRow(rows);
  const total = 2 ** rows;
  const probs = coeffs.map((c) => c / total);

  const shape = Array.from({ length: rows + 1 }, (_, k) =>
    Math.pow(base, Math.abs(k - rows / 2)),
  );
  const denom = shape.reduce((sum, s, k) => sum + probs[k] * s, 0);
  const scale = TARGET_RTP / denom;

  return shape.map((s) => niceMultiplier(s * scale));
}

// Tables are deterministic, so build each (rows, risk) combination once.
const MULTIPLIER_CACHE = new Map<string, number[]>();

/** Memoised payout multipliers, indexed by bucket (left → right). */
export function multipliersFor(rows: number, risk: Risk): number[] {
  const key = `${rows}:${risk}`;
  const cached = MULTIPLIER_CACHE.get(key);
  if (cached) return cached;
  const built = buildMultipliers(rows, risk);
  MULTIPLIER_CACHE.set(key, built);
  return built;
}

export interface DropResult {
  /** Per-row bounce directions; `true` = right. */
  directions: boolean[];
  /** Final bucket index (count of right bounces). */
  bucket: number;
}

/** Simulate a single fair drop through `rows` peg rows. */
export function dropBall(rows: number): DropResult {
  const directions: boolean[] = [];
  let bucket = 0;
  for (let i = 0; i < rows; i++) {
    const right = Math.random() < 0.5;
    directions.push(right);
    if (right) bucket++;
  }
  return { directions, bucket };
}

/** Format a multiplier the way plinko sites do: "5.6x", "0.5x", "120x". */
export function formatMultiplier(m: number): string {
  const text =
    m >= 10 ? String(Math.round(m)) : m.toFixed(m < 1 ? 2 : 1).replace(/0$/, "");
  return `${text}x`;
}

/**
 * Bucket colour: a single warm ramp from amber at the low-paying centre to red
 * at the high-paying edges. Staying inside one hue family (≈45° to 8°) keeps
 * the board from looking like a rainbow. `distance` is the bucket's distance
 * from the centre; `maxDistance` is the furthest bucket.
 */
export function bucketColor(distance: number, maxDistance: number): string {
  const t = maxDistance === 0 ? 0 : distance / maxDistance;
  const hue = Math.round(45 - t * 37);
  const lightness = Math.round(56 - t * 8);
  return `hsl(${hue} 90% ${lightness}%)`;
}
