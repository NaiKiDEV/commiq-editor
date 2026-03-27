import { useMemo } from 'react';
import parser from 'cron-parser';

const NEXT_COUNT = 8;

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type CronNextRunsProps = {
  expression: string;
};

export function CronNextRuns({ expression }: CronNextRunsProps) {
  const runs = useMemo(() => {
    try {
      const interval = parser.parseExpression(expression, { utc: false });
      return Array.from({ length: NEXT_COUNT }, () => interval.next().toDate());
    } catch {
      return null;
    }
  }, [expression]);

  if (!runs) return null;

  return (
    <div className="flex flex-col border-t border-border">
      <div className="px-4 py-2 border-b border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Next {NEXT_COUNT} runs
        </span>
      </div>
      <div className="overflow-y-auto">
        {runs.map((date, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20"
          >
            <span className="text-xs text-muted-foreground/60 font-mono tabular-nums w-4 shrink-0">
              {i + 1}
            </span>
            <span className="text-xs font-mono text-foreground">
              {DATE_FORMAT.format(date)}
            </span>
            {i === 0 && (
              <span className="ml-auto text-[10px] text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded font-medium">
                next
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
