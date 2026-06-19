import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, RotateCcw, Sparkles, Swords } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Coin } from "./Coin";
import {
  SIDES,
  SIDE_LABEL,
  otherSide,
  flipCoin,
  FAIR_CHANCE,
  sideTextClass,
  sideButtonClasses,
  sideCardClasses,
  type CoinSide,
} from "./engine";
import { formatMoney } from "../roulette/engine";
import {
  usePersistentState,
  STARTING_BALANCE,
  MONEY_CHEAT_AMOUNT,
  ROULETTE_MONEY_CODE,
} from "../roulette/storage";
import {
  randomBettorName,
  avatarColor,
  bettorInitial,
} from "../roulette/bettors";

type Phase = "idle" | "matching" | "flipping" | "result";

interface Player {
  name: string;
  stake: number;
  isYou: boolean;
}

interface LastResult {
  winner: CoinSide;
  youWon: boolean;
  payout: number;
  yourStake: number;
}

const FLIP_DURATION_MS = 3400;
const RESULT_DURATION_MS = 3500;
const MATCH_DELAY_MS = 1300;
const COUNTDOWN_MS = 2200;

const QUICK_ADD = [10, 100, 1000, 10000] as const;

/** Opponent stake roughly mirrors yours so the flip feels like a real match. */
function rollOpponentStake(yourStake: number): number {
  const factor = 0.6 + Math.random() * 0.9; // 0.6x - 1.5x
  return Math.max(10, Math.round((yourStake * factor) / 10) * 10);
}

