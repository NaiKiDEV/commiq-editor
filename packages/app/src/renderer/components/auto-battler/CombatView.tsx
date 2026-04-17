import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  Play,
  Pause,
  FastForward,
  SkipForward,
  ChevronRight,
  Heart,
  Zap,
} from "lucide-react";
import type {
  AutoBattlerRun,
  CombatSnapshot,
  CombatantSnapshot,
  CombatEvent,
  GameAction,
  GameSettings,
  UnitDef,
} from "../../../shared/auto-battler-types";
import { SpeedSelector, StatBar, TIER_COLORS, TIER_GLOW } from "./shared";

const SPEED_MS: Record<GameSettings["combatSpeed"], number> = {
  instant: 0,
  fast: 80,
  normal: 240,
  slow: 500,
};

const BASE_INCOME = 5;
const INTEREST_RATE = 0.1;
const INTEREST_CAP = 5;
const STREAK_BONUSES: Record<number, number> = { 2: 1, 3: 2, 4: 3 };

function computeRoundGold(run: AutoBattlerRun): number {
  const interest = Math.min(Math.floor(run.gold * INTEREST_RATE), INTEREST_CAP);
  const streakCount = Math.min(4, Math.max(run.winStreak, run.loseStreak));
  const streak = streakCount >= 2 ? (STREAK_BONUSES[streakCount] ?? 0) : 0;
  const combatGold = run.combatResult?.goldEarned ?? 0;
  return BASE_INCOME + interest + streak + combatGold;
}

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

  // Build a name lookup from the first snapshot for event descriptions
  const nameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (snapshots.length > 0) {
      for (const c of snapshots[0].combatants) {
        map[c.instanceId] = c.name;
      }
    }
    return map;
  }, [snapshots]);

  if (!result || !snapshot) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Simulating combat...
      </div>
    );
  }

  const players = snapshot.combatants.filter((c) => c.side === "player");
  const enemies = snapshot.combatants.filter((c) => c.side === "enemy");

  // Progress bar for tick timeline
  const tickPct = total > 1 ? (tick / (total - 1)) * 100 : 100;

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Wave {run.wave}</span>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            Tick {snapshot.tick}/{snapshots[total - 1]?.tick ?? 0}
          </span>
        </div>
        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden mx-2">
          <div
            className="h-full bg-white/20 transition-[width] duration-100 rounded-full"
            style={{ width: `${tickPct}%` }}
          />
        </div>
        <SpeedSelector
          value={combatSpeed}
          onChange={(s) =>
            dispatch({ type: "UPDATE_SETTINGS", settings: { combatSpeed: s } })
          }
        />
      </div>

      {/* Battlefield: enemies on top, players on bottom */}
      <Battlefield
        enemies={enemies}
        players={players}
        unitMap={unitMap}
        events={snapshot.events}
        finished={finished}
        winnerLabel={winnerLabel}
        result={result}
        roundGold={computeRoundGold(run)}
      />

      {/* Event feed */}
      <EventFeed snapshots={snapshots} tick={tick} nameMap={nameMap} />

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

type AttackLine = { sourceId: string; targetId: string };
type CasterSet = Set<string>;

