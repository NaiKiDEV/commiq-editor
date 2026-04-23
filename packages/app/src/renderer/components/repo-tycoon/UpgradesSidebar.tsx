import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  EffectKind,
  MilestoneDef,
  PrestigeUpgradeDef,
  RepoTycoonState,
  UpgradeCategory,
  UpgradeDef,
} from "../../../shared/repo-tycoon-types";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { formatNumber, ProgressBar, RESOURCE_META } from "./shared";

const CATEGORY_META: Record<
  UpgradeCategory,
  { label: string; emoji: string; accent: string; ring: string; subtitle: string }
> = {
  tooling: {
    label: "Tooling",
    emoji: "⌨️",
    accent: "text-cyan-300",
    ring: "border-cyan-400/40 bg-cyan-500/10",
    subtitle: "Multiplies LoC/sec",
  },
  team: {
    label: "Team",
    emoji: "👥",
    accent: "text-emerald-300",
    ring: "border-emerald-400/40 bg-emerald-500/10",
    subtitle: "Adds flat LoC/sec",
  },
  cicd: {
    label: "CI/CD",
    emoji: "🔁",
    accent: "text-blue-300",
    ring: "border-blue-400/40 bg-blue-500/10",
    subtitle: "Fewer commits per PR",
  },
  community: {
    label: "Community",
    emoji: "🌐",
    accent: "text-fuchsia-300",
    ring: "border-fuchsia-400/40 bg-fuchsia-500/10",
    subtitle: "More stars per PR",
  },
};

const CATEGORY_ORDER: UpgradeCategory[] = ["tooling", "team", "cicd", "community"];

type SidebarTab = UpgradeCategory | "milestones";

export function effectSummary(e: EffectKind): string {
  switch (e.type) {
    case "tick_rate_mult":
      return `${e.mult}× ${RESOURCE_META[e.resource].label}/sec`;
    case "flat_add_per_sec":
      return `+${e.amount} ${RESOURCE_META[e.resource].label}/sec`;
    case "conversion_threshold_div":
      return `÷${e.div.toFixed(2)} ${RESOURCE_META[e.from].label}→${RESOURCE_META[e.to].label} threshold`;
    case "conversion_ratio_mult":
      return `${e.mult}× ${RESOURCE_META[e.to].label} per ${RESOURCE_META[e.from].label}`;
    case "grant_resource":
      return `+${e.amount} ${RESOURCE_META[e.resource].label}`;
    case "event_chance_mult":
      return `${e.mult}× event chance`;
    case "prestige_start_grant":
      return `start with +${e.amount} ${RESOURCE_META[e.resource].label}`;
  }
}

interface UpgradesSidebarProps {
  state: RepoTycoonState;
  upgrades: UpgradeDef[];
  milestones: MilestoneDef[];
  prestigeUpgrades: PrestigeUpgradeDef[];
  onBuyUpgrade: (upgradeId: string) => void;
  onBuyPrestigeUpgrade: (upgradeId: string) => void;
}

