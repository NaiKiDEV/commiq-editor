import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  MilestoneDef,
  RepoTycoonState,
} from "../../../shared/repo-tycoon-types";
import { Button } from "../ui/button";
import { GitCommit } from "lucide-react";
import { formatNumber } from "./shared";

interface CanvasViewProps {
  state: RepoTycoonState;
  milestones: MilestoneDef[];
  flags: Set<string>;
  onManualCommit: () => void;
  commitFlashKey: number;
  manualLocPerClick: number;
  onPrestige: () => void;
}

type ContributorDot = {
  id: number;
  angle: number;
  distance: number;
  hue: number;
};

function computeContributors(count: number): ContributorDot[] {
  const capped = Math.min(count, 32);
  const dots: ContributorDot[] = [];
  for (let i = 0; i < capped; i++) {
    const angle = (i / capped) * Math.PI * 2;
    const distance = 120 + ((i * 37) % 70);
    const hue = (i * 47) % 360;
    dots.push({ id: i, angle, distance, hue });
  }
  return dots;
}

export function CanvasView({
  state,
  milestones,
  flags,
  onManualCommit,
  commitFlashKey,
  manualLocPerClick,
  onPrestige,
}: CanvasViewProps) {
  // Pops array: each entry fades out then is removed
  const [locPops, setLocPops] = useState<{ id: number; amount: number }[]>([]);
  const prevFlashKey = useRef(0);

  const prestigeReady = state.milestonesUnlocked.includes("unicorn");
  const crystalsPreview = Math.min(
    30,
    5 + Math.floor((state.lifetimeResources?.stars ?? 0) / 200_000),
  );

  useEffect(() => {
    if (commitFlashKey === prevFlashKey.current) return;
    prevFlashKey.current = commitFlashKey;
    const id = Date.now() + Math.random();
    setLocPops((p) => [...p, { id, amount: manualLocPerClick }]);
    setTimeout(() => setLocPops((p) => p.filter((x) => x.id !== id)), 900);
  }, [commitFlashKey, manualLocPerClick]);
  const contributors = useMemo(
    () => computeContributors(state.resources.contributors),
    [state.resources.contributors],
  );

  const showCommitGraph = flags.has("show-commit-graph");
  const showActivityFeed = flags.has("show-activity-feed");
  const showTrending = flags.has("show-trending-banner");
  const showContributorSwarm = flags.has("show-contributor-swarm");
  const showHn = flags.has("show-hn-banner");
  const themeGold = flags.has("theme-gold");
  const showUnicorn = flags.has("show-unicorn");

  const starsNumberNote = useMemo(() => {
    const s = state.resources.stars;
    if (s >= 1_000_000) return "Open Source Unicorn";
    if (s >= 100_000) return "Sponsored";
    if (s >= 10_000) return "Hacker News Front Page";
    if (s >= 1_000) return "Trending Repository";
    if (s >= 100) return "Growing";
    return "Your Repository";
  }, [state.resources.stars]);

  const activityFeed = useMemo(() => {
    const items: string[] = [];
    const c = Math.floor(state.resources.commits);
    const p = Math.floor(state.resources.prs);
    items.push(`#${c + 42} chore: bump deps`);
    items.push(`#${c + 41} fix: typo in README`);
    if (p > 0) items.push(`merged PR #${p}: refactor core`);
    items.push(`#${c + 40} feat: add option to opts`);
    items.push(`#${c + 39} docs: update example`);
    return items.slice(0, 5);
  }, [state.resources.commits, state.resources.prs]);

  return (
    <div className="relative h-full flex items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-black/20">
      {/* Ambient glow layer */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className={cn(
            "absolute top-1/3 left-1/3 w-96 h-96 rounded-full blur-[120px] transition-colors duration-1000",
            themeGold ? "bg-amber-500/15" : "bg-fuchsia-500/5",
          )}
        />
        <div
          className={cn(
            "absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-[100px] transition-colors duration-1000",
            themeGold ? "bg-rose-500/10" : "bg-cyan-500/5",
          )}
        />
      </div>

      {/* Banner: trending / HN */}
      {(showTrending || showHn) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center pointer-events-none">
          {showHn && (
            <div className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-orange-500/20 border border-orange-500/40 text-orange-300 animate-pulse">
              🟠 Front Page of Hacker News
            </div>
          )}
          {showTrending && !showHn && (
            <div className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
              🔥 Trending on GitHub
            </div>
          )}
        </div>
      )}

      {/* Activity feed */}
      {showActivityFeed && (
        <div className="absolute top-4 left-4 flex flex-col gap-0.5 text-[10px] font-mono text-muted-foreground/70 pointer-events-none">
          {activityFeed.map((line, i) => (
            <div
              key={`${line}-${i}`}
              style={{ opacity: 1 - i * 0.18 }}
              className="truncate max-w-55"
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Contributor swarm (only once large milestone reached) */}
      {showContributorSwarm && contributors.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {contributors.map((c) => {
            const x = 50 + (c.distance / 5) * Math.cos(c.angle);
            const y = 50 + (c.distance / 5) * Math.sin(c.angle);
            return (
              <div
                key={c.id}
                className="absolute text-xl transition-[left,top] duration-500"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: "translate(-50%,-50%)",
                  filter: `hue-rotate(${c.hue}deg)`,
                  animation: `float-up 4s ease-in-out ${c.id * 0.12}s infinite alternate`,
                }}
              >
                🧑‍💻
              </div>
            );
          })}
        </div>
      )}

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-4 z-10">
        {showCommitGraph && (
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="ml-2">main</span>
          </div>
        )}

        <div className="text-center">
          <div
            className={cn(
              "text-6xl font-bold tracking-tight bg-clip-text text-transparent transition-colors leading-tight tabular-nums",
              themeGold
                ? "bg-linear-to-br from-amber-200 via-amber-400 to-rose-400"
                : "bg-linear-to-br from-cyan-200 via-fuchsia-300 to-amber-300",
            )}
          >
            {Math.floor(state.resources.stars).toLocaleString()}
          </div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60 mt-1">
            ⭐ {starsNumberNote}
          </div>
        </div>

        <div className="relative inline-flex">
          {locPops.map((pop) => (
            <div
              key={pop.id}
              className="absolute inset-x-0 bottom-1/2 flex justify-center pointer-events-none z-20"
              style={{ animation: "loc-pop 0.9s ease-out forwards" }}
            >
              <span className="whitespace-nowrap text-xs font-mono font-bold text-cyan-300 drop-shadow-[0_0_6px_rgba(103,232,249,0.8)] px-1">
                +{formatNumber(pop.amount)} LoC
              </span>
            </div>
          ))}
          <Button
            size="lg"
            onClick={onManualCommit}
            className={cn(
              "gap-2 border-0 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]",
              themeGold
                ? "bg-linear-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 shadow-rose-500/30"
                : "bg-linear-to-r from-fuchsia-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 shadow-fuchsia-500/30",
            )}
          >
            <GitCommit className="size-4 shrink-0" />
            <span className="flex flex-col items-start leading-tight">
              <span>git commit -m "wip"</span>
              <span className="text-[10px] opacity-60 font-mono tabular-nums">
                +{formatNumber(manualLocPerClick)} LoC / click
              </span>
            </span>
          </Button>
        </div>

        {/* Prestige button — only once Unicorn milestone is unlocked */}
        {prestigeReady && (
          <button
            onClick={onPrestige}
            className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg border border-orange-500/50 bg-orange-500/15 hover:bg-orange-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="text-sm font-bold text-orange-300">
              🦀 Rewrite in Rust
            </span>
            <span className="text-[10px] text-orange-300/60 font-mono tabular-nums">
              +{crystalsPreview} 🦀 crystals
            </span>
          </button>
        )}

        {/* Milestone badges row */}
        <div className="flex flex-wrap gap-1 justify-center max-w-80">
          {state.milestonesUnlocked.map((id) => {
            const m = milestones.find((x) => x.id === id);
            if (!m) return null;
            return (
              <span
                key={id}
                className={cn(
                  "text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                  m.impact === "huge" &&
                    "bg-amber-500/20 border-amber-500/50 text-amber-300",
                  m.impact === "large" &&
                    "bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300",
                  m.impact === "medium" &&
                    "bg-blue-500/20 border-blue-500/40 text-blue-300",
                  m.impact === "small" &&
                    "bg-zinc-500/20 border-zinc-500/40 text-zinc-300",
                )}
              >
                {m.title}
              </span>
            );
          })}
        </div>
      </div>

      {/* Unicorn cameo */}
      {showUnicorn && (
        <div className="absolute bottom-4 right-4 text-5xl pointer-events-none animate-bounce">
          🦄
        </div>
      )}
    </div>
  );
}
