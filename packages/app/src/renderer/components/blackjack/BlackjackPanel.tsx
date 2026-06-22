import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coins,
  RotateCcw,
  Sparkles,
  History,
  Spade,
  Hand,
  Plus,
  ChevronsUp,
} from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";
import {
  createShoe,
  handValue,
  dealerShouldHit,
  settle,
  payout,
  OUTCOME_LABEL,
  RESHUFFLE_AT,
  type Card,
  type Outcome,
} from "./engine";
import { formatMoney } from "../roulette/engine";
import {
  usePersistentState,
  STARTING_BALANCE,
  MONEY_CHEAT_AMOUNT,
  ROULETTE_MONEY_CODE,
} from "../roulette/storage";
import { useSharedBalance } from "../casino/balance";
import { useBetHistory, useHistoryOpen } from "../casino/betHistoryStore";
import { BetHistory } from "../casino/BetHistory";

type Phase = "betting" | "player" | "dealer" | "resolved";

const QUICK_ADD = [10, 100, 1000, 10000] as const;

/** Beat after the hole card flips before the dealer draws or the round settles. */
const REVEAL_MS = 650;
/** Pause between each dealer hit so the draw reads one card at a time. */
const DEALER_STEP_MS = 750;

/** Chip colour for a recorded outcome in the "Last" strip. */
function outcomeChipClass(outcome: Outcome): string {
  switch (outcome) {
    case "blackjack":
      return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40";
    case "win":
      return "bg-emerald-500/15 text-emerald-400";
    case "push":
      return "bg-amber-500/15 text-amber-400";
    case "lose":
      return "bg-red-500/15 text-red-400";
  }
}