export function UpgradesSidebar({
  state,
  upgrades,
  milestones,
  prestigeUpgrades,
  onBuyUpgrade,
  onBuyPrestigeUpgrade,
}: UpgradesSidebarProps) {
  const byCategory = useMemo(() => {
    const map: Record<UpgradeCategory, UpgradeDef[]> = {
      tooling: [],
      team: [],
      cicd: [],
      community: [],
    };
    for (const u of upgrades) map[u.category].push(u);
    return map;
  }, [upgrades]);

  const tierCounts = useMemo(() => {
    const out: Record<UpgradeCategory, { owned: number; total: number }> = {
      tooling: { owned: 0, total: 0 },
      team: { owned: 0, total: 0 },
      cicd: { owned: 0, total: 0 },
      community: { owned: 0, total: 0 },
    };
    for (const u of upgrades) {
      out[u.category].total += u.tiers.length;
      out[u.category].owned += state.upgrades[u.id] ?? 0;
    }
    return out;
  }, [upgrades, state.upgrades]);

  const affordableByCategory = useMemo(() => {
    const out: Record<UpgradeCategory, boolean> = {
      tooling: false,
      team: false,
      cicd: false,
      community: false,
    };
    for (const u of upgrades) {
      const owned = state.upgrades[u.id] ?? 0;
      const next = u.tiers.find((t) => t.level === owned + 1);
      if (!next) continue;
      if (state.resources[next.cost.resource] >= next.cost.amount) {
        out[u.category] = true;
      }
    }
    return out;
  }, [upgrades, state.upgrades, state.resources]);

  const [activeTab, setActiveTab] = useState<SidebarTab>("tooling");

  const nextMilestone = useMemo(() => {
    const unlocked = new Set(state.milestonesUnlocked);
    return milestones.find((m) => !unlocked.has(m.id));
  }, [milestones, state.milestonesUnlocked]);

  const crystals = state.crystals ?? 0;
  const hasCrystals = crystals > 0;
  const ownedPrestigeCount = Object.keys(state.prestigeUpgrades).length;
  const affordablePrestige = hasCrystals && prestigeUpgrades.some(
    (u) => !state.prestigeUpgrades[u.id] && crystals >= u.cost,
  );

  const isMilestones = activeTab === "milestones";
  const activeItems = !isMilestones ? byCategory[activeTab as UpgradeCategory] : [];
  const activeMeta = !isMilestones ? CATEGORY_META[activeTab as UpgradeCategory] : null;

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Tab pills */}
      <div className="flex flex-wrap gap-1">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const count = tierCounts[cat];
          const active = cat === activeTab;
          const canAfford = affordableByCategory[cat];
          const maxed = count.owned === count.total && count.total > 0;
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={cn(
                "relative flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md border text-[10px] transition-all",
                active
                  ? `${meta.ring} ${meta.accent}`
                  : "border-white/8 bg-white/2 text-muted-foreground hover:bg-white/5",
              )}
            >
              <span className="text-sm leading-none">{meta.emoji}</span>
              <span className="font-semibold uppercase tracking-wide">{meta.label}</span>
              <span className="font-mono tabular-nums text-[9px] opacity-70">
                {count.owned}/{count.total}
              </span>
              {canAfford && !active && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
              {maxed && (
                <span className="absolute top-0.5 right-0.5 text-amber-400 text-[9px]">★</span>
              )}
            </button>
          );
        })}

        <button
          onClick={() => setActiveTab("milestones")}
          className={cn(
            "relative flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md border text-[10px] transition-all",
            isMilestones
              ? "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-300"
              : "border-white/8 bg-white/2 text-muted-foreground hover:bg-white/5",
          )}
        >
          <span className="text-sm leading-none">🏅</span>
          <span className="font-semibold uppercase tracking-wide">Goals</span>
          <span className="font-mono tabular-nums text-[9px] opacity-70">
            {state.milestonesUnlocked.length}/{milestones.length}
          </span>
          {affordablePrestige && !isMilestones && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* ── Normal tab content ─────────────────────────────────────────────── */}
      {!isMilestones && (
        <>
          {nextMilestone && (
            <Tooltip>
              <TooltipTrigger render={<div />}>
                <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-white/3 border border-white/8 cursor-help">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-muted-foreground/70">
                    <span>Next milestone</span>
                    <span className="font-mono tabular-nums">
                      {formatNumber(state.lifetimeResources[nextMilestone.requires.resource])}
                      {" / "}
                      {formatNumber(nextMilestone.requires.amount)}
                    </span>
                  </div>
                  <div className="text-xs font-medium truncate">{nextMilestone.title}</div>
                  <ProgressBar
                    current={state.lifetimeResources[nextMilestone.requires.resource]}
                    max={nextMilestone.requires.amount}
                    color={
                      nextMilestone.impact === "huge"
                        ? "bg-amber-400"
                        : nextMilestone.impact === "large"
                          ? "bg-fuchsia-400"
                          : nextMilestone.impact === "medium"
                            ? "bg-blue-400"
                            : "bg-emerald-400"
                    }
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-none">
                <div className="w-56 text-[11px] space-y-1">
                  <div className="font-semibold text-xs">{nextMilestone.title}</div>
                  <div className="text-popover-foreground/80 italic">{nextMilestone.description}</div>
                  {nextMilestone.rewards && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
                      {nextMilestone.rewards.map((r, i) => (
                        <span
                          key={i}
                          className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-foreground/10"
                        >
                          {effectSummary(r)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          <div className="flex items-baseline justify-between px-1">
            <div className={cn("flex items-center gap-1.5", activeMeta!.accent)}>
              <span>{activeMeta!.emoji}</span>
              <span className="text-[10px] uppercase tracking-widest font-semibold">
                {activeMeta!.label}
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground/60 italic">
              {activeMeta!.subtitle}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-1">
            {activeItems.map((up) => {
              const owned = state.upgrades[up.id] ?? 0;
              const nextTier = up.tiers.find((t) => t.level === owned + 1);
              const maxed = !nextTier;
              const canAfford =
                nextTier &&
                state.resources[nextTier.cost.resource] >= nextTier.cost.amount;

              return (
                <div
                  key={up.id}
                  className={cn(
                    "flex flex-col gap-1 p-2 rounded-md border transition-colors",
                    maxed ? "border-amber-500/50 bg-amber-500/5" : "border-white/8 bg-white/3",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">{up.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        <span className="truncate">{up.name}</span>
                        <span className="text-[9px] font-mono tabular-nums text-muted-foreground/70 uppercase tracking-wider">
                          tier {owned}/{up.tiers.length}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 italic truncate">
                        {maxed ? "maxed" : `next: ${nextTier!.name}`}
                      </div>
                    </div>
                  </div>
                  {nextTier && (
                    <>
                      <div className="text-[10px] text-muted-foreground/80 leading-tight">
                        {nextTier.description}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {nextTier.effects.map((e, i) => (
                          <span
                            key={i}
                            className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground"
                          >
                            {effectSummary(e)}
                          </span>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant={canAfford ? "default" : "outline"}
                        disabled={!canAfford}
                        onClick={() => onBuyUpgrade(up.id)}
                        className="w-full h-7 text-xs gap-1"
                      >
                        <span>{RESOURCE_META[nextTier.cost.resource].emoji}</span>
                        <span className="font-mono tabular-nums">
                          {formatNumber(nextTier.cost.amount)}
                        </span>
                        <span className="text-muted-foreground/80">
                          {RESOURCE_META[nextTier.cost.resource].label}
                        </span>
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Milestones / Goals tab content ──────────────────────────────── */}
      {isMilestones && (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-1">
          {/* All milestones list */}
          {milestones.map((m) => {
            const unlocked = state.milestonesUnlocked.includes(m.id);
            const progress = state.lifetimeResources[m.requires.resource];
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col gap-1 p-2 rounded-md border text-[10px]",
                  unlocked
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-white/8 bg-white/2",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "font-semibold text-[11px]",
                      unlocked ? "text-amber-300" : "text-foreground/80",
                    )}
                  >
                    {unlocked ? "✓ " : ""}{m.title}
                  </span>
                  <span className="font-mono tabular-nums opacity-60 shrink-0">
                    {formatNumber(Math.min(progress, m.requires.amount))}/
                    {formatNumber(m.requires.amount)}{" "}
                    {RESOURCE_META[m.requires.resource].emoji}
                  </span>
                </div>
                {!unlocked && (
                  <ProgressBar
                    current={progress}
                    max={m.requires.amount}
                    color={
                      m.impact === "huge"
                        ? "bg-amber-400"
                        : m.impact === "large"
                          ? "bg-fuchsia-400"
                          : m.impact === "medium"
                            ? "bg-blue-400"
                            : "bg-emerald-400"
                    }
                  />
                )}
                {m.rewards && (
                  <div className="flex flex-wrap gap-1">
                    {m.rewards.map((r, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-foreground/8 text-[9px] uppercase tracking-wide text-muted-foreground"
                      >
                        {effectSummary(r)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Prestige upgrade section — only when crystals have been earned */}
          {hasCrystals && (
            <>
              <div className="flex items-center gap-2 px-1 pt-1">
                <div className="flex-1 h-px bg-orange-500/20" />
                <span className="text-[9px] uppercase tracking-widest text-orange-400/70 font-semibold">
                  🦀 Prestige Upgrades
                </span>
                <div className="flex-1 h-px bg-orange-500/20" />
              </div>
              <div className="text-[10px] text-orange-300/60 px-1">
                {crystals} 🦀 crystals available
              </div>
              {prestigeUpgrades.map((up) => {
                const owned = !!state.prestigeUpgrades[up.id];
                const canAfford = !owned && crystals >= up.cost;
                return (
                  <div
                    key={up.id}
                    className={cn(
                      "flex flex-col gap-1 p-2 rounded-md border transition-colors",
                      owned
                        ? "border-orange-500/40 bg-orange-500/5"
                        : "border-white/8 bg-white/3",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm leading-none">{up.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium flex items-center gap-1.5">
                          <span className="truncate">{up.name}</span>
                          {owned && (
                            <span className="text-[9px] text-orange-400/80 uppercase tracking-wider font-mono">
                              owned
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 italic truncate">
                          {up.flavorText}
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 leading-tight">
                      {up.description}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {up.effects.map((e, i) => (
                        <span
                          key={i}
                          className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300/80"
                        >
                          {effectSummary(e)}
                        </span>
                      ))}
                    </div>
                    {!owned && (
                      <Button
                        size="sm"
                        variant={canAfford ? "default" : "outline"}
                        disabled={!canAfford}
                        onClick={() => onBuyPrestigeUpgrade(up.id)}
                        className={cn(
                          "w-full h-7 text-xs gap-1",
                          canAfford &&
                            "bg-orange-500/80 hover:bg-orange-500 border-orange-400/40 text-white",
                        )}
                      >
                        <span>🦀</span>
                        <span className="font-mono tabular-nums">{up.cost}</span>
                        <span className="opacity-70">crystals</span>
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
