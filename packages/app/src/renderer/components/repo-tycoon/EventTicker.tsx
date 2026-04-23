import { cn } from "@/lib/utils";
import type {
  EventDef,
  RepoTycoonState,
} from "../../../shared/repo-tycoon-types";

interface EventTickerProps {
  state: RepoTycoonState;
  events: EventDef[];
  now: number;
}

export function EventTicker({ state, events, now }: EventTickerProps) {
  const active = state.activeEvents.filter((e) => e.endsAt > now);

  if (active.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/2 border border-white/6 text-[11px] text-muted-foreground/60">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>all quiet on main</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((a) => {
        const def = events.find((e) => e.id === a.id);
        if (!def) return null;
        const remaining = Math.max(0, Math.ceil((a.endsAt - now) / 1000));
        const totalMs = a.endsAt - a.startedAt;
        const elapsedMs = now - a.startedAt;
        const pct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
        return (
          <div
            key={a.id + a.startedAt}
            className={cn(
              "relative flex items-center gap-2 px-3 py-1.5 rounded-md border text-[11px] overflow-hidden",
              "bg-orange-500/10 border-orange-500/40 text-orange-200",
            )}
          >
            <div
              className="absolute inset-y-0 left-0 bg-orange-500/20 transition-[width]"
              style={{ width: `${100 - pct}%` }}
            />
            <span className="relative">{def.emoji}</span>
            <span className="relative font-medium">{def.title}</span>
            <span className="relative tabular-nums font-mono text-[10px] text-orange-200/80">
              {remaining}s
            </span>
          </div>
        );
      })}
    </div>
  );
}
