import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  Heart,
  Coins,
  DoorOpen,
  Sparkles,
} from "lucide-react";
import type {
  AutoBattlerRun,
  EventChoice,
  GameAction,
  WaveDef,
} from "../../../shared/auto-battler-types";

type Dispatch = (action: GameAction) => Promise<unknown>;

const CHOICE_COLORS: Record<string, string> = {
  gold: "border-amber-500/50 bg-amber-900/20 hover:bg-amber-900/30 hover:border-amber-400",
  free_reroll_permanent:
    "border-blue-500/50 bg-blue-900/20 hover:bg-blue-900/30 hover:border-blue-400",
  sacrifice_unit_for_relic:
    "border-purple-500/50 bg-purple-900/20 hover:bg-purple-900/30 hover:border-purple-400",
  server_damage_for_gold:
    "border-red-500/50 bg-red-900/20 hover:bg-red-900/30 hover:border-red-400",
  server_damage_for_rerolls:
    "border-red-500/50 bg-red-900/20 hover:bg-red-900/30 hover:border-red-400",
  heal: "border-green-500/50 bg-green-900/20 hover:bg-green-900/30 hover:border-green-400",
  upgrade_random_unit:
    "border-cyan-500/50 bg-cyan-900/20 hover:bg-cyan-900/30 hover:border-cyan-400",
  shop_discount_permanent:
    "border-emerald-500/50 bg-emerald-900/20 hover:bg-emerald-900/30 hover:border-emerald-400",
  reduce_income_permanent:
    "border-orange-500/50 bg-orange-900/20 hover:bg-orange-900/30 hover:border-orange-400",
  lose_shop_slot_permanent:
    "border-rose-500/50 bg-rose-900/20 hover:bg-rose-900/30 hover:border-rose-400",
  increase_reroll_cost_permanent:
    "border-yellow-500/50 bg-yellow-900/20 hover:bg-yellow-900/30 hover:border-yellow-400",
  downgrade_random_unit:
    "border-pink-500/50 bg-pink-900/20 hover:bg-pink-900/30 hover:border-pink-400",
};

export function EventView({
  run,
  dispatch,
  wave,
}: {
  run: AutoBattlerRun;
  dispatch: Dispatch;
  wave: WaveDef | undefined;
}) {
  const choices = run.pendingEventChoice;
  if (!choices) return null;

  const waveType = wave?.type ?? "event";
  const isEvent = waveType === "event";
  const isSacrifice = waveType === "sacrifice";

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-3xl">
            {isSacrifice ? "🔧" : "🎪"}
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {wave?.name ?? (isSacrifice ? "Sacrifice" : "Event")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSacrifice
              ? "A risky opportunity presents itself. Choose wisely — every deal has a cost."
              : "A moment of calm in the storm. Pick one option to help your run."}
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Coins className="size-3 text-amber-400" />
              {run.gold}g
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3 text-red-400" />
              {run.serverHp}/{run.maxServerHp} HP
            </span>
          </div>
        </div>

        {/* Choices */}
        <div className="grid grid-cols-1 gap-3">
          {choices.map((choice, idx) => (
            <EventChoiceCard
              key={choice.id}
              choice={choice}
              onPick={() =>
                dispatch({ type: "RESOLVE_EVENT_CHOICE", choiceIndex: idx })
              }
            />
          ))}
        </div>

        {/* End run button */}
        <div className="flex justify-center pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (
                confirm("End this run? You'll keep any souls earned so far.")
              ) {
                dispatch({ type: "END_RUN" });
              }
            }}
            className="gap-1.5 text-muted-foreground hover:text-red-400"
          >
            <DoorOpen className="size-3.5" />
            End Run
          </Button>
        </div>
      </div>
    </div>
  );
}

function EventChoiceCard({
  choice,
  onPick,
}: {
  choice: EventChoice;
  onPick: () => void;
}) {
  const colorClass =
    CHOICE_COLORS[choice.effect.type] ??
    "border-zinc-500/50 bg-zinc-900/20 hover:bg-zinc-900/30";

  return (
    <button
      onClick={onPick}
      className={cn(
        "w-full rounded-lg border-2 p-4 flex items-start gap-4 text-left transition-all cursor-pointer",
        colorClass,
      )}
    >
      <span className="text-3xl leading-none mt-0.5">{choice.emoji}</span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-semibold text-sm text-foreground">
          {choice.name}
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed">
          {choice.description}
        </div>
      </div>
      <Sparkles className="size-4 text-muted-foreground/50 mt-1 shrink-0" />
    </button>
  );
}
