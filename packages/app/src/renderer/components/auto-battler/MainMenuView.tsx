import { Swords, Trash2, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import type { AutoBattlerMeta } from "../../../shared/auto-battler-types";

export function MainMenuView({
  meta,
  onStartRun,
  onOpenProgression,
  onResetSave,
}: {
  meta: AutoBattlerMeta;
  onStartRun: () => void;
  onOpenProgression: () => void;
  onResetSave: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-xl w-full p-8 space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-br from-amber-300 via-rose-400 to-fuchsia-500 bg-clip-text text-transparent">
            Deploy &amp; Pray
          </h1>
          <p className="text-sm text-muted-foreground">
            A dev-themed auto-battler roguelite. Build your stack. Defend the server.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 text-sm">
          <Stat label="Runs" value={meta.totalRuns} />
          <Stat label="Best Wave" value={meta.bestWave} />
          <Stat label="Kills" value={meta.totalKills} />
          <Stat label="Souls" value={meta.souls} accent />
        </div>

        <div className="space-y-2">
          <Button
            onClick={onStartRun}
            size="lg"
            className="w-full gap-2 text-base"
          >
            <Swords className="size-4" />
            Start New Run
          </Button>
          <Button
            onClick={onOpenProgression}
            variant="outline"
            className="w-full gap-2"
          >
            <Sparkles className="size-4" />
            Progression Tree ({meta.progressionNodes.length} unlocked)
          </Button>
          <Button
            onClick={onResetSave}
            variant="ghost"
            size="sm"
            className="w-full gap-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" />
            Reset Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border">
      <div
        className={`text-2xl font-bold tabular-nums ${
          accent ? "text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
