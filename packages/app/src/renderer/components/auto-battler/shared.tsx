import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Gauge } from "lucide-react";
import type {
  GameSettings,
  RelicDef,
  ShopSlot,
  StarLevel,
  SynergyDef,
  UnitDef,
  UnitStats,
} from "../../../shared/auto-battler-types";

export const TOOLTIP_CLASS = "max-w-none";

export const TIER_COLORS: Record<number, string> = {
  1: "border-zinc-500/60 bg-zinc-700/30",
  2: "border-green-500/60 bg-green-900/30",
  3: "border-blue-500/60 bg-blue-900/30",
  4: "border-purple-500/60 bg-purple-900/30",
  5: "border-amber-500/60 bg-amber-900/30",
};

export const TIER_TEXT: Record<number, string> = {
  1: "text-zinc-200",
  2: "text-green-300",
  3: "text-blue-300",
  4: "text-purple-300",
  5: "text-amber-300",
};

export const TIER_GLOW: Record<number, string> = {
  1: "shadow-zinc-500/30",
  2: "shadow-green-500/40",
  3: "shadow-blue-500/50",
  4: "shadow-purple-500/60",
  5: "shadow-amber-500/70",
};

export const ROLE_COLORS: Record<string, string> = {
  tank: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  dps: "bg-red-500/20 text-red-300 border-red-500/40",
  support: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  assassin: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
};

export function StarBadge({ star }: { star: StarLevel }) {
  if (star === 1) return null;
  const count = star;
  return (
    <div className="absolute top-0.5 right-0.5 text-[10px] leading-none flex gap-px text-amber-400">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i}>★</span>
      ))}
    </div>
  );
}

