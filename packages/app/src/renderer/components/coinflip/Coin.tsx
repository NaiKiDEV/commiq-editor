import { useEffect, useRef, useState } from "react";
import { SIDE_COLOR, type CoinSide } from "./engine";

interface CoinProps {
  /** True while the coin is mid-flip (drives the spin transition). */
  flipping: boolean;
  /** The side the coin will land on; null while idle. */
  winner: CoinSide | null;
  /** Increments on each new flip so the spin re-triggers. */
  flipSeq: number;
  /** Flip duration in ms; matches the panel's resolve timer. */
  durationMs: number;
  /** Face shown at rest before any flip (the player's current pick). */
  restingSide: CoinSide;
}

/** Diameter of the coin in px. */
const SIZE = 168;
/** Half the coin's thickness; pushes each face off the spin axis. */
const HALF_DEPTH = 6;

/**
 * A 3D coin. The green face sits at rotateX(0deg) and red at rotateX(180deg);
 * landing on a side means ending the spin on that face's multiple.
 *
 * The flip is a toss: a stable inner element keeps a long ease-out rotateX
 * transition (deterministic landing) while an outer wrapper plays a one-shot
 * "toss" keyframe — leaping up, scaling toward the viewer, and dropping back —
 * restarted each flip via the reflow trick so the spin state is never reset.
 */
export function Coin({
  flipping,
  winner,
  flipSeq,
  durationMs,
  restingSide,
}: CoinProps) {
  const [rotX, setRotX] = useState(restingSide === "green" ? 0 : 180);
  const tossRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  // Re-trigger the spin + toss whenever a new flip begins.
  useEffect(() => {
    if (winner === null) return;

    // Restart the one-shot toss / shadow animations without remounting.
    restartAnimation(tossRef.current, `coin-toss ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1) both`);
    restartAnimation(shadowRef.current, `coin-shadow ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1) both`);

    setRotX((prev) => {
      const spins = 8 + Math.floor(Math.random() * 5); // 8-12 full tumbles
      const base = Math.ceil(prev / 360) * 360; // next clean rotation up
      const offset = winner === "green" ? 0 : 180;
      return base + spins * 360 + offset;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipSeq]);

  // While idle, gently show the player's currently-picked face.
  useEffect(() => {
    if (flipping || winner !== null) return;
    setRotX((prev) => {
      const target = restingSide === "green" ? 0 : 180;
      const base = Math.round(prev / 360) * 360;
      return base + target;
    });
  }, [restingSide, flipping, winner]);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: SIZE, height: SIZE, perspective: 800 }}
    >
      <style>{coinKeyframes}</style>

      {/* Ground shadow that shrinks as the coin leaps. */}
      <div
        ref={shadowRef}
        className="absolute left-1/2 top-full h-3 w-28 -translate-x-1/2 rounded-[50%] bg-black/45 blur-md"
      />

      {/* Toss wrapper: vertical leap + scale, returns to identity. */}
      <div
        ref={tossRef}
        className="relative"
        style={{ width: SIZE, height: SIZE, transformStyle: "preserve-3d" }}
      >
        {/* Spin element: deterministic landing via long ease-out transition. */}
        <div
          className="relative"
          style={{
            width: SIZE,
            height: SIZE,
            transformStyle: "preserve-3d",
            transform: `rotateX(${rotX}deg)`,
            transition: flipping
              ? `transform ${durationMs}ms cubic-bezier(0.18, 0.7, 0.16, 1)`
              : "transform 500ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <CoinFace side="green" rotation={0} />
          <CoinFace side="red" rotation={180} />
        </div>
      </div>
    </div>
  );
}

function CoinFace({ side, rotation }: { side: CoinSide; rotation: number }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-full"
      style={{
        transform: `rotateX(${rotation}deg) translateZ(${HALF_DEPTH}px)`,
        backfaceVisibility: "hidden",
        background: SIDE_COLOR[side],
        boxShadow:
          "inset 0 0 0 5px rgba(0,0,0,0.18), 0 6px 18px rgba(0,0,0,0.45)",
      }}
    >
      {/* Concentric edge ring so the disc reads as a coin without any text. */}
      <div className="absolute inset-[18px] rounded-full border-2 border-white/15" />
    </div>
  );
}

/** Restart a one-shot CSS animation on a node by clearing it and forcing reflow. */
function restartAnimation(el: HTMLElement | null, animation: string): void {
  if (!el) return;
  el.style.animation = "none";
  void el.offsetWidth; // force reflow so the next assignment replays
  el.style.animation = animation;
}

const coinKeyframes = `
@keyframes coin-toss {
  0%   { transform: translateY(0) scale(1); }
  30%  { transform: translateY(-90px) scale(1.35); }
  55%  { transform: translateY(-90px) scale(1.35); }
  92%  { transform: translateY(0) scale(1.04); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes coin-shadow {
  0%   { transform: translateX(-50%) scaleX(1); opacity: 0.45; }
  42%  { transform: translateX(-50%) scaleX(0.45); opacity: 0.2; }
  100% { transform: translateX(-50%) scaleX(1); opacity: 0.45; }
}
`;
