import { Swords, Trash2, Sparkles, Trophy, Skull, Flame } from "lucide-react";
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
    <div className="h-full flex items-center justify-center relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-150 h-150 rounded-full bg-fuchsia-500/4 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-100 h-100 rounded-full bg-amber-500/4 blur-[100px]" />
      </div>

      <div className="relative z-10 flex items-stretch gap-6 max-w-xl w-full px-8">
        {/* Left — branding & actions */}
        <div className="flex-1 flex flex-col justify-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-linear-to-br from-amber-300 via-rose-400 to-fuchsia-500 bg-clip-text text-transparent leading-tight">
              Deploy &amp; Pray
            </h1>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              Build your stack. Defend the server.
              <br />A dev-themed auto-battler roguelite.
            </p>
          </div>

          <div className="space-y-2">
            <Button
              onClick={onStartRun}
              size="lg"
              className="w-full gap-2 text-base bg-linear-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 border-0 shadow-lg shadow-rose-500/20 transition-all hover:shadow-rose-500/30 hover:scale-[1.01] active:scale-[0.99]"
            >
              <Swords className="size-5" />
              Start New Run
            </Button>

            <Button
              onClick={onOpenProgression}
              variant="outline"
              className="w-full gap-2 border-white/8 bg-white/2 hover:bg-white/5 transition-colors"
            >
              <Sparkles className="size-4 text-amber-400" />
              Progression Tree
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {meta.progressionNodes.length} unlocked
              </span>
            </Button>
          </div>

          <button
            onClick={onResetSave}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer self-start"
          >
            <Trash2 className="size-3" />
            Reset Save
          </button>
        </div>

        {/* Divider */}
        <div className="w-px bg-white/6 self-stretch" />

        {/* Right — stats card */}
        <div className="w-40 flex flex-col justify-center gap-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-1 mb-1">
            Career
          </div>
          <StatRow
            icon={<Flame className="size-3.5 text-orange-400" />}
            label="Runs"
            value={meta.totalRuns}
          />
          <StatRow
            icon={<Trophy className="size-3.5 text-emerald-400" />}
            label="Best Wave"
            value={meta.bestWave}
          />
          <StatRow
            icon={<Skull className="size-3.5 text-red-400" />}
            label="Kills"
            value={meta.totalKills}
          />
          <StatRow
            icon={<Sparkles className="size-3.5 text-amber-400" />}
            label="Souls"
            value={meta.souls}
            accent
          />
        </div>
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/3 border border-white/6">
      {icon}
      <div className="flex-1 text-[11px] text-muted-foreground/70">
        {label}
      </div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          accent ? "text-amber-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
