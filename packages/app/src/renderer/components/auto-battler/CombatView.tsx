import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Play, Pause, FastForward, SkipForward, ChevronRight } from "lucide-react";
import type {
  AutoBattlerRun,
  CombatSnapshot,
  CombatantSnapshot,
  GameAction,
  GameSettings,
  UnitDef,
} from "../../../shared/auto-battler-types";
import { SpeedSelector, StatBar, TIER_COLORS } from "./shared";

const SPEED_MS: Record<GameSettings["combatSpeed"], number> = {
  instant: 0,
  fast: 80,
  normal: 240,
};

type Dispatch = (action: GameAction) => Promise<unknown>;

export function CombatView({
  run,
  dispatch,
  unitMap,
  combatSpeed,
}: {
  run: AutoBattlerRun;
  dispatch: Dispatch;
  unitMap: Record<string, UnitDef>;
  combatSpeed: GameSettings["combatSpeed"];
}) {
  const result = run.combatResult;
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshots = result?.snapshots ?? [];
  const total = snapshots.length;

  useEffect(() => {
    setTick(0);
    setPlaying(true);
  }, [result]);

  useEffect(() => {
    if (!playing || total === 0) return;
    if (tick >= total - 1) {
      setPlaying(false);
      return;
    }
    const ms = SPEED_MS[combatSpeed];
    if (ms === 0) {
      setTick(total - 1);
      setPlaying(false);
      return;
    }
    timerRef.current = setTimeout(() => setTick((t) => t + 1), ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tick, playing, total, combatSpeed]);

  const snapshot: CombatSnapshot | undefined = snapshots[tick];

  const finished = tick >= total - 1;
  const winnerLabel = useMemo(() => {
    if (!result) return "";
    if (result.winner === "player") return "🎉 Victory";
    if (result.winner === "enemy") return "💀 Defeat";
    return "🤝 Draw";
  }, [result]);

  if (!result || !snapshot) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Simulating combat...
      </div>
    );
  }

  const players = snapshot.combatants.filter((c) => c.side === "player");
  const enemies = snapshot.combatants.filter((c) => c.side === "enemy");

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Status */}
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold">Wave {run.wave}</div>
        <div className="text-xs text-muted-foreground">
          Tick {snapshot.tick} / {snapshots[total - 1]?.tick ?? 0}
        </div>
        <div className="flex-1" />
        <SpeedSelector
          value={combatSpeed}
          onChange={(s) =>
            dispatch({ type: "UPDATE_SETTINGS", settings: { combatSpeed: s } })
          }
        />
        {finished && (
          <div className="text-sm font-bold">{winnerLabel}</div>
        )}
      </div>

      {/* Battlefield: enemies on top, players on bottom */}
      <div className="flex-1 flex flex-col justify-center gap-6">
        <BattleRow combatants={enemies} unitMap={unitMap} side="enemy" />
        <div className="border-t-2 border-dashed border-border/60" />
        <BattleRow combatants={players} unitMap={unitMap} side="player" />
      </div>

      {/* Event feed */}
      <EventFeed snapshots={snapshots} tick={tick} />

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPlaying((p) => !p)}
          disabled={finished}
          className="gap-1"
        >
          {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setTick(total - 1)}
          disabled={finished}
          className="gap-1"
        >
          <FastForward className="size-3" />
          Skip
        </Button>

        <div className="flex-1" />

        {finished && run.phase === "combat_result" && (
          <Button
            onClick={() => dispatch({ type: "NEXT_ROUND" })}
            size="sm"
            className="gap-1.5"
          >
            <ChevronRight className="size-4" />
            Next Round
          </Button>
        )}
        {finished && run.phase === "game_over" && (
          <Button
            onClick={() => dispatch({ type: "NEXT_ROUND" })}
            size="sm"
            variant="destructive"
            className="gap-1.5"
          >
            <SkipForward className="size-4" />
            End Run (+souls)
          </Button>
        )}
        {finished && run.phase === "victory" && (
          <Button
            onClick={() => dispatch({ type: "NEXT_ROUND" })}
            size="sm"
            className="gap-1.5"
          >
            <SkipForward className="size-4" />
            Claim Victory
          </Button>
        )}
      </div>
    </div>
  );
}

