import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  EffectKind,
  MilestoneImpact,
  RepoTycoonConfigPayload,
  RepoTycoonState,
  ResourceId,
  UpgradeDef,
} from "../../../shared/repo-tycoon-types";

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1_000) {
    // Show one decimal place when still very early, integer otherwise.
    return abs < 10 ? n.toFixed(1) : Math.floor(n).toLocaleString();
  }
  if (abs < 1_000_000) return (n / 1_000).toFixed(2) + "K";
  if (abs < 1_000_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs < 1_000_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  return (n / 1_000_000_000_000).toFixed(2) + "T";
}

export const RESOURCE_META: Record<
  ResourceId,
  { label: string; emoji: string; color: string }
> = {
  loc: { label: "LoC", emoji: "�", color: "text-cyan-300" },
  commits: { label: "Commits", emoji: "📌", color: "text-blue-300" },
  prs: { label: "PRs", emoji: "🔁", color: "text-emerald-300" },
  stars: { label: "Stars", emoji: "★", color: "text-amber-300" },
  contributors: { label: "Contributors", emoji: "🧑‍💻", color: "text-fuchsia-300" },
  sponsors: { label: "Sponsors", emoji: "💎", color: "text-yellow-300" },
};

export const IMPACT_STYLE: Record<
  MilestoneImpact,
  { ring: string; glow: string; label: string }
> = {
  small: {
    ring: "border-zinc-500/50",
    glow: "shadow-zinc-500/20",
    label: "minor",
  },
  medium: {
    ring: "border-blue-500/60",
    glow: "shadow-blue-500/30",
    label: "notable",
  },
  large: {
    ring: "border-fuchsia-500/60",
    glow: "shadow-fuchsia-500/40",
    label: "major",
  },
  huge: {
    ring: "border-amber-500/70",
    glow: "shadow-amber-500/50",
    label: "legendary",
  },
};

interface ResourceChipProps {
  resource: ResourceId;
  value: number;
  hint?: string;
  emphasized?: boolean;
}

export function ResourceChip({
  resource,
  value,
  hint,
  emphasized,
}: ResourceChipProps) {
  const meta = RESOURCE_META[resource];
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors",
        emphasized
          ? "bg-amber-500/10 border-amber-500/40"
          : "bg-white/4 border-white/8",
      )}
    >
      <span className="text-base leading-none">{meta.emoji}</span>
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {meta.label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums font-mono ml-auto",
          meta.color,
        )}
      >
        {formatNumber(value)}
      </span>
      {hint && (
        <span className="text-[10px] text-muted-foreground/70 tabular-nums font-mono">
          {hint}
        </span>
      )}
    </div>
  );
}

export type EffectiveRates = {
  locPerSec: number;
  commitThreshold: number;
  prThreshold: number;
  starsPerPr: number;
  /** LoC granted by one manual commit click at current upgrade state */
  manualCommitLoc: number;
};

/**
 * Derive the player-visible production parameters from the current state +
 * config. Mirrors the relevant effect aggregation in the main-process engine —
 * duplicated here for the UI so we don't need another IPC round trip every
 * tick.
 */
export function computeEffectiveRates(
  state: RepoTycoonState,
  config: RepoTycoonConfigPayload,
): EffectiveRates {
  let locMult = 1;
  let locFlat = 0;
  let commitToPrDiv = 1;
  let prToStarsMult = 1;

  const apply = (effects: EffectKind[]) => {
    for (const e of effects) {
      switch (e.type) {
        case "tick_rate_mult":
          if (e.resource === "loc") locMult *= e.mult;
          break;
        case "flat_add_per_sec":
          if (e.resource === "loc") locFlat += e.amount;
          break;
        case "conversion_threshold_div":
          if (e.from === "commits" && e.to === "prs") commitToPrDiv *= e.div;
          break;
        case "conversion_ratio_mult":
          if (e.from === "prs" && e.to === "stars") prToStarsMult *= e.mult;
          break;
      }
    }
  };

  const ownedTiers = (u: UpgradeDef) => {
    const lvl = state.upgrades[u.id] ?? 0;
    return u.tiers.filter((t) => t.level <= lvl);
  };
  for (const u of config.upgrades) {
    for (const tier of ownedTiers(u)) apply(tier.effects);
  }

  // Prestige upgrades (permanent production boosts; skip start_grant which is run-time only)
  for (const pu of config.prestigeUpgrades) {
    if (!state.prestigeUpgrades[pu.id]) continue;
    apply(pu.effects.filter((e) => e.type !== "prestige_start_grant"));
  }

  // Contributor bonus mirrors engine (+2% LoC per contributor)
  const contributors = state.resources.contributors;
  if (contributors > 0) locMult *= 1 + contributors * 0.02;

  const locRate = config.balance.baseLocPerSec * locMult + locFlat;
  const manualCommitLoc = Math.max(
    config.balance.manualCommitLoc,
    Math.ceil(locRate * 3),
  );
  return {
    locPerSec: locRate,
    commitThreshold: config.balance.commitThreshold,
    prThreshold: Math.max(1, config.balance.prThreshold / commitToPrDiv),
    starsPerPr: config.balance.starsPerPr * prToStarsMult,
    manualCommitLoc,
  };
}

interface ProgressBarProps {
  current: number;
  max: number;
  color?: string;
  height?: string;
  children?: ReactNode;
}

export function ProgressBar({
  current,
  max,
  color = "bg-emerald-500",
  height = "h-1.5",
  children,
}: ProgressBarProps) {
  const pct =
    max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div
      className={cn(
        "relative w-full bg-black/40 rounded-full overflow-hidden",
        height,
      )}
    >
      <div
        className={cn("h-full transition-[width] duration-200", color)}
        style={{ width: `${pct}%` }}
      />
      {children && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono">
          {children}
        </div>
      )}
    </div>
  );
}