function Battlefield({
  enemies,
  players,
  unitMap,
  events,
  finished,
  winnerLabel,
  result,
  roundGold,
}: {
  enemies: CombatantSnapshot[];
  players: CombatantSnapshot[];
  unitMap: Record<string, UnitDef>;
  events: CombatEvent[];
  finished: boolean;
  winnerLabel: string;
  result: import("../../../shared/auto-battler-types").CombatResult | null;
  roundGold: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number }[]
  >([]);

  // Extract attack lines and ability casters from current tick events
  const attacks: AttackLine[] = [];
  const casters: CasterSet = new Set();
  for (const e of events) {
    if (e.type === "attack")
      attacks.push({ sourceId: e.sourceId, targetId: e.targetId });
    if (e.type === "ability") casters.add(e.sourceId);
  }

  // Compute SVG line positions after render
  useLayoutEffect(() => {
    if (!containerRef.current || attacks.length === 0) {
      setLines([]);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const newLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const atk of attacks) {
      const srcEl = containerRef.current.querySelector(
        `[data-unit-id="${atk.sourceId}"]`,
      );
      const tgtEl = containerRef.current.querySelector(
        `[data-unit-id="${atk.targetId}"]`,
      );
      if (srcEl && tgtEl) {
        const sr = srcEl.getBoundingClientRect();
        const tr = tgtEl.getBoundingClientRect();
        newLines.push({
          x1: sr.left + sr.width / 2 - rect.left,
          y1: sr.top + sr.height / 2 - rect.top,
          x2: tr.left + tr.width / 2 - rect.left,
          y2: tr.top + tr.height / 2 - rect.top,
        });
      }
    }
    setLines(newLines);
  }, [events]);

  return (
    <div
      className="flex-1 flex flex-col justify-center gap-4 relative"
      ref={containerRef}
    >
      {/* SVG targeting lines overlay */}
      {lines.length > 0 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="rgba(239, 68, 68, 0.35)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          ))}
        </svg>
      )}

      <div className="h-8 flex items-center justify-center">
        {finished ? (
          <span
            className={cn(
              "text-2xl font-bold tracking-wide",
              result?.winner === "player" && "text-emerald-400",
              result?.winner === "enemy" && "text-red-400",
              result?.winner !== "player" &&
                result?.winner !== "enemy" &&
                "text-zinc-300",
            )}
          >
            {winnerLabel}
            {result?.winner === "player" && roundGold > 0 && (
              <span className="ml-2 text-base font-semibold text-amber-400/80">
                +{roundGold} 💰
              </span>
            )}
            {result?.winner === "enemy" && result.damageToServer > 0 && (
              <span className="ml-2 text-base font-semibold text-red-400/80">
                −{result.damageToServer} HP
              </span>
            )}
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40">
            Enemies
          </span>
        )}
      </div>
      <BattleRow
        combatants={enemies}
        unitMap={unitMap}
        side="enemy"
        casters={casters}
      />
      <div className="border-t border-dashed border-white/8 mx-8" />
      <BattleRow
        combatants={players}
        unitMap={unitMap}
        side="player"
        casters={casters}
      />
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 text-center">
        Your Stack
      </div>
    </div>
  );
}

