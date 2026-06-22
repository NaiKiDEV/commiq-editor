import { isRedSuit, suitSymbol, type Card } from "./engine";

interface PlayingCardProps {
  card: Card;
  /** When true the card shows its back (used for the dealer's hole card). */
  faceDown?: boolean;
  /** Position in the hand; staggers the deal-in animation left to right. */
  index: number;
}

/** Card footprint in px. Kept compact so a 5+ card hand still fits the table. */
const WIDTH = 60;
const HEIGHT = 84;

/**
 * A single playing card. New cards slide and fade in (staggered by `index`),
 * and the whole card flips on the Y axis between its back and face so the
 * dealer's hole card can reveal in place without remounting.
 */
export function PlayingCard({ card, faceDown = false, index }: PlayingCardProps) {
  const red = isRedSuit(card.suit);
  const symbol = suitSymbol(card.suit);

  return (
    <div
      className="bj-card-deal shrink-0"
      style={{
        width: WIDTH,
        height: HEIGHT,
        perspective: 700,
        animationDelay: `${index * 80}ms`,
      }}
    >
      <style>{cardKeyframes}</style>
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          transform: faceDown ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Face */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-md bg-white p-1.5 shadow-md ring-1 ring-black/20"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span
            className={`font-mono text-[11px] font-bold leading-none ${red ? "text-red-600" : "text-zinc-900"}`}
          >
            {card.rank}
            <span className="block text-[10px]">{symbol}</span>
          </span>
          <span
            className={`self-center text-xl leading-none ${red ? "text-red-600" : "text-zinc-900"}`}
          >
            {symbol}
          </span>
          <span
            className={`rotate-180 font-mono text-[11px] font-bold leading-none ${red ? "text-red-600" : "text-zinc-900"}`}
          >
            {card.rank}
            <span className="block text-[10px]">{symbol}</span>
          </span>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 overflow-hidden rounded-md ring-1 ring-black/30"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "repeating-linear-gradient(45deg, hsl(222 47% 30%) 0 6px, hsl(222 47% 22%) 6px 12px)",
          }}
        >
          <div className="absolute inset-1 rounded-sm border border-white/20" />
        </div>
      </div>
    </div>
  );
}

const cardKeyframes = `
@keyframes bj-card-deal {
  0%   { opacity: 0; transform: translateY(-14px) scale(0.92); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.bj-card-deal { animation: bj-card-deal 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
`;
