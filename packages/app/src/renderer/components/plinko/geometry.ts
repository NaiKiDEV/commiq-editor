/**
 * Plinko board layout in SVG user units. Pegs and the falling ball live in a
 * fixed 100-wide coordinate space scaled to the panel width via the SVG
 * viewBox. The buckets are rendered as crisp HTML below the SVG (not in it), so
 * geometry only needs to place pegs and the ball's fall path; the ball exits
 * the bottom of the SVG into the bucket row, which is aligned by sharing the
 * same horizontal padding.
 *
 * Row `i` holds `i + 3` pegs forming a downward-widening triangle. After `rows`
 * left/right bounces the ball lands in one of `rows + 1` buckets; the landing
 * column equals the number of right bounces.
 */

export const BOARD_WIDTH = 100;

const PAD_X = 5;
const PAD_TOP = 6;
const PEG_AREA_HEIGHT = 74;

/**
 * Buckets span the full peg width (PAD_X..100-PAD_X), centred. Because this is
 * independent of row count, the HTML bucket row just uses this width and lets
 * flexbox space the buckets to match the ball's landing columns exactly.
 */
export const BUCKET_SPAN_PCT = BOARD_WIDTH - 2 * PAD_X;

export interface Point {
  x: number;
  y: number;
}

export interface BoardLayout {
  width: number;
  height: number;
  /** Horizontal gap between adjacent pegs in a row. */
  gap: number;
  pegRadius: number;
  /** Peg centres, outer array indexed by row (top to bottom). */
  pegRows: Point[][];
  dropPoint: Point;
}

const layoutCache = new Map<number, BoardLayout>();

/** Compute (and cache) the board layout for a given row count. */
export function boardLayout(rows: number): BoardLayout {
  const cached = layoutCache.get(rows);
  if (cached) return cached;

  const gap = (BOARD_WIDTH - 2 * PAD_X) / (rows + 1);
  const rowGap = PEG_AREA_HEIGHT / rows;
  const pegRadius = Math.min(2.0, gap * 0.15);

  const pegRows: Point[][] = [];
  for (let i = 0; i < rows; i++) {
    const count = i + 3;
    const startX = BOARD_WIDTH / 2 - ((count - 1) * gap) / 2;
    const y = PAD_TOP + i * rowGap;
    const row: Point[] = [];
    for (let j = 0; j < count; j++) row.push({ x: startX + j * gap, y });
    pegRows.push(row);
  }

  const layout: BoardLayout = {
    width: BOARD_WIDTH,
    height: PAD_TOP + rows * rowGap,
    gap,
    pegRadius,
    pegRows,
    dropPoint: { x: BOARD_WIDTH / 2, y: PAD_TOP - rowGap * 0.8 },
  };
  layoutCache.set(rows, layout);
  return layout;
}

/**
 * Waypoints a ball passes through for a given bounce sequence: the drop point,
 * one point per peg row (offset by the running count of right bounces), then a
 * final point at the bottom edge so the ball falls out of the SVG into its
 * bucket column before it's removed.
 */
export function computeWaypoints(rows: number, directions: boolean[]): Point[] {
  const layout = boardLayout(rows);
  const half = layout.gap / 2;
  const points: Point[] = [layout.dropPoint];

  let rights = 0;
  let lastX = BOARD_WIDTH / 2;
  for (let i = 0; i < rows; i++) {
    if (directions[i]) rights++;
    lastX = BOARD_WIDTH / 2 + (2 * rights - (i + 1)) * half;
    points.push({ x: lastX, y: layout.pegRows[i][0].y });
  }

  points.push({ x: lastX, y: layout.height + 2 });
  return points;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Interpolate a ball position along its waypoints at progress `t` (0..1). */
export function ballPosition(waypoints: Point[], t: number): Point {
  const segments = waypoints.length - 1;
  const scaled = clamp01(t) * segments;
  const index = Math.min(Math.floor(scaled), segments - 1);
  const local = scaled - index;
  const a = waypoints[index];
  const b = waypoints[index + 1];
  // Horizontal eases out, vertical eases in, so it reads like gravity per peg.
  const ex = 1 - (1 - local) * (1 - local);
  const ey = local * local;
  return { x: a.x + (b.x - a.x) * ex, y: a.y + (b.y - a.y) * ey };
}