export function CoinflipPanel({ panelId: _panelId }: { panelId: string }) {
  const [balance, setBalance] = usePersistentState<number>(
    "commiq.coinflip.balance",
    STARTING_BALANCE,
  );
  const [history, setHistory] = usePersistentState<CoinSide[]>(
    "commiq.coinflip.history",
    [],
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [chosenSide, setChosenSide] = useState<CoinSide>("green");
  const [amount, setAmount] = useState(0);
  const [lastAmount, setLastAmount] = useState(0);
  const [flipSeq, setFlipSeq] = useState(0);
  const [winner, setWinner] = useState<CoinSide | null>(null);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [cheatInput, setCheatInput] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Who occupies each side this round (null = open seat).
  const [players, setPlayers] = useState<Record<CoinSide, Player | null>>({
    green: null,
    red: null,
  });

  const yourSide = chosenSide;
  const greenStake = players.green?.stake ?? 0;
  const redStake = players.red?.stake ?? 0;
  const pot = greenStake + redStake;

  // Ref so the resolve timer reads final stakes without re-subscribing.
  const playersRef = useRef(players);
  playersRef.current = players;
  const winnerRef = useRef(winner);
  winnerRef.current = winner;

  const resolveRound = useCallback(
    (win: CoinSide) => {
      const seats = playersRef.current;
      const you = (Object.entries(seats) as [CoinSide, Player | null][]).find(
        ([, p]) => p?.isYou,
      );
      const yourSeat = you?.[0] ?? null;
      const yourStake = you?.[1]?.stake ?? 0;
      const total =
        (seats.green?.stake ?? 0) + (seats.red?.stake ?? 0);
      const youWon = yourSeat === win;
      const payout = youWon ? total : 0;
      if (payout > 0) setBalance((b) => b + payout);
      setLastResult({ winner: win, youWon, payout, yourStake });
      setHistory((h) => [win, ...h].slice(0, 20));
    },
    [setBalance, setHistory],
  );

  // Round loop driven by phase transitions.
  useEffect(() => {
    if (phase === "matching") {
      const timers: ReturnType<typeof setTimeout>[] = [];
      // Opponent joins the open seat shortly after you lock in.
      timers.push(
        setTimeout(() => {
          setPlayers((prev) => {
            const open = prev.green?.isYou ? "red" : "green";
            const yourStake = prev[otherSide(open)]?.stake ?? 0;
            return {
              ...prev,
              [open]: {
                name: randomBettorName(),
                stake: rollOpponentStake(yourStake),
                isYou: false,
              },
            };
          });
        }, MATCH_DELAY_MS),
      );
      // Then flip, weighted by the final stakes.
      timers.push(
        setTimeout(() => {
          setWinner(flipCoin());
          setFlipSeq((s) => s + 1);
          setPhase("flipping");
        }, MATCH_DELAY_MS + COUNTDOWN_MS),
      );
      return () => timers.forEach(clearTimeout);
    }
    if (phase === "flipping") {
      const t = setTimeout(() => {
        resolveRound(winnerRef.current ?? "green");
        setPhase("result");
      }, FLIP_DURATION_MS);
      return () => clearTimeout(t);
    }
    if (phase === "result") {
      const t = setTimeout(() => {
        setPlayers({ green: null, red: null });
        setWinner(null);
        setPhase("idle");
      }, RESULT_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [phase, resolveRound]);

  const canBet = phase === "idle";
  const canPlace = canBet && amount > 0 && amount <= balance;

  const placeBet = useCallback(() => {
    if (!canPlace) return;
    setBalance((b) => b - amount);
    setLastAmount(amount);
    setPlayers({
      green: yourSide === "green" ? { name: "You", stake: amount, isYou: true } : null,
      red:
        yourSide === "red" ? { name: "You", stake: amount, isYou: true } : null,
    });
    setLastResult(null);
    setPhase("matching");
  }, [canPlace, amount, balance, yourSide, setBalance]);

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
    setBalance(STARTING_BALANCE);
    setHistory([]);
  }, [setBalance, setHistory]);

  const phaseLabel =
    phase === "idle"
      ? "Pick a side"
      : phase === "matching"
        ? players.green && players.red
          ? "Flipping soon..."
          : "Finding opponent..."
        : phase === "flipping"
          ? "Flipping..."
          : "Round over";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-background p-4 text-sm text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="bg-linear-to-br from-emerald-300 via-zinc-300 to-red-400 bg-clip-text text-2xl font-bold leading-tight tracking-tight text-transparent">
            Coinflip
          </h1>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {phaseLabel}
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
              No flips yet
            </span>
          )}
          {history.map((side, i) => (
            <div
              key={i}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white",
                side === "green" ? "bg-emerald-600" : "bg-red-600",
                i === 0 && "ring-2 ring-foreground/40",
              )}
            >
              {SIDE_LABEL[side][0]}
            </div>
          ))}
        </div>
      </div>

      {/* Coin arena — its own stage, separate from the betting controls */}
      <div className="flex items-center justify-center rounded-xl border border-border/60 bg-card/30 py-10">
        <Coin
          flipping={phase === "flipping"}
          winner={winner}
          flipSeq={flipSeq}
          durationMs={FLIP_DURATION_MS}
          restingSide={yourSide}
        />
      </div>

      {/* Matchup: green player | pot | red player */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border/60 bg-card/30 p-3">
        <PlayerSeat
          side="green"
          player={players.green}
          chance={FAIR_CHANCE}
          showChance={pot > 0}
          active={winner === "green" || (canBet && yourSide === "green")}
          align="end"
        />

        <div className="flex flex-col items-center px-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Pot
          </span>
          <span className="font-mono text-base font-bold tabular-nums text-foreground">
            {formatMoney(pot)}
          </span>
        </div>

        <PlayerSeat
          side="red"
          player={players.red}
          chance={FAIR_CHANCE}
          showChance={pot > 0}
          active={winner === "red" || (canBet && yourSide === "red")}
          align="start"
        />
      </div>

      {/* Result banner */}
      <div className="flex h-7 items-center justify-center">
        {phase === "result" && lastResult && (
          <span
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              lastResult.youWon ? "text-emerald-400" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white",
                lastResult.winner === "green" ? "bg-emerald-600" : "bg-red-600",
              )}
            >
              {SIDE_LABEL[lastResult.winner]} wins
            </span>
            {lastResult.youWon
              ? `You won ${formatMoney(lastResult.payout)}`
              : lastResult.yourStake > 0
                ? `You lost ${formatMoney(lastResult.yourStake)}`
                : ""}
          </span>
        )}
      </div>

      {/* Side picker */}
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side) => (
          <button
            key={side}
            onClick={() => canBet && setChosenSide(side)}
            disabled={!canBet}
            className={cn(
              sideButtonClasses(side, yourSide === side),
              !canBet && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="text-base">{SIDE_LABEL[side]}</span>
            <span className="text-[11px] font-medium text-white/85">
              2x payout
            </span>
          </button>
        ))}
      </div>

      {/* Bet amount controls */}
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
            onClick={placeBet}
            disabled={!canPlace}
            className={cn(
              "h-10 gap-2 px-5 font-bold",
              yourSide === "green"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-red-600 hover:bg-red-500",
              "text-white",
            )}
          >
            <Swords className="size-4" />
            Flip {SIDE_LABEL[yourSide]}
          </Button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Cheat console */}
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3 text-muted-foreground/60" />
          <span className="font-mono text-xs text-muted-foreground/60">&gt;</span>
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
  );
}

interface PlayerSeatProps {
  side: CoinSide;
  player: Player | null;
  chance: number;
  showChance: boolean;
  active: boolean;
  align: "start" | "end";
}

function PlayerSeat({
  side,
  player,
  chance,
  showChance,
  active,
  align,
}: PlayerSeatProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors",
        sideCardClasses(side, active),
        align === "end" ? "items-end text-right" : "items-start text-left",
      )}
    >
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
          sideTextClass(side),
        )}
      >
        {SIDE_LABEL[side]}
      </span>
      {player ? (
        <div
          className={cn(
            "flex w-full items-center gap-2",
            align === "end" && "flex-row-reverse",
          )}
        >
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: avatarColor(player.name) }}
          >
            {bettorInitial(player.name)}
          </div>
          <div
            className={cn(
              "flex min-w-0 flex-col",
              align === "end" ? "items-end" : "items-start",
            )}
          >
            <span
              className={cn(
                "max-w-[90px] truncate text-xs",
                player.isYou
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {player.name}
            </span>
            <span className="font-mono text-xs tabular-nums text-foreground/80">
              {formatMoney(player.stake)}
            </span>
          </div>
        </div>
      ) : (
        <span className="text-xs italic text-muted-foreground/50">
          Open seat
        </span>
      )}
      {showChance && (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
          {Math.round(chance * 100)}% win
        </span>
      )}
    </div>
  );
}
