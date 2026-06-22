import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, RotateCcw, Sparkles, History } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Reel } from "./Reel";
import { Countdown } from "./Countdown";
import {
  WHEEL,
  MULTIPLIER,
  COLOR_RANGE_LABEL,
  formatMoney,
  tileClasses,
  betButtonClasses,
  pickWinnerIndex,
  type RouletteColor,
  type WheelSlot,
} from "./engine";
import {
  usePersistentState,
  STARTING_BALANCE,
  MONEY_CHEAT_AMOUNT,
  ROULETTE_MONEY_CODE,
} from "./storage";
import { useSharedBalance } from "../casino/balance";
import { useBetHistory, useHistoryOpen } from "../casino/betHistoryStore";
import { BetHistory } from "../casino/BetHistory";
import {
  type Bettor,
  type BettorBoard,
  EMPTY_BOARD,
  randomBettorName,
  randomBetAmount,
  randomBetColor,
  avatarColor,
  bettorInitial,
} from "./bettors";

type Phase = "betting" | "rolling" | "result";
type Bets = Record<RouletteColor, number>;

const ROLL_DURATION_MS = 6000;
const RESULT_DURATION_MS = 4000;

const BET_DURATION_OPTIONS = [15000, 20000, 30000] as const;
const QUICK_ADD = [1, 10, 100, 1000] as const;

const EMPTY_BETS: Bets = { red: 0, black: 0, green: 0 };
const COLORS: RouletteColor[] = ["red", "green", "black"];

interface LastResult {
  slot: WheelSlot;
  staked: Bets;
  payout: number;
}