export function BlackjackPanel({ panelId: _panelId }: { panelId: string }) {
  const [balance, setBalance] = useSharedBalance();
  const [history, setHistory] = usePersistentState<Outcome[]>(
    "commiq.blackjack.history",
    [],
  );
  const [betLog, recordBet, clearBetLog] = useBetHistory("commiq.blackjack.betlog");
  const [historyOpen, toggleHistory] = useHistoryOpen();

  const [phase, setPhase] = useState<Phase>("betting");
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [revealHole, setRevealHole] = useState(false);
  const [bet, setBet] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const [amount, setAmount] = useState(0);
  const [lastAmount, setLastAmount] = useState(0);
  const [cheatInput, setCheatInput] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // The shoe lives in a ref so drawing never triggers a re-render. Built lazily
  // on first draw and reshuffled once it runs low.
  const shoeRef = useRef<Card[] | null>(null);
  // Single pending dealer/reveal timer; cleared on unmount and on each new deal.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const drawCard = useCallback((): Card => {
    if (!shoeRef.current || shoeRef.current.length < RESHUFFLE_AT) {
      shoeRef.current = createShoe();
    }
    return shoeRef.current.shift()!;
  }, []);

  const resolve = useCallback(
    (player: Card[], dealer: Card[], stake: number) => {
      const result = settle(player, dealer);
      const returned = payout(result, stake);
      if (returned > 0) setBalance((b) => b + returned);
      setOutcome(result);
      setPhase("resolved");
      setHistory((h) => [result, ...h].slice(0, 24));
      recordBet({
        bet: stake,
        net: returned - stake,
        outcome: OUTCOME_LABEL[result],
      });
    },
    [setBalance, setHistory, recordBet],
  );

  // Reveal the hole card, let the dealer draw to 17 (skipped if the player
  // busted), then settle. One timer is reused for the whole sequence.
  const playDealer = useCallback(
    (player: Card[], startDealer: Card[], stake: number) => {
      setPhase("dealer");
      setRevealHole(true);
      const playerBusted = handValue(player).busted;

      const step = (dealer: Card[]) => {
        if (!playerBusted && dealerShouldHit(dealer)) {
          const next = [...dealer, drawCard()];
          setDealerCards(next);
          timerRef.current = setTimeout(() => step(next), DEALER_STEP_MS);
        } else {
          resolve(player, dealer, stake);
        }
      };

      timerRef.current = setTimeout(() => step(startDealer), REVEAL_MS);
    },
    [drawCard, resolve],
  );

  const canDeal =
    (phase === "betting" || phase === "resolved") &&
    amount > 0 &&
    amount <= balance;

  const deal = useCallback(() => {
    if (!canDeal) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    setBalance((b) => b - amount);
    setBet(amount);
    setLastAmount(amount);
    setOutcome(null);
    setRevealHole(false);

    const player = [drawCard(), drawCard()];
    const dealer = [drawCard(), drawCard()];
    setPlayerCards(player);
    setDealerCards(dealer);

    // Naturals end the hand immediately: reveal and settle, no dealer draw.
    if (handValue(player).blackjack || handValue(dealer).blackjack) {
      setPhase("dealer");
      setRevealHole(true);
      timerRef.current = setTimeout(
        () => resolve(player, dealer, amount),
        REVEAL_MS,
      );
      return;
    }

    setPhase("player");
  }, [canDeal, amount, balance, drawCard, resolve, setBalance]);

  const hit = useCallback(() => {
    if (phase !== "player") return;
    const player = [...playerCards, drawCard()];
    setPlayerCards(player);
    const value = handValue(player);
    // Bust ends the hand; a 21 auto-stands so the dealer plays it out.
    if (value.busted || value.total === 21) {
      playDealer(player, dealerCards, bet);
    }
  }, [phase, playerCards, dealerCards, bet, drawCard, playDealer]);

  const stand = useCallback(() => {
    if (phase !== "player") return;
    playDealer(playerCards, dealerCards, bet);
  }, [phase, playerCards, dealerCards, bet, playDealer]);

  const canDouble =
    phase === "player" && playerCards.length === 2 && balance >= bet;

  const doubleDown = useCallback(() => {
    if (!canDouble) return;
    setBalance((b) => b - bet);
    const stake = bet * 2;
    setBet(stake);
    const player = [...playerCards, drawCard()];
    setPlayerCards(player);
    playDealer(player, dealerCards, stake);
  }, [canDouble, bet, playerCards, dealerCards, drawCard, playDealer, setBalance]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }, []);

  const submitCheat = useCallback(() => {
    const code = cheatInput.trim().toLowerCase();
    setCheatInput("");
    if (!code) return;
    if (code === ROULETTE_MONEY_CODE) {
      setBalance((b) => b + MONEY_CHEAT_AMOUNT);
      showFlash(`Cheat accepted: +${formatMoney(MONEY_CHEAT_AMOUNT)}`);
    } else {
      showFlash("Unknown code");
    }
  }, [cheatInput, setBalance, showFlash]);

  const resetGame = useCallback(() => {
    if (!window.confirm("Reset balance and history?")) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setBalance(STARTING_BALANCE);
    setHistory([]);
    clearBetLog();
    setPhase("betting");
    setPlayerCards([]);
    setDealerCards([]);
    setOutcome(null);
    setRevealHole(false);
  }, [setBalance, setHistory, clearBetLog]);

  // Only the up-card counts toward the dealer's shown total until the reveal.
  const dealerValue = useMemo(
    () => handValue(revealHole ? dealerCards : dealerCards.slice(0, 1)),
    [dealerCards, revealHole],
  );
  const playerValue = useMemo(() => handValue(playerCards), [playerCards]);
  const dealt = playerCards.length > 0;

  const phaseLabel =
    phase === "betting"
      ? "Place your bet"
      : phase === "player"
        ? "Hit or stand"
        : phase === "dealer"
          ? "Dealer plays"
          : outcome
            ? OUTCOME_LABEL[outcome]
            : "Round over";

  return (
    <div className="flex h-full bg-background text-sm text-foreground">
      <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
              Blackjack
            </h1>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              {phaseLabel} · pays 3:2
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                Balance
              </span>
              <span className="flex items-center gap-1.5 font-mono text-lg font-bold tabular-nums text-emerald-400">
                <Coins className="size-4" />
                {formatMoney(balance)}
              </span>
            </div>
            {!historyOpen && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={toggleHistory}
                title="Show bet history"
              >
                <History className="size-3.5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={resetGame}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="size-3" />
              Reset
            </Button>
          </div>
        </div>

        {/* History */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Last
          </span>
          <div className="flex items-center gap-1 overflow-hidden">
            {history.length === 0 && (
              <span className="text-xs text-muted-foreground/50">
                No hands yet
              </span>
            )}
            {history.map((result, i) => (
              <div
                key={i}
                className={cn(
                  "flex h-6 shrink-0 items-center rounded px-1.5 text-[10px] font-bold uppercase tracking-wide",
                  outcomeChipClass(result),
                  i === 0 && "ring-1 ring-foreground/30",
                )}
              >
                {result === "blackjack"
                  ? "BJ"
                  : result === "win"
                    ? "Win"
                    : result === "push"
                      ? "Push"
                      : "Loss"}
              </div>
            ))}
          </div>
        </div>

        {/* The felt table */}
        <div
          className="flex flex-1 flex-col justify-between gap-2 rounded-xl border border-emerald-900/40 p-5 shadow-inner"
          style={{
            background:
              "radial-gradient(ellipse at 50% 25%, hsl(155 42% 17%), hsl(155 48% 10%))",
          }}
        >
          <style>{tableKeyframes}</style>

          {/* Dealer */}
          <Seat
            label="Dealer"
            cards={dealerCards}
            holeHidden={!revealHole}
            value={dealerValue}
            showValue={dealt}
          />

          <div className="flex items-center justify-center py-1">
            {dealt ? (
              <BetChip amount={bet} />
            ) : (
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                Blackjack pays 3 to 2
              </span>
            )}
          </div>

          {/* Player */}
          <Seat
            label="You"
            cards={playerCards}
            holeHidden={false}
            value={playerValue}
            showValue={dealt}
            highlight
            glow={
              phase === "resolved" &&
              (outcome === "win" || outcome === "blackjack")
            }
          />
        </div>

        {/* Result banner */}
        <div className="flex h-7 items-center justify-center">
          {phase === "resolved" && outcome && (
            <span
              key={`${outcome}-${history.length}`}
              className={cn(
                "bj-result-pop flex items-center gap-2 text-sm font-semibold",
                outcome === "blackjack" || outcome === "win"
                  ? "text-emerald-400"
                  : outcome === "push"
                    ? "text-amber-400"
                    : "text-red-400",
              )}
            >
              {OUTCOME_LABEL[outcome]}
              {outcome === "blackjack" || outcome === "win"
                ? ` · +${formatMoney(payout(outcome, bet) - bet)}`
                : outcome === "push"
                  ? " · bet returned"
                  : ` · -${formatMoney(bet)}`}
            </span>
          )}
        </div>

        {/* Actions: hit/stand/double while playing, otherwise the bet controls */}
        {phase === "player" ? (
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="lg"
              onClick={hit}
              className="h-11 gap-2 bg-emerald-600 font-bold text-white hover:bg-emerald-500"
            >
              <Plus className="size-4" />
              Hit
            </Button>
            <Button
              size="lg"
              onClick={stand}
              variant="outline"
              className="h-11 gap-2 font-bold"
            >
              <Hand className="size-4" />
              Stand
            </Button>
            <Button
              size="lg"
              onClick={doubleDown}
              disabled={!canDouble}
              variant="outline"
              className="h-11 gap-2 font-bold"
            >
              <ChevronsUp className="size-4" />
              Double
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setAmount(0)}
              >
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setAmount(lastAmount)}
                disabled={lastAmount <= 0}
              >
                Last
              </Button>
              {QUICK_ADD.map((n) => (
                <Button
                  key={n}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setAmount((a) => a + n)}
                >
                  +{n}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setAmount((a) => Math.floor(a / 2))}
              >
                1/2
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setAmount((a) => Math.min(balance, a * 2))}
              >
                x2
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setAmount(Math.max(0, balance))}
              >
                Max
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={amount === 0 ? "" : amount}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setAmount(Number.isFinite(n) && n > 0 ? n : 0);
                }}
                placeholder="Bet amount"
                className={cn(
                  "h-10 flex-1 rounded-md border bg-background px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground/40 focus:border-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                  amount > balance
                    ? "border-red-500/60 text-red-400"
                    : "border-border text-foreground",
                )}
              />
              <Button
                size="lg"
                onClick={deal}
                disabled={!canDeal}
                className="h-10 gap-2 px-5 font-bold"
              >
                <Spade className="size-4" />
                Deal {amount > 0 ? formatMoney(amount) : ""}
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Cheat console */}
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3 text-muted-foreground/60" />
            <span className="font-mono text-xs text-muted-foreground/60">
              &gt;
            </span>
            <input
              type="text"
              value={cheatInput}
              onChange={(e) => setCheatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCheat();
              }}
              placeholder="enter code"
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
            />
            {flash && (
              <span className="font-mono text-xs text-emerald-400">{flash}</span>
            )}
          </div>
        </div>
      </div>

      {historyOpen && (
        <BetHistory
          entries={betLog}
          onClear={clearBetLog}
          onClose={toggleHistory}
        />
      )}
    </div>
  );
}

