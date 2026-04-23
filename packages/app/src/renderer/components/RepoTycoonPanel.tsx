import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RepoTycoonAction,
  RepoTycoonConfigPayload,
  RepoTycoonState,
} from "../../shared/repo-tycoon-types";
import { TooltipProvider } from "./ui/tooltip";
import { Button } from "./ui/button";
import { Pipeline } from "./repo-tycoon/Pipeline";
import { SideResources } from "./repo-tycoon/SideResources";
import { CanvasView } from "./repo-tycoon/CanvasView";
import { UpgradesSidebar } from "./repo-tycoon/UpgradesSidebar";
import { EventTicker } from "./repo-tycoon/EventTicker";
import { formatNumber, computeEffectiveRates } from "./repo-tycoon/shared";
import { RotateCcw } from "lucide-react";

type ElectronRepoTycoon = {
  getState: () => Promise<RepoTycoonState>;
  dispatch: (action: RepoTycoonAction) => Promise<RepoTycoonState>;
  reset: () => Promise<RepoTycoonState>;
  getConfig: () => Promise<RepoTycoonConfigPayload>;
  onStateChanged: (cb: (state: RepoTycoonState) => void) => () => void;
};

function getApi(): ElectronRepoTycoon {
  return (
    window.electronAPI as unknown as { repoTycoon: ElectronRepoTycoon }
  ).repoTycoon;
}

const TICK_INTERVAL_MS = 250;

