import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AutoBattlerSave,
  EnemyDef,
  GameAction,
  ProgressionNode,
  RelicDef,
  SynergyDef,
  UnitDef,
  WaveDef,
} from "../../shared/auto-battler-types";
import { MainMenuView } from "./auto-battler/MainMenuView";
import { DraftView } from "./auto-battler/DraftView";
import { CombatView } from "./auto-battler/CombatView";
import { ProgressionView } from "./auto-battler/ProgressionView";
import { TooltipProvider } from "./ui/tooltip";

type AutoBattlerConfig = {
  units: UnitDef[];
  unitMap: Record<string, UnitDef>;
  enemies: EnemyDef[];
  enemyMap: Record<string, EnemyDef>;
  synergies: SynergyDef[];
  synergyMap: Record<string, SynergyDef>;
  relics: RelicDef[];
  relicMap: Record<string, RelicDef>;
  waves: WaveDef[];
  maxWave: number;
  progression: ProgressionNode[];
};

type ElectronAutoBattler = {
  getSave: () => Promise<AutoBattlerSave>;
  dispatch: (action: GameAction) => Promise<AutoBattlerSave>;
  resetSave: () => Promise<AutoBattlerSave>;
  getConfig: () => Promise<AutoBattlerConfig>;
  onStateChanged: (cb: (save: AutoBattlerSave) => void) => () => void;
};

function getApi(): ElectronAutoBattler {
  return (
    window.electronAPI as unknown as { autoBattler: ElectronAutoBattler }
  ).autoBattler;
}

export function AutoBattlerPanel({ panelId: _panelId }: { panelId: string }) {
  const [save, setSave] = useState<AutoBattlerSave | null>(null);
  const [config, setConfig] = useState<AutoBattlerConfig | null>(null);
  const [showProgression, setShowProgression] = useState(false);
  const [loading, setLoading] = useState(true);

  const dispatch = useCallback(async (action: GameAction) => {
    const api = getApi();
    const next = await api.dispatch(action);
    setSave(next);
    return next;
  }, []);

  useEffect(() => {
    const api = getApi();
    let cancelled = false;
    Promise.all([api.getSave(), api.getConfig()]).then(([s, c]) => {
      if (cancelled) return;
      setSave(s);
      setConfig(c);
      setLoading(false);
    });
    const off = api.onStateChanged((next) => {
      if (!cancelled) setSave(next);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const waveDef = useMemo<WaveDef | undefined>(() => {
    if (!save?.activeRun || !config) return undefined;
    return config.waves.find((w) => w.wave === save.activeRun!.wave);
  }, [save, config]);

  if (loading || !save || !config) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading Deploy &amp; Pray…
      </div>
    );
  }

  const content = (() => {
    if (showProgression) {
      return (
        <ProgressionView
          meta={save.meta}
          nodes={config.progression}
          onBack={() => setShowProgression(false)}
          dispatch={dispatch}
        />
      );
    }

    const run = save.activeRun;
    if (!run) {
      return (
        <MainMenuView
          meta={save.meta}
          onStartRun={() => dispatch({ type: "START_RUN" })}
          onOpenProgression={() => setShowProgression(true)}
          onResetSave={() => {
            if (confirm("Reset all progress? This cannot be undone.")) {
              getApi()
                .resetSave()
                .then((s) => setSave(s));
            }
          }}
        />
      );
    }

    if (run.phase === "draft") {
      return (
        <DraftView
          run={run}
          dispatch={dispatch}
          unitMap={config.unitMap}
          synergyMap={config.synergyMap}
          relicMap={config.relicMap}
          wave={waveDef}
          combatSpeed={save.settings.combatSpeed}
        />
      );
    }

    return (
      <CombatView
        run={run}
        dispatch={dispatch}
        unitMap={config.unitMap}
        combatSpeed={save.settings.combatSpeed}
      />
    );
  })();

  return <TooltipProvider delay={150}>{content}</TooltipProvider>;
}