export function RoulettePanel({ panelId: _panelId }: { panelId: string }) {
  const [balance, setBalance] = useSharedBalance();
  const [history, setHistory] = usePersistentState<WheelSlot[]>(
    "commiq.roulette.history",
    [],
  );
  const [betDurationMs, setBetDurationMs] = usePersistentState<number>(
    "commiq.roulette.betDuration",
    20000,
  );
  const [betLog, recordBet, clearBetLog] = useBetHistory("commiq.roulette.betlog");
  const [historyOpen, toggleHistory] = useHistoryOpen();

  const [phase, setPhase] = useState<Phase>("betting");
  const [roundSeq, setRoundSeq] = useState(0);
  const [winningIndex, setWinningIndex] = useState(0);
  const [bets, setBets] = useState<Bets>(EMPTY_BETS);
  const [amount, setAmount] = useState(0);
  const [lastAmount, setLastAmount] = useState(0);
  const [phaseEndsAt, setPhaseEndsAt] = useState(Date.now());
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [cheatInput, setCheatInput] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  // Bettor lists per color for the current round (your bet + simulated bots).
  const [board, setBoard] = useState<BettorBoard>(EMPTY_BOARD);

  // Refs so the round-loop effect can resolve without re-subscribing on every bet.
  const betsRef = useRef(bets);
  betsRef.current = bets;
  const winningIndexRef = useRef(winningIndex);
  winningIndexRef.current = winningIndex;

  const resolveRound = useCallback(
    (winIndex: number) => {
      const slot = WHEEL[winIndex];
      const staked = betsRef.current;
      const total = staked.red + staked.black + staked.green;
      const payout = staked[slot.color] * MULTIPLIER[slot.color];
      if (payout > 0) setBalance((b) => b + payout);
      setLastResult({ slot, staked: { ...staked }, payout });
      setHistory((h) => [slot, ...h].slice(0, 18));
      if (total > 0) {
        recordBet({
          bet: total,
          net: payout - total,
          outcome: `${slot.n} ${slot.color}`,
        });
      }
    },
    [setBalance, setHistory, recordBet],
  );

  // Round loop: betting -> rolling -> result -> betting.
  useEffect(() => {
    if (phase === "betting") {
      setPhaseEndsAt(Date.now() + betDurationMs);
      setBoard(EMPTY_BOARD);

      const timers: ReturnType<typeof setTimeout>[] = [];

      // Spawn a handful of fake bettors at random moments within the window.
      const botCount = 4 + Math.floor(Math.random() * 7);
      for (let i = 0; i < botCount; i++) {
        const delay = Math.random() * Math.max(0, betDurationMs - 800);
        timers.push(
          setTimeout(() => {
            const color = randomBetColor();
            const bettor: Bettor = {
              id: crypto.randomUUID(),
              name: randomBettorName(),
              amount: randomBetAmount(),
            };
            setBoard((prev) => ({
              ...prev,
              [color]: [...prev[color], bettor],
            }));
          }, delay),
        );
      }

      timers.push(
        setTimeout(() => {
          setWinningIndex(pickWinnerIndex());
          setPhase("rolling");
        }, betDurationMs),
      );
      return () => timers.forEach(clearTimeout);
    }
    if (phase === "rolling") {
      setPhaseEndsAt(Date.now() + ROLL_DURATION_MS);
      const t = setTimeout(() => {
        resolveRound(winningIndexRef.current);
        setPhase("result");
      }, ROLL_DURATION_MS);
      return () => clearTimeout(t);
    }
    // result
    setPhaseEndsAt(Date.now() + RESULT_DURATION_MS);
    const t = setTimeout(() => {
      setBets(EMPTY_BETS);
      setRoundSeq((s) => s + 1);
      setPhase("betting");
    }, RESULT_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase, betDurationMs, resolveRound]);

  const canBet = phase === "betting";
  const canPlace = canBet && amount > 0 && amount <= balance;

  const placeBet = useCallback(
    (color: RouletteColor) => {
      if (!canBet || amount <= 0 || balance < amount) return;
      setBalance((b) => b - amount);
      setBets((prev) => ({ ...prev, [color]: prev[color] + amount }));
      setLastAmount(amount);
      // Accumulate the player's bet into a single "You" row at the top.
      setBoard((prev) => {
        const list = prev[color];
        const idx = list.findIndex((b) => b.isYou);
        const next =
          idx >= 0
            ? list.map((b, i) =>
                i === idx ? { ...b, amount: b.amount + amount } : b,
              )
            : [
                { id: "you", name: "You", amount, isYou: true },
                ...list,
              ];
        return { ...prev, [color]: next };
      });
    },
    [canBet, amount, balance, setBalance],
  );

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
    if (!window.confirm("Reset balance and history? Your bets will be lost."))
      return;
    setBalance(STARTING_BALANCE);
    setHistory([]);
    setBets(EMPTY_BETS);
    setLastResult(null);
    clearBetLog();
  }, [setBalance, setHistory, clearBetLog]);

  const phaseLabel =
    phase === "betting"
      ? "Place your bets"
      : phase === "rolling"
        ? "Rolling..."
        : "Round over";

  return (
    <div className="flex h-full bg-background text-sm text-foreground">
      <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            Roulette
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

      {/* Last rolls */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Last
        </span>
        <div className="flex items-center gap-1 overflow-hidden">
          {history.length === 0 && (
            <span className="text-xs text-muted-foreground/50">
              No rounds yet
            </span>
          )}
          {history.map((slot, i) => (
            <div
              key={i}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                tileClasses(slot.color),
                i === 0 && "ring-2 ring-foreground/40",
              )}
            >
              {slot.n}
            </div>
          ))}
        </div>
      </div>

      {/* The roll */}
      <div className="relative">
        <Reel
          winningIndex={winningIndex}
          roundSeq={roundSeq}
          rolling={phase === "rolling"}
          durationMs={ROLL_DURATION_MS}
        />
        <Countdown endsAt={phaseEndsAt} active={phase === "betting"} />
      </div>

      {/* Result banner */}
      <div className="flex h-7 items-center justify-center">
        {phase === "result" && lastResult && (
          <span
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              lastResult.payout > 0 ? "text-emerald-400" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded text-[10px] font-bold",
                tileClasses(lastResult.slot.color),
              )}
            >
              {lastResult.slot.n}
            </span>
            {lastResult.payout > 0
              ? `You won ${formatMoney(lastResult.payout)}`
              : totalForResult(lastResult) > 0
                ? `You lost ${formatMoney(totalForResult(lastResult))}`
                : lastResult.slot.color.toUpperCase()}
          </span>
        )}
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
            "h-9 w-full rounded-md border bg-background px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground/40 focus:border-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            amount > balance
              ? "border-red-500/60 text-red-400"
              : "border-border text-foreground",
          )}
        />
      </div>

      {/* Bet columns: button + live bettor list */}
      <div className="grid grid-cols-3 gap-3">
        {COLORS.map((color) => {
          const list = board[color];
          const pot = list.reduce((sum, b) => sum + b.amount, 0);
          return (
            <div key={color} className="flex min-h-0 flex-col gap-2">
              <button
                onClick={() => placeBet(color)}
                disabled={!canPlace}
                className={cn(
                  betButtonClasses(color),
                  !canPlace && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="text-base">{COLOR_RANGE_LABEL[color]}</span>
                <span className="text-[11px] font-medium text-white/85">
                  {MULTIPLIER[color]}x payout
                </span>
                {bets[color] > 0 && (
                  <span className="font-mono text-[11px] text-white/90">
                    your bet {formatMoney(bets[color])}
                  </span>
                )}
              </button>

              <div className="flex items-center justify-between px-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                <span>
                  {list.length} {list.length === 1 ? "bet" : "bets"}
                </span>
                <span className="font-mono tabular-nums text-foreground/70">
                  {formatMoney(pot)}
                </span>
              </div>

              <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-0.5">
                {list.map((bettor) => (
                  <div
                    key={bettor.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2 py-1",
                      bettor.isYou
                        ? "border-ring/50 bg-primary/10"
                        : "border-border/60 bg-card/40",
                    )}
                  >
                    <div
                      className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ backgroundColor: avatarColor(bettor.name) }}
                    >
                      {bettorInitial(bettor.name)}
                    </div>
                    <span
                      className={cn(
                        "flex-1 truncate text-xs",
                        bettor.isYou
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {bettor.name}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-foreground/80">
                      {formatMoney(bettor.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Round timing */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Round length
        </span>
        {BET_DURATION_OPTIONS.map((ms) => (
          <Button
            key={ms}
            variant={betDurationMs === ms ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => setBetDurationMs(ms)}
          >
            {ms / 1000}s
          </Button>
        ))}
      </div>

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

function totalForResult(result: LastResult): number {
  return result.staked.red + result.staked.black + result.staked.green;
}
