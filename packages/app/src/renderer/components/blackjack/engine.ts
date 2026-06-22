/**
 * Blackjack game logic: a multi-deck shoe, hand scoring with soft aces, the
 * dealer's fixed drawing rule, and outcome settlement. All pure, so the panel
 * stays a thin layer of state + animation timing on top of these helpers.
 *
 * Rules modelled here are the common casino set: 6-deck shoe, dealer stands on
 * all 17 (soft included), blackjack pays 3:2.
 */

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Globally unique id so React keys stay stable across deals and reshuffles. */
  id: string;
}

export const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const RANKS: readonly Rank[] = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
];

/** Decks combined into one shoe. */
const DECKS_IN_SHOE = 6;
/** Reshuffle a fresh shoe once fewer than this many cards remain. */
export const RESHUFFLE_AT = 52;

const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

/** Monotonic id source; guarantees no two cards ever share a React key. */
let cardSeq = 0;

/** Unicode pip for a suit, used by the card face. */
export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOL[suit];
}

/** Hearts and diamonds render red; spades and clubs render dark. */
export function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

/** Fisher-Yates shuffle into a new array (no mutation of the input). */
export function shuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build and shuffle a fresh shoe of `decks` standard 52-card decks. */
export function createShoe(decks = DECKS_IN_SHOE): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit, id: `c${cardSeq++}` });
      }
    }
  }
  return shuffle(cards);
}

/** Face value of a rank with the ace high (reduced to 1 later if it would bust). */
export function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return 10;
  return Number(rank);
}

export interface HandValue {
  /** Best total at or under 21 when possible. */
  total: number;
  /** True while an ace is still counted as 11. */
  soft: boolean;
  /** True when the total exceeds 21. */
  busted: boolean;
  /** True for a two-card 21 (a natural). */
  blackjack: boolean;
}

/** Score a hand, demoting aces from 11 to 1 only as needed to avoid busting. */
export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return {
    total,
    soft: aces > 0,
    busted: total > 21,
    blackjack: cards.length === 2 && total === 21,
  };
}

/** Dealer draws until reaching a hard or soft 17 (stands on all 17s). */
export function dealerShouldHit(cards: readonly Card[]): boolean {
  return handValue(cards).total < 17;
}

export type Outcome = "blackjack" | "win" | "push" | "lose";

/** Compare a finished player hand against the dealer's to decide the result. */
export function settle(
  player: readonly Card[],
  dealer: readonly Card[],
): Outcome {
  const p = handValue(player);
  const d = handValue(dealer);

  if (p.busted) return "lose";
  if (p.blackjack && d.blackjack) return "push";
  if (p.blackjack) return "blackjack";
  if (d.blackjack) return "lose";
  if (d.busted) return "win";
  if (p.total > d.total) return "win";
  if (p.total < d.total) return "lose";
  return "push";
}

/** Total returned to the player (stake-inclusive) for an outcome on `bet`. */
export function payout(outcome: Outcome, bet: number): number {
  switch (outcome) {
    case "blackjack":
      return Math.round(bet * 2.5); // 3:2 winnings plus the original stake
    case "win":
      return bet * 2;
    case "push":
      return bet;
    case "lose":
      return 0;
  }
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  blackjack: "Blackjack",
  win: "You win",
  push: "Push",
  lose: "Dealer wins",
};
