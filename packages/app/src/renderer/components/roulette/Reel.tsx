import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  buildReel,
  landingReelIndex,
  tileClasses,
  TILE_STRIDE,
  TILE_INNER,
  type WheelSlot,
} from "./engine";

interface ReelProps {
  /** Wheel index (0..14) the strip should land on this round. */
  winningIndex: number;
  /** Incremented each round to re-trigger the roll animation. */
  roundSeq: number;
  /** True while the strip is actively spinning. */
  rolling: boolean;
  /** Duration of the spin animation in ms. */
  durationMs: number;
}

/**
 * CSGO-style horizontal roll: a long strip of colored tiles scrolls left and
 * decelerates so the winning tile settles under the center marker.
 */
export const Reel = memo(function Reel({
  winningIndex,
  roundSeq,
  rolling,
  durationMs,
}: ReelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // Rebuild the strip each round so the winner always sits near the end.
  const reel = useMemo<WheelSlot[]>(() => buildReel(), [roundSeq]);
  const [style, setStyle] = useState<{ transform: string; transition: string }>(
    { transform: "translateX(0px)", transition: "none" },
  );

  useEffect(() => {
    if (!rolling) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const width = viewport.offsetWidth;
    const landing = landingReelIndex(winningIndex);
    // Random jitter inside the tile so it doesn't always stop dead-center.
    const jitter = (Math.random() - 0.5) * (TILE_INNER * 0.55);
    const target = -(landing * TILE_STRIDE + TILE_STRIDE / 2 - width / 2 + jitter);

    // Snap to the start with no transition, then animate to the target next frame.
    setStyle({ transform: "translateX(0px)", transition: "none" });
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setStyle({
          transform: `translateX(${target}px)`,
          transition: `transform ${durationMs}ms cubic-bezier(0.12, 0.78, 0.18, 1)`,
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [rolling, roundSeq, winningIndex, durationMs]);

  return (
    <div
      ref={viewportRef}
      className="relative h-24 overflow-hidden rounded-xl border border-border bg-card/40"
    >
      {/* Edge fades for depth */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-linear-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l from-background to-transparent" />

      {/* Center marker */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 -translate-x-1/2">
        <div className="h-full w-0.5 bg-foreground/80 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
        <div className="absolute -top-px left-1/2 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-foreground/80" />
        <div className="absolute -bottom-px left-1/2 -translate-x-1/2 border-x-[6px] border-b-[7px] border-x-transparent border-b-foreground/80" />
      </div>

      {/* The strip */}
      <div className="flex h-full items-center" style={style}>
        {reel.map((slot, i) => (
          <div
            key={i}
            className="flex shrink-0 items-center justify-center px-1"
            style={{ width: TILE_STRIDE }}
          >
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-md text-lg font-bold tabular-nums ${tileClasses(
                slot.color,
              )}`}
            >
              {slot.n}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