function BattleRow({
  combatants,
  unitMap,
  side,
  casters,
}: {
  combatants: CombatantSnapshot[];
  unitMap: Record<string, UnitDef>;
  side: "player" | "enemy";
  casters: CasterSet;
}) {
  const sorted = [...combatants].sort(
    (a, b) => a.row * 10 + a.col - (b.row * 10 + b.col),
  );
  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      {sorted.map((c) => {
        const def = unitMap[c.unitDefId];
        const tier = def?.tier ?? 1;
        const hpPct = c.maxHp > 0 ? Math.round((c.hp / c.maxHp) * 100) : 0;
        const isCasting = casters.has(c.instanceId);
        return (
          <div
            key={c.instanceId}
            data-unit-id={c.instanceId}
            className={cn(
              "relative w-20 rounded-lg border-2 flex flex-col items-center p-1.5 gap-0.5 transition-all duration-500",
              TIER_COLORS[tier],
              TIER_GLOW[tier],
              "shadow-md",
              !c.alive && "opacity-15 grayscale scale-90",
              side === "enemy" && "border-red-500/40",
              c.stunned && "ring-2 ring-yellow-400",
              isCasting &&
                "ring-2 ring-fuchsia-400 shadow-fuchsia-400/40 shadow-lg",
            )}
          >
            {/* Star badge */}
            {c.starLevel > 1 && (
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[9px] text-amber-400 bg-black/70 rounded-full px-1">
                {"★".repeat(c.starLevel)}
              </div>
            )}
            {/* Shield badge */}
            {c.shield > 0 && (
              <div className="absolute -top-1.5 -right-1.5 text-[9px] text-cyan-300 font-bold bg-black/70 rounded-full px-1">
                🛡{c.shield}
              </div>
            )}

            {/* Emoji */}
            <div className="text-2xl leading-none mt-0.5">{c.emoji}</div>

            {/* Name */}
            <div className="mt-1 text-[9px] font-medium text-foreground/80 truncate w-full text-center leading-tight">
              {c.name}
            </div>

            {/* HP bar + number */}
            <div className="w-full flex items-center gap-1">
              <StatBar
                current={c.hp}
                max={c.maxHp}
                color={hpPct > 30 ? "bg-emerald-500" : "bg-red-500"}
                height="h-1.5"
              />
              <span className="text-[8px] tabular-nums text-red-300/80 min-w-5 text-right">
                {c.hp}
              </span>
            </div>

            {/* Mana bar + number */}
            {c.maxMana > 0 && (
              <div className="w-full flex items-center gap-1">
                <StatBar
                  current={c.mana}
                  max={c.maxMana}
                  color="bg-blue-400"
                  height="h-1"
                />
                <span className="text-[8px] tabular-nums text-blue-300/80 min-w-5 text-right">
                  {c.mana}
                </span>
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
  nameMap,
}: {
  snapshots: CombatSnapshot[];
  tick: number;
  nameMap: Record<string, string>;
}) {
  const MAX_LINES = 6;
  const LINE_HEIGHT_PX = 18;
  const recent = snapshots.slice(Math.max(0, tick - 5), tick + 1);
  const lines: string[] = [];
  for (const s of recent) {
    for (const e of s.events) {
      lines.push(describeEvent(e, s.tick, nameMap));
    }
  }
  const tail = lines.slice(-MAX_LINES);
  return (
    <div
      className="px-2 py-1 rounded-lg bg-white/3 border border-white/6 text-[11px] font-mono overflow-hidden flex flex-col-reverse"
      style={{ height: `${MAX_LINES * LINE_HEIGHT_PX + 8}px` }}
    >
      {tail.length === 0 && (
        <div
          className="text-muted-foreground/50 italic"
          style={{
            height: `${LINE_HEIGHT_PX}px`,
            lineHeight: `${LINE_HEIGHT_PX}px`,
          }}
        >
          Waiting for combat…
        </div>
      )}
      {tail
        .slice()
        .reverse()
        .map((l, i) => (
          <div
            key={`${tick}-${i}`}
            className="truncate text-muted-foreground"
            style={{
              height: `${LINE_HEIGHT_PX}px`,
              lineHeight: `${LINE_HEIGHT_PX}px`,
            }}
          >
            {l}
          </div>
        ))}
    </div>
  );
}

function n(nameMap: Record<string, string>, id: string): string {
  return nameMap[id] ?? id.slice(0, 6);
}

function describeEvent(
  e: CombatEvent,
  tick: number,
  nameMap: Record<string, string>,
): string {
  const t = `[T${tick}]`;
  switch (e.type) {
    case "attack":
      return `${t} ⚔️ ${n(nameMap, e.sourceId)} → ${n(nameMap, e.targetId)} (-${e.damage})`;
    case "ability":
      return `${t} ✨ ${n(nameMap, e.sourceId)} cast ${e.abilityId}`;
    case "death":
      return `${t} 💀 ${n(nameMap, e.unitId)} died`;
    case "heal":
      return `${t} 💚 ${n(nameMap, e.targetId)} healed ${e.value}`;
    case "shield":
      return `${t} 🛡 ${n(nameMap, e.targetId)} +${e.value} shield`;
    case "buff_applied":
      return `${t} ⬆ ${n(nameMap, e.targetId)} ${e.stat} +${e.value}`;
    case "debuff_applied":
      return `${t} ⬇ ${n(nameMap, e.targetId)} ${e.stat} -${e.value}`;
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