function BattleRow({
  combatants,
  unitMap,
  side,
}: {
  combatants: CombatantSnapshot[];
  unitMap: Record<string, UnitDef>;
  side: "player" | "enemy";
}) {
  // Sort roughly by row/col for stable placement. Enemies flipped vertically.
  const sorted = [...combatants].sort(
    (a, b) => a.row * 10 + a.col - (b.row * 10 + b.col),
  );
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {sorted.map((c) => {
        const def = unitMap[c.unitDefId];
        const tier = def?.tier ?? 1;
        return (
          <div
            key={c.instanceId}
            className={cn(
              "relative size-16 rounded-md border-2 flex flex-col items-center justify-center p-0.5 transition-all",
              TIER_COLORS[tier],
              !c.alive && "opacity-20 grayscale",
              side === "enemy" && "border-red-500/40",
              c.stunned && "ring-2 ring-yellow-400",
            )}
            title={`${c.name} (${c.hp}/${c.maxHp} HP, ${c.mana}/${c.maxMana} MP)`}
          >
            <div className="text-2xl leading-none">{c.emoji}</div>
            <div className="absolute bottom-0.5 left-0.5 right-0.5 flex flex-col gap-px">
              <StatBar current={c.hp} max={c.maxHp} color="bg-red-500" />
              {c.maxMana > 0 && (
                <StatBar current={c.mana} max={c.maxMana} color="bg-blue-400" />
              )}
            </div>
            {c.shield > 0 && (
              <div className="absolute top-0 right-0 text-[9px] text-cyan-300 font-bold bg-black/60 rounded px-0.5">
                🛡{c.shield}
              </div>
            )}
            {c.starLevel > 1 && (
              <div className="absolute top-0 left-0 text-[9px] text-amber-400 bg-black/60 rounded px-0.5">
                {"★".repeat(c.starLevel)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventFeed({
  snapshots,
  tick,
}: {
  snapshots: CombatSnapshot[];
  tick: number;
}) {
  const MAX_LINES = 6;
  const LINE_HEIGHT_PX = 18;
  // Show recent events from past ticks including current
  const recent = snapshots.slice(Math.max(0, tick - 5), tick + 1);
  const lines: string[] = [];
  for (const s of recent) {
    for (const e of s.events) {
      lines.push(describeEvent(e, s.tick));
    }
  }
  const tail = lines.slice(-MAX_LINES);
  return (
    <div
      className="px-2 py-1 rounded-md bg-muted/10 border border-border text-[11px] font-mono overflow-hidden flex flex-col-reverse"
      style={{ height: `${MAX_LINES * LINE_HEIGHT_PX + 8}px` }}
    >
      {tail.length === 0 && (
        <div
          className="text-muted-foreground italic"
          style={{ height: `${LINE_HEIGHT_PX}px`, lineHeight: `${LINE_HEIGHT_PX}px` }}
        >
          No events yet…
        </div>
      )}
      {tail
        .slice()
        .reverse()
        .map((l, i) => (
          <div
            key={`${tick}-${i}`}
            className="truncate text-muted-foreground"
            style={{ height: `${LINE_HEIGHT_PX}px`, lineHeight: `${LINE_HEIGHT_PX}px` }}
          >
            {l}
          </div>
        ))}
    </div>
  );
}

function describeEvent(
  e: import("../../../shared/auto-battler-types").CombatEvent,
  tick: number,
): string {
  const t = `[T${tick}]`;
  switch (e.type) {
    case "attack":
      return `${t} ⚔️ ${e.sourceId.slice(0, 6)} → ${e.targetId.slice(0, 6)} (-${e.damage})`;
    case "ability":
      return `${t} ✨ ${e.sourceId.slice(0, 6)} cast ${e.abilityId}`;
    case "death":
      return `${t} 💀 ${e.unitId.slice(0, 6)} died`;
    case "heal":
      return `${t} 💚 ${e.targetId.slice(0, 6)} healed ${e.value}`;
    case "shield":
      return `${t} 🛡 ${e.targetId.slice(0, 6)} +${e.value} shield`;
    case "buff_applied":
      return `${t} ⬆ ${e.targetId.slice(0, 6)} ${e.stat} +${e.value}`;
    case "debuff_applied":
      return `${t} ⬇ ${e.targetId.slice(0, 6)} ${e.stat} -${e.value}`;
    case "summon":
      return `${t} 🪄 summoned ${e.unitDefId}`;
    case "synergy_proc":
      return `${t} 🔗 ${e.synergyId}: ${e.description}`;
    case "relic_proc":
      return `${t} 💎 ${e.relicId}: ${e.description}`;
    default:
      return `${t} ?`;
  }
}
