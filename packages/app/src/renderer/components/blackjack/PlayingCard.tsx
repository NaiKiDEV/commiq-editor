import { isRedSuit, suitSymbol, type Card } from "./engine";

interface PlayingCardProps {
  card: Card;
  /** When true the card shows its back (used for the dealer's hole card). */
  faceDown?: boolean;
  /** Position in the hand; staggers the deal-in animation left to right. */
  index: number;
}

/** Card footprint in px. Roomy, since a hand rarely holds more than ~5 cards. */
const WIDTH = 82;
const HEIGHT = 116;

/**
 * A single playing card. New cards fly in from the shoe (upper right) with a
 * settling rotation, staggered by `index`, and the whole card flips on the Y
 * axis between its back and face so the dealer's hole card reveals in place
 * without remounting.
 */
export function PlayingCard({ card, faceDown = false, index }: PlayingCardProps) {
  const red = isRedSuit(card.suit);
  const symbol = suitSymbol(card.suit);
  const tone = red ? "text-red-600" : "text-zinc-900";

  return (
    <div
      className="bj-card-deal shrink-0 drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]"
      style={{
        width: WIDTH,
        height: HEIGHT,
        perspective: 800,
        animationDelay: `${index * 110}ms`,
      }}
    >
      <style>{cardKeyframes}</style>
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          transform: faceDown ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Face */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-lg bg-white p-2 shadow-md ring-1 ring-black/20"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className={`font-mono text-sm font-bold leading-none ${tone}`}>
            {card.rank}
            <span className="block text-xs">{symbol}</span>
          </span>
          <span className={`self-center text-4xl leading-none ${tone}`}>
            {symbol}
          </span>
          <span
            className={`rotate-180 font-mono text-sm font-bold leading-none ${tone}`}
          >
            {card.rank}
            <span className="block text-xs">{symbol}</span>
          </span>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 overflow-hidden rounded-lg ring-1 ring-black/30"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "repeating-linear-gradient(45deg, hsl(222 47% 32%) 0 7px, hsl(222 47% 22%) 7px 14px)",
          }}
        >
          <div className="absolute inset-1.5 rounded-md border border-white/20" />
          <div className="absolute inset-0 flex items-center justify-center text-lg text-white/25">
            ♠
          </div>
        </div>
      </div>
    </div>
  );
}

const cardKeyframes = `
@keyframes bj-card-deal {
  0%   { opacity: 0; transform: translate(46px, -58px) rotate(-13deg) scale(0.82); }
  55%  { opacity: 1; }
  100% { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(1); }
}
.bj-card-deal { animation: bj-card-deal 380ms cubic-bezier(0.18, 0.9, 0.24, 1) both; }
`;
