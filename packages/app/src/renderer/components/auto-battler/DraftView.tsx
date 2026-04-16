import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
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

  const canStart = run.board.slots.some((s) => s !== null);

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Top bar: gold, hp, wave, end run */}
      <div className="flex items-center gap-3">
        <ResourceCard
          icon={<Coins className="size-4 text-amber-400" />}
          label="Gold"
          value={run.gold}
        />
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
            disabled={run.freeRerollsAvailable === 0 && run.gold < run.shop.rerollCost}
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
            />);
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
}: {
  run: AutoBattlerRun;
  unitMap: Record<string, UnitDef>;
  relicMap: Record<string, RelicDef>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dispatch: Dispatch;
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
}: {
  row: number;
  col: number;
  unit: PlacedUnit | null;
  unitMap: Record<string, UnitDef>;
  relicMap: Record<string, RelicDef>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dispatch: Dispatch;
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
      onDoubleClick={() => {
        if (unit) dispatch({ type: "BENCH_UNIT", instanceId: unit.instanceId });
      }}
      className={cn(
        "size-20 rounded-md border-2 border-dashed border-muted/30 flex items-center justify-center transition-colors",
        draggingId && "border-accent/50 bg-accent/5",
      )}
      title={unit ? "Double-click to send to bench" : `Row ${row}, Col ${col}`}
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
}: {
  run: AutoBattlerRun;
  unitMap: Record<string, UnitDef>;
  relicMap: Record<string, RelicDef>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dispatch: Dispatch;
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
        const relic = unit.equippedRelicId ? relicMap[unit.equippedRelicId] : null;
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
            onDoubleClick={() =>
              dispatch({ type: "SELL_UNIT", instanceId: unit.instanceId })
            }
            title="Drag onto board, double-click to sell"
          >
            <UnitCard
              unit={def}
              starLevel={unit.starLevel}
              relic={relic}
              compact
            />
          </div>
        );
      })}
    </div>
  );
}
