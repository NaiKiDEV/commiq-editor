import { Fragment } from "react";
import { ArrowRight, Code2, GitCommit, GitPullRequest, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactElement } from "react";
import type {
  RepoTycoonConfigPayload,
  RepoTycoonState,
  ResourceId,
} from "../../../shared/repo-tycoon-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import {
  computeEffectiveRates,
  formatNumber,
  RESOURCE_META,
} from "./shared";

interface PipelineProps {
  state: RepoTycoonState;
  config: RepoTycoonConfigPayload;
  locPerSec: number;
  starsPerSec: number;
}

type StageKind = {
  resource: ResourceId;
  value: number;
  /** Fill bar of value/capacity (closeness to next conversion). Omit for stars. */
  capacity?: number;
  subtitle: string;
  tooltipTitle: string;
  tooltipBody: string;
  emphasized?: boolean;
};

export function Pipeline({
  state,
  config,
  locPerSec,
  starsPerSec,
}: PipelineProps) {
  const rates = computeEffectiveRates(state, config);

  const stages: StageKind[] = [
    {
      resource: "loc",
      value: state.resources.loc,
      capacity: rates.commitThreshold,
      subtitle: `+${locPerSec.toFixed(1)}/s`,
      tooltipTitle: "Lines of Code",
      tooltipBody: `Produced by your team and tooling. Every ${rates.commitThreshold} LoC auto-bundles into 1 Commit. Click the commit button to type manually.`,
    },
    {
      resource: "commits",
      value: state.resources.commits,
      capacity: rates.prThreshold,
      subtitle: `→ every ${formatNumber(rates.prThreshold)} = 1 PR`,
      tooltipTitle: "Commits",
      tooltipBody: `Every ${formatNumber(rates.prThreshold)} Commits bundles into 1 PR. CI/CD upgrades lower this ratio.`,
    },
    {
      resource: "prs",
      value: state.resources.prs,
      capacity: 1,
      subtitle: `→ ${rates.starsPerPr.toFixed(1)} stars / PR`,
      tooltipTitle: "Pull Requests",
      tooltipBody: `Each merged PR produces ${rates.starsPerPr.toFixed(2)} Stars. Community upgrades multiply the payout.`,
    },
    {
      resource: "stars",
      value: state.resources.stars,
      subtitle: `+${starsPerSec.toFixed(2)}/s`,
      tooltipTitle: "Stars",
      tooltipBody:
        "Your primary currency. Spend on upgrades in the sidebar. Star milestones at 100, 1K, 10K, 100K, 1M each unlock new visuals and rewards.",
      emphasized: true,
    },
  ];

  return (
    <div className="flex items-stretch gap-1 px-1 py-2 rounded-lg bg-white/2 border border-white/6">
      {stages.map((stage, i) => (
        <Fragment key={stage.resource}>
          <StageCard stage={stage} />
          {i < stages.length - 1 && (
            <div className="flex items-center justify-center text-muted-foreground/40 px-0.5">
              <ArrowRight className="size-4" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

interface StageCardProps {
  stage: StageKind;
}

const STAGE_ICON: Partial<Record<ResourceId, ReactElement>> = {
  loc: <Code2 className="size-3.5" />,
  commits: <GitCommit className="size-3.5" />,
  prs: <GitPullRequest className="size-3.5" />,
  stars: <Star className="size-3.5" />,
};

const BAR_COLOR: Record<ResourceId, string> = {
  loc: "bg-cyan-400",
  commits: "bg-blue-400",
  prs: "bg-emerald-400",
  stars: "bg-amber-400",
  contributors: "bg-fuchsia-400",
  sponsors: "bg-yellow-400",
};

function StageCard({ stage }: StageCardProps) {
  const meta = RESOURCE_META[stage.resource];
  const hasCapacity = stage.capacity !== undefined && stage.capacity > 0;
  const pct = hasCapacity
    ? Math.max(0, Math.min(100, (stage.value / stage.capacity!) * 100))
    : 0;

  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        <div
          className={cn(
            "relative flex-1 min-w-0 flex flex-col gap-1 px-3 py-2 rounded-md border cursor-help transition-colors",
            stage.emphasized
              ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
              : "border-white/8 bg-white/3 hover:bg-white/5",
          )}
        >
          <div className="flex items-center gap-1.5 text-muted-foreground/60">
            {STAGE_ICON[stage.resource]}
            <span className="text-[10px] uppercase tracking-wide">
              {meta.label}
            </span>
          </div>
          <div
            className={cn(
              "text-xl font-bold tabular-nums font-mono leading-none",
              meta.color,
            )}
          >
            {formatNumber(stage.value)}
          </div>
          {/* Always render bar row to keep card heights uniform */}
          <div className="w-full bg-black/40 rounded-full overflow-hidden h-1">
            {hasCapacity && (
              <div
                className={cn(
                  "h-full transition-[width] duration-200",
                  BAR_COLOR[stage.resource],
                )}
                style={{ width: `${pct}%` }}
              />
            )}
          </div>
          <div className="text-[10px] text-muted-foreground/60 truncate tabular-nums">
            {stage.subtitle}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-none">
        <div className="w-60 space-y-1">
          <div className="font-semibold text-xs flex items-center gap-1.5">
            <span>{meta.emoji}</span>
            <span>{stage.tooltipTitle}</span>
          </div>
          <div className="text-[11px] text-popover-foreground/80 leading-snug">
            {stage.tooltipBody}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