export function StatBar({
  current,
  max,
  color,
  height = "h-1",
}: {
  current: number;
  max: number;
  color: string;
  height?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className={cn("w-full bg-black/40 rounded-full overflow-hidden", height)}>
      <div
        className={cn("h-full transition-[width] duration-100", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Compute effective stats for a unit at a given star level
export function effectiveStats(unit: UnitDef, star: StarLevel): UnitStats {
  const hpMult = Math.pow(unit.starScaling.hpMult, star - 1);
  const atkMult = Math.pow(unit.starScaling.attackMult, star - 1);
  return {
    ...unit.baseStats,
    hp: Math.round(unit.baseStats.hp * hpMult),
    attack: Math.round(unit.baseStats.attack * atkMult),
  };
}

export function UnitInfo({
  unit,
  starLevel,
  relic,
}: {
  unit: UnitDef;
  starLevel?: StarLevel;
  relic?: RelicDef | null;
}) {
  const star = starLevel ?? 1;
  const stats = effectiveStats(unit, star);
  const abilityMult = Math.pow(unit.starScaling.abilityMult, star - 1);
  return (
    <div className="w-60 space-y-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none">{unit.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{unit.name}</span>
            {star > 1 && (
              <span className="text-amber-400 text-xs">
                {"★".repeat(star)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={cn("text-[9px] uppercase tracking-wide")}>
              T{unit.tier}
            </span>
            <span
              className={cn(
                "text-[9px] uppercase tracking-wide px-1 rounded border",
                ROLE_COLORS[unit.role] ?? "border-border",
              )}
            >
              {unit.role}
            </span>
          </div>
        </div>
      </div>

      <div className="text-popover-foreground/70 italic">{unit.description}</div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
        <Stat label="HP" value={stats.hp} />
        <Stat label="ATK" value={stats.attack} />
        <Stat label="AS" value={`${stats.attackSpeed.toFixed(2)}/s`} />
        <Stat label="RNG" value={stats.range} />
        <Stat label="DEF" value={stats.defense} />
        <Stat label="MANA" value={`${stats.mana}`} />
      </div>

      <div className="border-t border-border pt-1.5 space-y-0.5">
        <div className="flex items-center gap-1">
          <span className="text-amber-400">✨</span>
          <span className="font-semibold">{unit.ability.name}</span>
          <span className="text-[9px] text-popover-foreground/60 ml-auto">
            {unit.ability.manaCost} MP
          </span>
        </div>
        <div className="text-popover-foreground/80">
          {unit.ability.description}
          {star > 1 && abilityMult !== 1 && (
            <span className="text-emerald-400"> (×{abilityMult.toFixed(2)})</span>
          )}
        </div>
      </div>

      {unit.traits.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {unit.traits.map((t) => (
            <span
              key={t}
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-foreground/10"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {relic && (
        <div className="border-t border-border pt-1.5">
          <div className="flex items-center gap-1">
            <span>{relic.emoji}</span>
            <span className="font-semibold">{relic.name}</span>
          </div>
          <div className="text-popover-foreground/80">{relic.description}</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-popover-foreground/60">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function SynergyInfo({
  synergy,
  unitCount,
  activeThreshold,
}: {
  synergy: SynergyDef;
  unitCount: number;
  activeThreshold: number;
}) {
  return (
    <div className="w-60 space-y-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">{synergy.emoji}</span>
        <div className="flex-1">
          <div className="font-semibold text-sm">{synergy.name}</div>
          <div className="text-[10px] text-popover-foreground/70">
            {unitCount} unique {unitCount === 1 ? "unit" : "units"}
          </div>
        </div>
      </div>
      <div className="text-popover-foreground/70 italic">{synergy.description}</div>
      <div className="border-t border-border pt-1.5 space-y-1">
        {synergy.thresholds.map((t) => {
          const reached = unitCount >= t.count;
          const active = activeThreshold === t.count;
          return (
            <div
              key={t.count}
              className={cn(
                "flex items-start gap-2 rounded px-1.5 py-1",
                active && "bg-emerald-500/20 ring-1 ring-emerald-400/60",
                !active && reached && "bg-foreground/5",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-bold tabular-nums w-6 text-center shrink-0",
                  active
                    ? "text-emerald-400"
                    : reached
                      ? "text-popover-foreground/80"
                      : "text-popover-foreground/40",
                )}
              >
                ({t.count})
              </span>
              <span
                className={cn(
                  "flex-1",
                  active
                    ? ""
                    : reached
                      ? "text-popover-foreground/70"
                      : "text-popover-foreground/50",
                )}
              >
                {t.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UnitCard({
  unit,
  starLevel,
  hp,
  maxHp,
  mana,
  maxMana,
  selected,
  onClick,
  className,
  compact,
  relic,
  tooltip = true,
}: {
  unit: UnitDef;
  starLevel: StarLevel;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  compact?: boolean;
  relic?: RelicDef | null;
  tooltip?: boolean;
}) {
  const card = (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative rounded-md border-2 flex flex-col items-center justify-center p-1 transition-all",
        TIER_COLORS[unit.tier],
        selected && "ring-2 ring-accent ring-offset-1 ring-offset-background",
        starLevel === 3 && "shadow-lg",
        starLevel === 3 && TIER_GLOW[unit.tier],
        onClick && "cursor-pointer hover:scale-105",
        compact ? "size-14 text-xl" : "size-20 text-3xl",
        className,
      )}
    >
      <StarBadge star={starLevel} />
      <div className="leading-none">{unit.emoji}</div>
      {!compact && (
        <div className="mt-1 text-[9px] leading-tight text-center text-foreground/90 truncate max-w-full px-0.5">
          {unit.name}
        </div>
      )}
      {hp !== undefined && maxHp !== undefined && (
        <div className="absolute bottom-0.5 left-0.5 right-0.5 flex flex-col gap-px">
          <StatBar current={hp} max={maxHp} color="bg-red-500" />
          {mana !== undefined && maxMana !== undefined && maxMana > 0 && (
            <StatBar current={mana} max={maxMana} color="bg-blue-400" />
          )}
        </div>
      )}
      {relic && (
        <div className="absolute -top-1 -left-1 size-4 rounded-full bg-amber-500/90 text-[10px] flex items-center justify-center shadow">
          {relic.emoji}
        </div>
      )}
    </div>
  );

  if (!tooltip) return card;

  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>{card}</TooltipTrigger>
      <TooltipContent className={TOOLTIP_CLASS}>
        <UnitInfo unit={unit} starLevel={starLevel} relic={relic} />
      </TooltipContent>
    </Tooltip>
  );
}

export function ShopCard({
  slot,
  unit,
  canAfford,
  willMerge,
  onBuy,
}: {
  slot: ShopSlot;
  unit: UnitDef | undefined;
  canAfford: boolean;
  willMerge?: boolean;
  onBuy: () => void;
}) {
  if (!unit) {
    return (
      <div className="w-24 h-28 rounded-md border-2 border-dashed border-muted/40 bg-muted/10" />
    );
  }
  const button = (
    <button
      disabled={slot.sold || !canAfford}
      onClick={onBuy}
      className={cn(
        "w-24 h-28 rounded-md border-2 flex flex-col items-center justify-between p-1 transition-all",
        TIER_COLORS[unit.tier],
        slot.sold && "opacity-30 grayscale",
        !slot.sold && !canAfford && "opacity-50",
        !slot.sold && canAfford && "hover:scale-105 hover:border-accent cursor-pointer",
        !slot.sold && canAfford && willMerge && "ring-2 ring-amber-400/60 animate-pulse",
      )}
    >
      <div className={cn("text-[9px] uppercase tracking-wide font-semibold", TIER_TEXT[unit.tier])}>
        T{unit.tier}
      </div>
      <div className="text-3xl leading-none">{unit.emoji}</div>
      <div className="text-[10px] text-center font-medium truncate max-w-full">
        {unit.name}
      </div>
      <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
        <span>💰</span>
        <span>{slot.cost}</span>
      </div>
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>{button}</TooltipTrigger>
      <TooltipContent className="max-w-none" side="top">
        <UnitInfo unit={unit} starLevel={1} />
      </TooltipContent>
    </Tooltip>
  );
}

export function SpeedSelector({
  value,
  onChange,
}: {
  value: GameSettings["combatSpeed"];
  onChange: (speed: GameSettings["combatSpeed"]) => void;
}) {
  const options: GameSettings["combatSpeed"][] = ["slow", "normal", "fast", "instant"];
  return (
    <div
      className="flex items-center justify-between gap-0.5 px-1 py-0.5 rounded-md border border-border bg-muted/20 shrink-0"
      title="Combat playback speed"
    >
      <Gauge className="size-3 text-muted-foreground shrink-0 mx-1" />
      {options.map((s) => (
        <Button
          key={s}
          size="xs"
          variant={value === s ? "default" : "ghost"}
          onClick={() => onChange(s)}
          className="capitalize h-5 px-1 text-[10px]"
        >
          {s}
        </Button>
      ))}
    </div>
  );
}

export function SynergyBadge({
  synergy,
  unitCount,
  activeThreshold,
}: {
  synergy: SynergyDef;
  unitCount: number;
  activeThreshold: number;
}) {
  const active = activeThreshold > 0;
  const next = synergy.thresholds.find((t) => t.count > unitCount);
  const targetCount = next?.count ?? activeThreshold;
  const progressPct =
    targetCount > 0 ? Math.min(100, (unitCount / targetCount) * 100) : 0;
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        <div
          className={cn(
            "relative flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs transition-colors cursor-help overflow-hidden",
            active
              ? "bg-emerald-900/40 border-emerald-500/60 text-emerald-100"
              : "bg-muted/20 border-border text-muted-foreground",
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 transition-[width]",
              active ? "bg-emerald-500/20" : "bg-foreground/5",
            )}
            style={{ width: `${progressPct}%` }}
          />
          <span className="relative text-sm">{synergy.emoji}</span>
          <span className="relative font-medium flex-1 truncate">
            {synergy.name}
          </span>
          <span className="relative tabular-nums text-[10px]">
            {unitCount}
            {next ? `/${next.count}` : ""}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className={TOOLTIP_CLASS}>
        <SynergyInfo
          synergy={synergy}
          unitCount={unitCount}
          activeThreshold={activeThreshold}
        />
      </TooltipContent>
    </Tooltip>
  );
}
