import type { RepoTycoonState } from "../../../shared/repo-tycoon-types";
import { ResourceChip } from "./shared";

interface SideResourcesProps {
  state: RepoTycoonState;
  sponsorsUnlocked: boolean;
}

export function SideResources({
  state,
  sponsorsUnlocked,
}: SideResourcesProps) {
  const hasContributors = state.resources.contributors > 0;
  const showSponsors = sponsorsUnlocked || state.resources.sponsors > 0;
  const showPrestige = (state.prestigeLevel ?? 0) > 0;
  const showCrystals = (state.crystals ?? 0) > 0;

  if (!hasContributors && !showSponsors && !showPrestige && !showCrystals) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showPrestige && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-orange-500/40 bg-orange-500/10 text-[11px] font-semibold text-orange-300">
          🦀 ×{state.prestigeLevel}
        </div>
      )}
      {showCrystals && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-orange-400/30 bg-orange-400/8 text-[11px] font-mono tabular-nums text-orange-200/80">
          🦀 {state.crystals}
        </div>
      )}
      {hasContributors && (
        <ResourceChip
          resource="contributors"
          value={state.resources.contributors}
          hint="+2% LoC each"
        />
      )}
      {showSponsors && (
        <ResourceChip
          resource="sponsors"
          value={state.resources.sponsors}
          emphasized
        />
      )}
    </div>
  );
}
