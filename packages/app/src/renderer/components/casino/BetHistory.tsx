import { History, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "../roulette/engine";
import type { BetHistoryEntry } from "./betHistoryStore";

interface BetHistoryProps {
  entries: BetHistoryEntry[];
  onClear: () => void;
  onClose: () => void;
}

/**
 * Sidebar listing every resolved bet for the current game with its wager and
 * net outcome, plus running totals. Shared by all hidden casino panels.
 */
export function BetHistory({ entries, onClear, onClose }: BetHistoryProps) {
  const wagered = entries.reduce((sum, e) => sum + e.bet, 0);
  const net = entries.reduce((sum, e) => sum + e.net, 0);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-l border-border bg-card/20">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <History className="size-3.5" />
          History
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onClear}
            disabled={entries.length === 0}
            title="Clear history"
            className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Hide history"
            className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
        <div className="flex flex-col gap-0.5 bg-card/40 px-3 py-2">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Wagered
          </span>
          <span className="font-mono text-xs font-bold tabular-nums text-foreground/80">
            {formatMoney(wagered)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-card/40 px-3 py-2">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Net
          </span>
          <span
            className={cn(
              "font-mono text-xs font-bold tabular-nums",
              net > 0
                ? "text-emerald-400"
                : net < 0
                  ? "text-red-400"
                  : "text-foreground/80",
            )}
          >
            {net >= 0 ? "+" : "-"}
            {formatMoney(Math.abs(net))}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/50">
            No bets yet
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5"
            >
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                {entry.outcome}
              </span>
              <div className="ml-auto flex flex-col items-end leading-tight">
                <span
                  className={cn(
                    "font-mono text-xs font-bold tabular-nums",
                    entry.net > 0
                      ? "text-emerald-400"
                      : entry.net < 0
                        ? "text-red-400"
                        : "text-muted-foreground",
                  )}
                >
                  {entry.net >= 0 ? "+" : "-"}
                  {formatMoney(Math.abs(entry.net))}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
                  bet {formatMoney(entry.bet)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
