import type { SprintVelocity } from "../../../shared/boards-types";

type Props = {
  velocity: SprintVelocity;
};

export function SprintSummary({ velocity }: Props) {
  const ratio =
    velocity.storyPointsCommitted > 0
      ? velocity.storyPointsCompleted / velocity.storyPointsCommitted
      : 0;
  const pct = Math.round(ratio * 100);
  const totalTasks = Object.values(velocity.tasksByStatus).reduce(
    (sum, n) => sum + n,
    0,
  );

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-md bg-muted/30 border border-border/60 text-xs">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Velocity
      </span>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Pill
          label="Committed"
          value={`${velocity.storyPointsCommitted}`}
          suffix="pts"
        />
        <Pill
          label="Completed"
          value={`${velocity.storyPointsCompleted}`}
          suffix="pts"
          accent="text-green-400"
        />
        <Pill label="Hit rate" value={`${pct}%`} />
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-green-500/60"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      {totalTasks > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(velocity.tasksByStatus).map(([status, count]) => (
            <span
              key={status}
              className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground capitalize"
              title={`${count} task${count === 1 ? "" : "s"} in "${status}"`}
            >
              {status}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0 px-1.5 py-1 rounded-md bg-background/60">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm font-semibold ${accent ?? ""}`}>
        {value}
        {suffix && (
          <span className="text-[10px] text-muted-foreground ml-0.5">
            {suffix}
          </span>
        )}
      </span>
    </div>
  );
}
