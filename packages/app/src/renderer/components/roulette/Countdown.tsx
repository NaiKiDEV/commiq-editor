import { useEffect, useRef, useState } from "react";

interface CountdownProps {
  /** Timestamp (ms) the betting phase ends. */
  endsAt: number;
  /** Only counts while true (betting phase). */
  active: boolean;
}

/**
 * Big centered countdown shown over the reel during betting, with one decimal.
 * Runs its own rAF loop so the frequent ticks don't re-render the reel strip.
 */
export function Countdown({ endsAt, active }: CountdownProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, endsAt - Date.now()),
  );
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      setRemaining(Math.max(0, endsAt - Date.now()));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [endsAt, active]);

  if (!active) return null;

  const seconds = remaining / 1000;
  const urgent = seconds <= 3;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-background/55 backdrop-blur-[1px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
        Rolling in
      </span>
      <span
        className={`font-mono text-6xl font-black leading-none tabular-nums tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] ${
          urgent ? "text-red-500" : "text-foreground"
        }`}
      >
        {seconds.toFixed(1)}
      </span>
    </div>
  );
}
