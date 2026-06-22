import { useMemo } from "react";
import { bucketColor, formatMultiplier } from "./engine";
import {
  boardLayout,
  computeWaypoints,
  ballPosition,
  BUCKET_SPAN_PCT,
  type Point,
} from "./geometry";

/** A ball currently on the board, as seen by the renderer. */
export interface BallView {
  id: number;
  directions: boolean[];
  startTime: number;
  dur: number;
}

/** A landing in progress: drives the bucket pop + the floating multiplier. */
export interface Pop {
  id: number;
  bucket: number;
  mult: number;
}

interface PlinkoBoardProps {
  rows: number;
  /** Payout multipliers indexed by bucket (left to right). */
  multipliers: number[];
  balls: BallView[];
  pops: Pop[];
}

/** Crisp bucket label: "5.6", "120", "0.5" (the "x" is shown only on hit). */
function bucketLabel(m: number): string {
  if (m >= 10) return String(Math.round(m));
  if (m >= 1) return (Math.round(m * 10) / 10).toString();
  return (Math.round(m * 100) / 100).toString();
}

export function PlinkoBoard({ rows, multipliers, balls, pops }: PlinkoBoardProps) {
  const layout = useMemo(() => boardLayout(rows), [rows]);
  const maxDistance = rows / 2;
  // The parent re-renders this on every animation frame (a fresh `balls`
  // array), so reading the clock here advances each ball's position.
  const now = performance.now();

  const ballPoints: { id: number; pos: Point }[] = balls.map((ball) => {
    const waypoints = computeWaypoints(rows, ball.directions);
    const t = (now - ball.startTime) / ball.dur;
    return { id: ball.id, pos: ballPosition(waypoints, t) };
  });

  const ballRadius = Math.max(layout.pegRadius * 1.6, 1.7);
  // Group by bucket so every hit renders its own floating label (each keyed by
  // pop id), letting overlapping hits on the same bucket all animate in full.
  const popsByBucket = new Map<number, Pop[]>();
  for (const pop of pops) {
    const list = popsByBucket.get(pop.bucket);
    if (list) list.push(pop);
    else popsByBucket.set(pop.bucket, [pop]);
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-3">
      <style>{POP_KEYFRAMES}</style>

      <div className="mx-auto w-full max-w-[680px]">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Plinko board"
      >
        <g className="text-muted-foreground/35" fill="currentColor">
          {layout.pegRows.flatMap((row, i) =>
            row.map((peg, j) => (
              <circle
                key={`${i}-${j}`}
                cx={peg.x}
                cy={peg.y}
                r={layout.pegRadius}
              />
            )),
          )}
        </g>

        <g className="text-foreground" fill="currentColor">
          {ballPoints.map(({ id, pos }) => (
            <circle key={id} cx={pos.x} cy={pos.y} r={ballRadius} />
          ))}
        </g>
      </svg>

      {/* Buckets: real HTML for crisp text, width matches the peg span. */}
      <div
        className="mx-auto flex gap-[3px]"
        style={{ width: `${BUCKET_SPAN_PCT}%` }}
      >
        {multipliers.map((mult, k) => {
          const distance = Math.abs(k - maxDistance);
          const color = bucketColor(distance, maxDistance);
          const bucketPops = popsByBucket.get(k);
          // Latest hit drives the pulse. Using it as the bucket's key remounts
          // the element on each new hit, so the scale animation restarts every
          // time, even for repeat hits on the same bucket.
          const latestPopId = bucketPops?.[bucketPops.length - 1]?.id;
          return (
            <div key={k} className="relative min-w-0 flex-1">
              {bucketPops?.map((pop) => (
                <span
                  key={pop.id}
                  className="pointer-events-none absolute inset-x-0 bottom-full z-10 whitespace-nowrap text-center font-mono text-xs font-bold tabular-nums"
                  style={{ color, animation: "plinkoFloat 900ms ease-out forwards" }}
                >
                  {formatMultiplier(mult)}
                </span>
              ))}
              <div
                key={latestPopId ?? "idle"}
                className="flex h-7 items-center justify-center rounded-md border-b-2 font-mono text-[11px] font-bold tabular-nums text-black/85 sm:text-xs"
                style={{
                  background: color,
                  borderBottomColor: "rgba(0,0,0,0.28)",
                  animation:
                    latestPopId !== undefined
                      ? "plinkoPulse 420ms ease-out"
                      : undefined,
                }}
              >
                {bucketLabel(mult)}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

const POP_KEYFRAMES = `
@keyframes plinkoPulse {
  0% { transform: scale(1); }
  30% { transform: scale(1.18); }
  60% { transform: scale(0.97); }
  100% { transform: scale(1); }
}
@keyframes plinkoFloat {
  0% { opacity: 0; transform: translateY(4px) scale(0.85); }
  18% { opacity: 1; transform: translateY(-10px) scale(1.05); }
  100% { opacity: 0; transform: translateY(-42px) scale(1); }
}
`;