export function RepoTycoonPanel({ panelId: _panelId }: { panelId: string }) {
  const [state, setState] = useState<RepoTycoonState | null>(null);
  const [config, setConfig] = useState<RepoTycoonConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // On-screen rate indicators derived from sliding-window deltas.
  // lifetimeLoc monotonically increases so LoC/sec stays accurate even while the pool drains.
  const rateRef = useRef<{
    at: number;
    lifetimeLoc: number;
    stars: number;
  } | null>(null);
  const [rates, setRates] = useState({ locPerSec: 0, starsPerSec: 0 });

  const dispatch = useCallback(async (action: RepoTycoonAction) => {
    const api = getApi();
    const next = await api.dispatch(action);
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    const api = getApi();
    let cancelled = false;
    Promise.all([api.getState(), api.getConfig()]).then(([s, c]) => {
      if (cancelled) return;
      setState(s);
      setConfig(c);
      setLoading(false);
    });
    const off = api.onStateChanged((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Drive the simulation by dispatching TICK every 250ms while panel is mounted.
  useEffect(() => {
    if (loading || !state) return;
    const id = setInterval(() => {
      void dispatch({ type: "TICK", now: Date.now() });
      setNow(Date.now());
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loading, state, dispatch]);

  useEffect(() => {
    if (!state) return;
    const at = Date.now();
    const prev = rateRef.current;
    if (prev) {
      const dt = (at - prev.at) / 1000;
      if (dt >= 0.5) {
        const dLoc = Math.max(0, state.stats.lifetimeLoc - prev.lifetimeLoc);
        const dStars = Math.max(0, state.resources.stars - prev.stars);
        setRates({ locPerSec: dLoc / dt, starsPerSec: dStars / dt });
        rateRef.current = {
          at,
          lifetimeLoc: state.stats.lifetimeLoc,
          stars: state.resources.stars,
        };
      }
    } else {
      rateRef.current = {
        at,
        lifetimeLoc: state.stats.lifetimeLoc,
        stars: state.resources.stars,
      };
    }
  }, [state]);

  const unlockedFlags = useMemo(() => {
    if (!state || !config) return new Set<string>();
    const flags = new Set<string>();
    for (const id of state.milestonesUnlocked) {
      const m = config.milestones.find((x) => x.id === id);
      if (!m) continue;
      for (const f of m.flags) flags.add(f);
    }
    return flags;
  }, [state, config]);

  const [commitFlashKey, setCommitFlashKey] = useState(0);

  const manualLocPerClick = useMemo(() => {
    if (!state || !config) return 2;
    return computeEffectiveRates(state, config).manualCommitLoc;
  }, [state, config]);

  const onManualCommit = useCallback(() => {
    void dispatch({ type: "MANUAL_COMMIT" });
    setCommitFlashKey((k) => k + 1);
  }, [dispatch]);

  const onBuyUpgrade = useCallback(
    (upgradeId: string) => {
      void dispatch({ type: "BUY_UPGRADE", upgradeId });
    },
    [dispatch],
  );

  const onBuyPrestigeUpgrade = useCallback(
    (upgradeId: string) => {
      void dispatch({ type: "BUY_PRESTIGE_UPGRADE", upgradeId });
    },
    [dispatch],
  );

  const onPrestige = useCallback(async () => {
    const stars = state?.lifetimeResources?.stars ?? 0;
    const crystalsPreview = Math.min(30, 5 + Math.floor(stars / 200_000));
    const confirmed = window.confirm(
      `🦀 Rewrite in Rust?\n\nThis resets your entire run (resources, upgrades, milestones) but you KEEP your Sponsors and Prestige upgrades.\n\nYou'll earn ${crystalsPreview} 🦀 Crystals which can be spent on permanent Prestige upgrades in the Goals tab.`,
    );
    if (!confirmed) return;
    const next = await dispatch({ type: "PRESTIGE" });
    rateRef.current = null;
    setRates({ locPerSec: 0, starsPerSec: 0 });
    setState(next);
  }, [dispatch, state]);

  const onReset = useCallback(async () => {
    const confirmed = window.confirm(
      "Reset Repo Tycoon? All progress will be lost.",
    );
    if (!confirmed) return;
    const api = getApi();
    const next = await api.reset();
    setState(next);
    rateRef.current = null;
    setRates({ locPerSec: 0, starsPerSec: 0 });
  }, []);

  if (loading || !state || !config) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading Repo Tycoon…
      </div>
    );
  }

  const unlocked = new Set(state.milestonesUnlocked);
  const hasSponsors =
    unlocked.has("corporate-sponsors") || unlocked.has("unicorn");

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full flex flex-col gap-3 p-3 relative bg-background text-foreground text-sm">
        {/* Header row: gradient title + side resources + reset */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight bg-linear-to-br from-amber-300 via-rose-400 to-fuchsia-500 bg-clip-text text-transparent leading-tight">
              Repo Tycoon
            </h1>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              lifetime LoC written:{" "}
              <span className="font-mono tabular-nums text-foreground/70">
                {formatNumber(state.stats.lifetimeLoc)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SideResources state={state} sponsorsUnlocked={hasSponsors} />
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="gap-1.5 border-white/8 bg-white/2 hover:bg-white/5 text-xs"
            >
              <RotateCcw className="size-3" />
              Reset
            </Button>
          </div>
        </div>

        {/* Production pipeline: LoC → Commits → PRs → Stars */}
        <Pipeline
          state={state}
          config={config}
          locPerSec={rates.locPerSec}
          starsPerSec={rates.starsPerSec}
        />

        {/* Main split: canvas + sidebar */}
        <div className="flex-1 grid grid-cols-[1fr_300px] gap-3 min-h-0">
          <CanvasView
            state={state}
            milestones={config.milestones}
            flags={unlockedFlags}
            onManualCommit={onManualCommit}
            commitFlashKey={commitFlashKey}
            manualLocPerClick={manualLocPerClick}
            onPrestige={onPrestige}
          />
          <div className="h-full min-h-0">
            <UpgradesSidebar
              state={state}
              upgrades={config.upgrades}
              milestones={config.milestones}
              prestigeUpgrades={config.prestigeUpgrades}
              onBuyUpgrade={onBuyUpgrade}
              onBuyPrestigeUpgrade={onBuyPrestigeUpgrade}
            />
          </div>
        </div>

        {/* Event ticker */}
        <EventTicker state={state} events={config.events} now={now} />
      </div>
    </TooltipProvider>
  );
}
