import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import {
  Coins,
  RefreshCw,
  Snowflake,
  Play,
  Heart,
  Flame,
  Skull,
  DoorOpen,
} from "lucide-react";
import type {
  AutoBattlerRun,
  BenchUnit,
  GameAction,
  GameSettings,
  PlacedUnit,
  RelicDef,
  UnitDef,
  SynergyDef,
  WaveDef,
} from "../../../shared/auto-battler-types";
import { ShopCard, SpeedSelector, SynergyBadge, UnitCard } from "./shared";

const SELL_REFUND: Record<1 | 2 | 3, number> = { 1: 1, 2: 3, 3: 9 };
const BASE_INCOME = 5;
const INTEREST_RATE = 0.1;
const INTEREST_CAP = 5;
const STREAK_BONUSES: Record<number, number> = { 2: 1, 3: 2, 4: 3 };

function computeNextRoundGold(run: AutoBattlerRun): {
  base: number;
  interest: number;
  streak: number;
  total: number;
} {
  const base = BASE_INCOME;
  const interest = Math.min(Math.floor(run.gold * INTEREST_RATE), INTEREST_CAP);
  const streakCount = Math.min(4, Math.max(run.winStreak, run.loseStreak));
  const streak = streakCount >= 2 ? (STREAK_BONUSES[streakCount] ?? 0) : 0;
  return { base, interest, streak, total: base + interest + streak };
}

type Dispatch = (action: GameAction) => Promise<unknown>;

