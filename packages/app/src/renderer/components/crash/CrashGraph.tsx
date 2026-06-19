import { Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  multiplierAt,
  multiplierColor,
  multiplierTextClass,
  formatMultiplier,
  type CrashPhase,
} from "./engine";

interface CrashGraphProps {
  phase: CrashPhase;
  /** Current multiplier (1.00 while idle). */
  multiplier: number;
  /** Time since the round started, in ms; drives the curve sampling. */
  elapsedMs: number;
  /** Where this round busts — shown on the crash banner. */
  crashPoint: number;
  /** Remaining ms before the round starts (betting phase only). */
  countdownMs: number;
}

/** SVG canvas is square in user units; preserveAspectRatio="none" stretches it. */
const VB = 1000;
/** Curve samples — enough for a smooth exponential without overdrawing. */
const SAMPLES = 64;
/** Minimum horizontal time window so an early curve still fills the stage. */
const MIN_WINDOW_MS = 6000;
/** Minimum vertical headroom so the line isn't pinned to the floor at low x. */
const MIN_TOP = 2;

interface Pt {
  /** 0..1 left→right. */
  fx: number;
  /** 0..1 bottom→top. */
  fy: number;
}

/** Sample the analytic exponential up to `elapsedMs` into a normalized point list. */
function sampleCurve(elapsedMs: number, multiplier: number): Pt[] {
  const xMax = Math.max(elapsedMs, MIN_WINDOW_MS);
  const yTop = Math.max(multiplier * 1.12, MIN_TOP);
  const span = yTop - 1;
  const pts: Pt[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * elapsedMs;
    const m = multiplierAt(t);
    pts.push({ fx: t / xMax, fy: (m - 1) / span });
  }
  return pts;
}

/** Build the stroke path (and a closed area path) in viewBox units. */
function buildPaths(pts: Pt[]): { line: string; area: string } {
  const xy = (p: Pt) => `${(p.fx * VB).toFixed(1)},${((1 - p.fy) * VB).toFixed(1)}`;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xy(p)}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${line} L${(last.fx * VB).toFixed(1)},${VB} L0,${VB} Z`;
  return { line, area };
}

export function CrashGraph({
  phase,
  multiplier,
  elapsedMs,
  crashPoint,
  countdownMs,
}: CrashGraphProps) {
  const crashed = phase === "crashed";
  const betting = phase === "betting";
  const color = crashed ? "#ef4444" : multiplierColor(multiplier);

  const pts = sampleCurve(elapsedMs, multiplier);
  const { line, area } = buildPaths(pts);
  const head = pts[pts.length - 1];
  const headLeft = `${head.fx * 100}%`;
  const headTop = `${(1 - head.fy) * 100}%`;

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl border border-border/60 bg-[radial-gradient(circle_at_50%_120%,rgba(52,211,153,0.08),transparent_60%)] bg-card/30">
      {/* Faint grid for depth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {!betting && (
          <>
            <path d={area} fill="url(#crash-fill)" />
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          </>
        )}
      </svg>

      {/* Rocket head riding the curve tip */}
      {!betting && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-transform"
          style={{ left: headLeft, top: headTop }}
        >
          <span
            className="absolute inset-0 -z-10 rounded-full blur-md"
            style={{
              background: color,
              opacity: crashed ? 0.2 : 0.55,
              width: 32,
              height: 32,
              transform: "translate(-8px, -8px)",
            }}
          />
          <Rocket
            className={cn("size-4 transition-all", crashed && "rotate-90 opacity-40")}
            style={{ color }}
          />
        </div>
      )}

      {/* Center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        {betting ? (
          <>
            <span className="font-mono text-5xl font-bold tabular-nums text-foreground/80">
              {(countdownMs / 1000).toFixed(1)}s
            </span>
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
              Place your bets
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-mono text-6xl font-bold tabular-nums drop-shadow-lg transition-colors",
                crashed ? "text-red-500" : multiplierTextClass(multiplier),
              )}
              style={{ textShadow: `0 0 24px ${color}66` }}
            >
              {formatMultiplier(multiplier)}
            </span>
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-widest",
                crashed ? "text-red-500" : "text-muted-foreground/70",
              )}
            >
              {crashed ? `Crashed @ ${formatMultiplier(crashPoint)}` : "Cash out!"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
