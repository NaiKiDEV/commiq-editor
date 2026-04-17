import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { ArrowLeft, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type {
  AutoBattlerMeta,
  GameAction,
  ProgressionNode,
} from "../../../shared/auto-battler-types";
import { TOOLTIP_CLASS } from "./shared";

type Dispatch = (action: GameAction) => Promise<unknown>;

const NODE_SIZE = 80;
const PAD = 80;
const EDGE_GAP = 8;

export function ProgressionView({
  meta,
  nodes,
  onBack,
  dispatch,
}: {
  meta: AutoBattlerMeta;
  nodes: ProgressionNode[];
  onBack: () => void;
  dispatch: Dispatch;
}) {
  const unlocked = new Set(meta.progressionNodes);

  const canUnlock = (node: ProgressionNode) =>
    !unlocked.has(node.id) &&
    meta.souls >= node.cost &&
    node.prerequisites.every((p) => unlocked.has(p));

  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const maxX = Math.max(...xs, 0);
  const maxY = Math.max(...ys, 0);

  const toX = (x: number) => x + PAD;
  const toY = (y: number) => y + PAD;
  const width = maxX + PAD * 2 + NODE_SIZE;
  const height = maxY + PAD * 2 + NODE_SIZE;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <Button onClick={onBack} size="sm" variant="ghost" className="gap-1.5">
          <ArrowLeft className="size-3.5" />
          Back
        </Button>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-amber-400 font-semibold">
            💀 {meta.souls} Souls
          </span>
          <span className="text-muted-foreground">
            {meta.progressionNodes.length}/{nodes.length} unlocked
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto relative bg-muted/5">
        <div className="relative" style={{ width, height }}>
          <svg
            className="absolute inset-0 pointer-events-none"
            width={width}
            height={height}
            style={{ zIndex: 0 }}
          >
            {nodes.map((node) =>
              node.prerequisites.map((prereqId) => {
                const prereq = nodes.find((n) => n.id === prereqId);
                if (!prereq) return null;
                const cx1 = toX(prereq.position.x) + NODE_SIZE / 2;
                const cy1 = toY(prereq.position.y) + NODE_SIZE / 2;
                const cx2 = toX(node.position.x) + NODE_SIZE / 2;
                const cy2 = toY(node.position.y) + NODE_SIZE / 2;
                const [x1, y1, x2, y2] = trimToNodeEdges(
                  cx1,
                  cy1,
                  cx2,
                  cy2,
                  NODE_SIZE / 2 + EDGE_GAP,
                );
                const active = unlocked.has(prereqId) && unlocked.has(node.id);
                return (
                  <line
                    key={`${prereqId}-${node.id}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={active ? "rgb(34,197,94)" : "rgb(120,120,130)"}
                    strokeWidth={active ? 2.5 : 1.5}
                    strokeDasharray={active ? undefined : "4 3"}
                  />
                );
              }),
            )}
          </svg>
          {nodes.map((node) => {
            const isUnlocked = unlocked.has(node.id);
            const available = canUnlock(node);
            const prereqMet = node.prerequisites.every((p) => unlocked.has(p));
            return (
              <Tooltip key={node.id}>
                <TooltipTrigger
                  render={
                    <div
                      style={{
                        position: "absolute",
                        left: toX(node.position.x),
                        top: toY(node.position.y),
                        width: NODE_SIZE,
                        height: NODE_SIZE,
                        zIndex: 1,
                      }}
                    />
                  }
                >
                  <button
                    onClick={() =>
                      available &&
                      dispatch({ type: "UNLOCK_NODE", nodeId: node.id })
                    }
                    disabled={!available}
                    className={cn(
                      "w-full h-full flex flex-col items-center justify-center rounded-lg border-2 p-2 transition-all text-center",
                      isUnlocked
                        ? "bg-emerald-950 border-emerald-500 text-emerald-100 shadow-lg shadow-emerald-500/20"
                        : available
                          ? "bg-amber-950 border-amber-500/70 text-amber-100 hover:scale-105 cursor-pointer animate-pulse"
                          : prereqMet
                            ? "bg-card border-border text-muted-foreground"
                            : "bg-card/80 border-dashed border-muted/40 text-muted-foreground/50",
                    )}
                  >
                    {!prereqMet && (
                      <Lock className="absolute top-1 right-1 size-3 text-muted-foreground/60" />
                    )}
                    <div className="text-2xl leading-none">
                      {prereqMet ? node.emoji : "❔"}
                    </div>
                    <div className="text-[9px] font-medium truncate max-w-full mt-1">
                      {prereqMet ? node.name : "???"}
                    </div>
                    <div className="text-[9px] tabular-nums">
                      {isUnlocked ? "✓" : `${node.cost}💀`}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent className={TOOLTIP_CLASS}>
                  <ProgressionInfo
                    node={node}
                    isUnlocked={isUnlocked}
                    prereqMet={prereqMet}
                    souls={meta.souls}
                    prereqs={node.prerequisites.map(
                      (id) => nodes.find((n) => n.id === id)?.name ?? id,
                    )}
                  />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function trimToNodeEdges(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  gap: number,
): [number, number, number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [x1, y1, x2, y2];
  const ux = dx / len;
  const uy = dy / len;
  return [x1 + ux * gap, y1 + uy * gap, x2 - ux * gap, y2 - uy * gap];
}

function ProgressionInfo({
  node,
  isUnlocked,
  prereqMet,
  souls,
  prereqs,
}: {
  node: ProgressionNode;
  isUnlocked: boolean;
  prereqMet: boolean;
  souls: number;
  prereqs: string[];
}) {
  if (!prereqMet) {
    return (
      <div className="w-56 space-y-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <Lock className="size-3 text-muted-foreground" />
          <span className="font-semibold text-sm">Locked</span>
        </div>
        <div className="text-popover-foreground/70 italic">
          Unlock the prerequisite nodes to reveal this upgrade.
        </div>
        {prereqs.length > 0 && (
          <div className="border-t border-border pt-1.5">
            <div className="text-[10px] uppercase tracking-wide text-popover-foreground/60 mb-0.5">
              Requires
            </div>
            <ul className="list-disc list-inside space-y-0.5">
              {prereqs.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const canAfford = souls >= node.cost;
  return (
    <div className="w-56 space-y-1.5 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">{node.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{node.name}</div>
          <div className="text-[9px] uppercase tracking-wide text-popover-foreground/60">
            {node.category.replace("_", " ")}
          </div>
        </div>
      </div>
      <div className="text-popover-foreground/80">{node.description}</div>
      <div className="border-t border-border pt-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-popover-foreground/60">
          Cost
        </span>
        <span
          className={cn(
            "font-semibold tabular-nums",
            isUnlocked
              ? "text-emerald-400"
              : canAfford
                ? "text-amber-400"
                : "text-red-400",
          )}
        >
          {isUnlocked ? "Unlocked" : `${node.cost} 💀`}
        </span>
      </div>
    </div>
  );
}