export function DraftView({
  run,
  dispatch,
  unitMap,
  synergyMap,
  relicMap,
  wave,
  combatSpeed,
}: {
  run: AutoBattlerRun;
  dispatch: Dispatch;
  unitMap: Record<string, UnitDef>;
  synergyMap: Record<string, SynergyDef>;
  relicMap: Record<string, RelicDef>;
  wave: WaveDef | undefined;
  combatSpeed: GameSettings["combatSpeed"];
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mergedIds, setMergedIds] = useState<Set<string>>(new Set());
  const [equippingRelicId, setEquippingRelicId] = useState<string | null>(null);
  const prevStarsRef = useRef<Map<string, number>>(new Map());

  const canStart = run.board.slots.some((s) => s !== null);

  // Detect merges by tracking star level changes
  useEffect(() => {
    const prev = prevStarsRef.current;
    const next = new Map<string, number>();
    const newMerged = new Set<string>();

    for (const u of run.bench.units) {
      if (prev.has(u.instanceId) && prev.get(u.instanceId)! < u.starLevel) {
        newMerged.add(u.instanceId);
      }
      next.set(u.instanceId, u.starLevel);
    }
    for (const u of run.board.slots) {
      if (!u) continue;
      if (prev.has(u.instanceId) && prev.get(u.instanceId)! < u.starLevel) {
        newMerged.add(u.instanceId);
      }
      next.set(u.instanceId, u.starLevel);
    }

    prevStarsRef.current = next;
    if (newMerged.size > 0) {
      setMergedIds(newMerged);
      const timer = setTimeout(() => setMergedIds(new Set()), 800);
      return () => clearTimeout(timer);
    }
  }, [run.bench.units, run.board.slots]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "r") {
        if (run.freeRerollsAvailable > 0 || run.gold >= run.shop.rerollCost) {
          dispatch({ type: "REROLL_SHOP" });
        }
      } else if (key === "f") {
        dispatch({ type: "FREEZE_SHOP" });
      } else if (key === " ") {
        e.preventDefault();
        if (canStart) dispatch({ type: "START_COMBAT" });
      } else if (key >= "1" && key <= "5") {
        const idx = parseInt(key) - 1;
        const slot = run.shop.available[idx];
        if (slot && !slot.sold && run.gold >= slot.cost) {
          dispatch({ type: "BUY_UNIT", shopIndex: idx });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run, canStart, dispatch]);

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Top bar: gold, hp, wave, end run */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ResourceCard
                icon={<Coins className="size-4 text-amber-400" />}
                label="Gold"
                value={run.gold}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="text-[11px] font-mono space-y-0.5 p-2"
          >
            {(() => {
              const inc = computeNextRoundGold(run);
              return (
                <div className="space-y-0.5">
                  <div className="font-semibold text-xs mb-1">
                    Next Round Income
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Base</span>
                    <span>+{inc.base}g</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Interest (10%)
                    </span>
                    <span>+{inc.interest}g</span>
                  </div>
                  {inc.streak > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Streak</span>
                      <span>+{inc.streak}g</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-0.5 flex justify-between gap-4 font-semibold text-amber-400">
                    <span>Total</span>
                    <span>+{inc.total}g</span>
                  </div>
                </div>
              );
            })()}
          </TooltipContent>
        </Tooltip>
        <ResourceCard
          icon={<Heart className="size-4 text-red-400" />}
          label="Server HP"
          value={`${run.serverHp}/${run.maxServerHp}`}
        />
        <ResourceCard
          icon={
            wave?.isBoss ? (
              <Skull className="size-4 text-fuchsia-400" />
            ) : (
              <Flame className="size-4 text-orange-400" />
            )
          }
          label={`Wave ${run.wave}`}
          value={wave?.name ?? "—"}
        />
        {(run.winStreak > 0 || run.loseStreak > 0) && (
          <ResourceCard
            icon={<span className="text-sm">🔥</span>}
            label={run.winStreak > 0 ? "Win Streak" : "Lose Streak"}
            value={Math.max(run.winStreak, run.loseStreak)}
          />
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (confirm("End this run? You'll keep any souls earned so far.")) {
              dispatch({ type: "END_RUN" });
            }
          }}
          className="gap-1.5 text-muted-foreground hover:text-red-400"
        >
          <DoorOpen className="size-3.5" />
          End Run
        </Button>
      </div>

      {/* Board centered; speed + synergies absolutely pinned right */}
      <div className="flex-1 relative flex items-center justify-center">
        <BoardGridView
          run={run}
          unitMap={unitMap}
          relicMap={relicMap}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          dispatch={dispatch}
          mergedIds={mergedIds}
          equippingRelicId={equippingRelicId}
          onRelicEquipped={() => setEquippingRelicId(null)}
        />
        <div className="absolute right-0 top-0 bottom-0 flex flex-col gap-2 w-55 shrink-0 grow-0 py-1 overflow-y-auto overflow-x-hidden">
          <SpeedSelector
            value={combatSpeed}
            onChange={(s) =>
              dispatch({
                type: "UPDATE_SETTINGS",
                settings: { combatSpeed: s },
              })
            }
          />
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
              Synergies
            </div>
            {run.synergies.length === 0 && (
              <span className="text-xs text-muted-foreground italic px-1">
                Place units to activate synergies
              </span>
            )}
            {run.synergies.map((s) => {
              const def = synergyMap[s.synergyId];
              if (!def) return null;
              return (
                <SynergyBadge
                  key={s.synergyId}
                  synergy={def}
                  unitCount={s.unitCount}
                  activeThreshold={s.activeThreshold}
                />
              );
            })}
          </div>
          {/* Relics */}
          <RelicPanel
            run={run}
            relicMap={relicMap}
            equippingRelicId={equippingRelicId}
            onSelectRelic={(id) =>
              setEquippingRelicId((prev) => (prev === id ? null : id))
            }
            dispatch={dispatch}
          />
        </div>
      </div>

      {/* Bench */}
      <BenchRow
        run={run}
        unitMap={unitMap}
        relicMap={relicMap}
        draggingId={draggingId}
        setDraggingId={setDraggingId}
        dispatch={dispatch}
        mergedIds={mergedIds}
        equippingRelicId={equippingRelicId}
        onRelicEquipped={() => setEquippingRelicId(null)}
      />

      {/* Shop */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Shop
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => dispatch({ type: "REROLL_SHOP" })}
            disabled={
              run.freeRerollsAvailable === 0 && run.gold < run.shop.rerollCost
            }
            className="gap-1"
          >
            <RefreshCw className="size-3" />
            Reroll
            <span className="text-amber-400">
              {run.freeRerollsAvailable > 0
                ? "FREE"
                : `${run.shop.rerollCost}💰`}
            </span>
          </Button>
          <Button
            size="xs"
            variant={run.shop.frozen ? "default" : "outline"}
            onClick={() => dispatch({ type: "FREEZE_SHOP" })}
            className="gap-1"
          >
            <Snowflake className="size-3" />
            {run.shop.frozen ? "Frozen" : "Freeze"}
          </Button>

          <div className="flex-1" />

          <Button
            onClick={() => dispatch({ type: "START_COMBAT" })}
            disabled={!canStart}
            size="sm"
            className="gap-1.5"
          >
            <Play className="size-3.5" />
            Start Combat
          </Button>
        </div>
        <div className="flex items-center gap-2 justify-center">
          {run.shop.available.map((slot, i) => {
            // Count copies of this unit (same def + star 1) on bench+board
            const defId = slot.unitDefId;
            let copies = 0;
            if (!slot.sold) {
              for (const u of run.bench.units) {
                if (u.unitDefId === defId && u.starLevel === 1) copies++;
              }
              for (const u of run.board.slots) {
                if (u && u.unitDefId === defId && u.starLevel === 1) copies++;
              }
            }
            return (
              <ShopCard
                key={i}
                slot={slot}
                unit={unitMap[slot.unitDefId]}
                canAfford={run.gold >= slot.cost}
                willMerge={copies >= 2}
                onBuy={() => dispatch({ type: "BUY_UNIT", shopIndex: i })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ResourceCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/30 border border-border">
      {icon}
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function BoardGridView({
  run,
  unitMap,
  relicMap,
  draggingId,
  setDraggingId,
  dispatch,
  mergedIds,
  equippingRelicId,
  onRelicEquipped,
}: {
  run: AutoBattlerRun;
  unitMap: Record<string, UnitDef>;
  relicMap: Record<string, RelicDef>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dispatch: Dispatch;
  mergedIds: Set<string>;
  equippingRelicId: string | null;
  onRelicEquipped: () => void;
}) {
  const { rows, cols, slots } = run.board;
  const grid: (PlacedUnit | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push(slots.slice(r * cols, (r + 1) * cols));
  }
  return (
    <div className="inline-flex flex-col gap-1 p-2 rounded-lg border border-border bg-muted/10">
      {grid.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((cell, ci) => (
            <BoardSlot
              key={`${ri}-${ci}`}
              row={ri}
              col={ci}
              unit={cell}
              unitMap={unitMap}
              relicMap={relicMap}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dispatch={dispatch}
              merged={cell ? mergedIds.has(cell.instanceId) : false}
              equippingRelicId={equippingRelicId}
              onRelicEquipped={onRelicEquipped}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function BoardSlot({
  row,
  col,
  unit,
  unitMap,
  relicMap,
  draggingId,
  setDraggingId,
  dispatch,
  merged,
  equippingRelicId,
  onRelicEquipped,
}: {
  row: number;
  col: number;
  unit: PlacedUnit | null;
  unitMap: Record<string, UnitDef>;
  relicMap: Record<string, RelicDef>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dispatch: Dispatch;
  merged: boolean;
  equippingRelicId: string | null;
  onRelicEquipped: () => void;
}) {
  const def = unit ? unitMap[unit.unitDefId] : undefined;
  const relic = unit?.equippedRelicId ? relicMap[unit.equippedRelicId] : null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/unit");
    const source = e.dataTransfer.getData("text/source");
    if (!id) return;
    if (source === "bench") {
      dispatch({ type: "PLACE_UNIT", instanceId: id, row, col });
    } else {
      dispatch({ type: "MOVE_UNIT", instanceId: id, row, col });
    }
    setDraggingId(null);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => {
        if (equippingRelicId && unit) {
          dispatch({
            type: "EQUIP_RELIC",
            relicId: equippingRelicId,
            unitInstanceId: unit.instanceId,
          });
          onRelicEquipped();
        } else if (!equippingRelicId && unit?.equippedRelicId) {
          dispatch({
            type: "UNEQUIP_RELIC",
            unitInstanceId: unit.instanceId,
          });
        }
      }}
      onDoubleClick={() => {
        if (unit) dispatch({ type: "BENCH_UNIT", instanceId: unit.instanceId });
      }}
      className={cn(
        "size-20 rounded-md border-2 border-dashed border-muted/30 flex items-center justify-center transition-colors",
        draggingId && "border-accent/50 bg-accent/5",
        equippingRelicId &&
          unit &&
          "border-amber-400/60 bg-amber-500/10 cursor-pointer",
      )}
      title={
        equippingRelicId && unit
          ? "Click to equip relic"
          : unit?.equippedRelicId
            ? "Click relic to unequip · Double-click to bench"
            : unit
              ? "Double-click to send to bench"
              : `Row ${row}, Col ${col}`
      }
    >
      {unit && def && (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/unit", unit.instanceId);
            e.dataTransfer.setData("text/source", "board");
            e.dataTransfer.effectAllowed = "move";
            setDraggingId(unit.instanceId);
          }}
          onDragEnd={() => setDraggingId(null)}
        >
          <UnitCard
            unit={def}
            starLevel={unit.starLevel}
            hp={unit.currentHp}
            maxHp={unit.maxHp}
            relic={relic}
            sellPrice={SELL_REFUND[unit.starLevel] * def.tier}
            className={merged ? "animate-merge-flash" : undefined}
          />
        </div>
      )}
    </div>
  );
}

function BenchRow({
  run,
  unitMap,
  relicMap,
  draggingId,
  setDraggingId,
  dispatch,
  mergedIds,
  equippingRelicId,
  onRelicEquipped,
}: {
  run: AutoBattlerRun;
  unitMap: Record<string, UnitDef>;
  relicMap: Record<string, RelicDef>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dispatch: Dispatch;
  mergedIds: Set<string>;
  equippingRelicId: string | null;
  onRelicEquipped: () => void;
}) {
  const slots: (BenchUnit | null)[] = Array.from({
    length: run.bench.maxSize,
  }).map((_, i) => run.bench.units[i] ?? null);

  const handleBenchDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/unit");
    if (!id) return;
    dispatch({ type: "BENCH_UNIT", instanceId: id });
    setDraggingId(null);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleBenchDrop}
      className={cn(
        "flex items-center gap-1.5 p-2 rounded-lg border border-white/10 bg-white/3",
        draggingId && "border-accent/50 bg-accent/5",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
        Bench
      </div>
      {slots.map((unit, i) => {
        if (!unit) {
          return (
            <div
              key={i}
              className="size-14 rounded-md border border-dashed border-white/12 bg-white/4"
            />
          );
        }
        const def = unitMap[unit.unitDefId];
        if (!def) return null;
        const relic = unit.equippedRelicId
          ? relicMap[unit.equippedRelicId]
          : null;
        return (
          <div
            key={unit.instanceId}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/unit", unit.instanceId);
              e.dataTransfer.setData("text/source", "bench");
              e.dataTransfer.effectAllowed = "move";
              setDraggingId(unit.instanceId);
            }}
            onDragEnd={() => setDraggingId(null)}
            onClick={() => {
              if (equippingRelicId) {
                dispatch({
                  type: "EQUIP_RELIC",
                  relicId: equippingRelicId,
                  unitInstanceId: unit.instanceId,
                });
                onRelicEquipped();
              } else if (unit.equippedRelicId) {
                dispatch({
                  type: "UNEQUIP_RELIC",
                  unitInstanceId: unit.instanceId,
                });
              }
            }}
            onDoubleClick={() =>
              dispatch({ type: "SELL_UNIT", instanceId: unit.instanceId })
            }
            title={
              equippingRelicId
                ? "Click to equip relic"
                : unit.equippedRelicId
                  ? "Click to unequip relic · Double-click to sell"
                  : "Drag onto board, double-click to sell"
            }
          >
            <UnitCard
              unit={def}
              starLevel={unit.starLevel}
              relic={relic}
              compact
              sellPrice={SELL_REFUND[unit.starLevel] * def.tier}
              className={
                mergedIds.has(unit.instanceId)
                  ? "animate-merge-flash"
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function RelicPanel({
  run,
  relicMap,
  equippingRelicId,
  onSelectRelic,
  dispatch,
}: {
  run: AutoBattlerRun;
  relicMap: Record<string, RelicDef>;
  equippingRelicId: string | null;
  onSelectRelic: (id: string) => void;
  dispatch: Dispatch;
}) {
  // Separate unequipped relics into unit and global
  const unitRelics: RelicDef[] = [];
  const globalRelics: RelicDef[] = [];
  for (const rid of run.activeRelics) {
    const r = relicMap[rid];
    if (!r) continue;
    if (r.type === "unit") unitRelics.push(r);
    else globalRelics.push(r);
  }

  // Also gather equipped relics for display
  const equippedCount =
    run.board.slots.filter((u) => u?.equippedRelicId).length +
    run.bench.units.filter((u) => u.equippedRelicId).length;

  const totalRelics = run.activeRelics.length + equippedCount;

  if (totalRelics === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
        Relics ({totalRelics})
      </div>
      {equippingRelicId && (
        <div className="text-[10px] text-amber-400 px-1 animate-pulse">
          Click a unit to equip
        </div>
      )}
      {globalRelics.map((r) => (
        <Tooltip key={r.id}>
          <TooltipTrigger render={<div />}>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-900/20 text-xs">
              <span className="text-sm">{r.emoji}</span>
              <span className="font-medium flex-1 truncate text-emerald-200">
                {r.name}
              </span>
              <span className="text-[9px] text-emerald-400/70 uppercase">
                global
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-none">
            <div className="w-48 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-lg">{r.emoji}</span>
                <span className="font-semibold text-sm">{r.name}</span>
              </div>
              <div className="text-popover-foreground/80">{r.description}</div>
              <div className="text-[9px] text-emerald-400 uppercase">
                Always active
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
      {unitRelics.map((r) => (
        <Tooltip key={r.id}>
          <TooltipTrigger render={<div />}>
            <button
              onClick={() => onSelectRelic(r.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs transition-all text-left",
                equippingRelicId === r.id
                  ? "border-amber-400 bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60"
                  : "border-amber-500/30 bg-amber-900/15 text-amber-200/80 hover:bg-amber-900/30 cursor-pointer",
              )}
            >
              <span className="text-sm">{r.emoji}</span>
              <span className="font-medium flex-1 truncate">{r.name}</span>
              <span className="text-[9px] text-amber-400/60 uppercase">
                equip
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-none">
            <div className="w-48 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-lg">{r.emoji}</span>
                <span className="font-semibold text-sm">{r.name}</span>
              </div>
              <div className="text-popover-foreground/80">{r.description}</div>
              <div className="text-[9px] text-amber-400 uppercase">
                Click to select, then click a unit
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