interface SeatProps {
  label: string;
  cards: Card[];
  /** Hides the second card (the dealer's hole card) until the reveal. */
  holeHidden: boolean;
  value: ReturnType<typeof handValue>;
  showValue: boolean;
  highlight?: boolean;
  /** Pulses a green glow behind the cards (used on a winning player hand). */
  glow?: boolean;
}

function Seat({
  label,
  cards,
  holeHidden,
  value,
  showValue,
  highlight,
  glow,
}: SeatProps) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            highlight ? "text-emerald-300/90" : "text-white/50",
          )}
        >
          {label}
        </span>
        {showValue && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums",
              value.busted
                ? "bg-red-500/25 text-red-300"
                : value.blackjack
                  ? "bg-emerald-500/25 text-emerald-200"
                  : "bg-black/30 text-white/80",
            )}
          >
            {holeHidden ? `${value.total}+` : value.total}
            {value.soft && !holeHidden && !value.busted ? " soft" : ""}
          </span>
        )}
      </div>
      <div
        className={cn(
          "flex min-h-[116px] items-center justify-center gap-2 rounded-2xl px-3",
          glow && "bj-seat-glow",
        )}
      >
        {cards.length === 0 ? (
          <span className="font-mono text-xs italic text-white/30">
            {label === "You" ? "Deal to start" : "—"}
          </span>
        ) : (
          cards.map((card, i) => (
            <PlayingCard
              key={card.id}
              card={card}
              index={i}
              faceDown={holeHidden && i === 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** A casino chip on the table showing the wager riding on the current hand. */
function BetChip({ amount }: { amount: number }) {
  return (
    <div className="bj-chip-in flex items-center gap-2">
      <div className="flex size-11 items-center justify-center rounded-full border-[3px] border-dashed border-white/50 bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_4px_10px_rgba(0,0,0,0.45)]">
        <Coins className="size-5 text-amber-950/80" />
      </div>
      <span className="font-mono text-xs font-bold tabular-nums text-amber-200">
        {formatMoney(amount)}
      </span>
    </div>
  );
}

const tableKeyframes = `
@keyframes bj-chip-in {
  0%   { opacity: 0; transform: translateY(-12px) scale(0.55); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.bj-chip-in { animation: bj-chip-in 340ms cubic-bezier(0.2, 0.9, 0.25, 1) both; }

@keyframes bj-seat-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  50%      { box-shadow: 0 0 30px 4px rgba(16, 185, 129, 0.4); }
}
.bj-seat-glow { animation: bj-seat-glow 1.5s ease-in-out infinite; }

@keyframes bj-result-pop {
  0%   { opacity: 0; transform: scale(0.82); }
  60%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
.bj-result-pop { animation: bj-result-pop 320ms cubic-bezier(0.2, 0.9, 0.25, 1) both; }
`;
