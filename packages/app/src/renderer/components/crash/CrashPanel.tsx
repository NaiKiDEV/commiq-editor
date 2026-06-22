import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, RotateCcw, Rocket, Sparkles, TrendingUp, XCircle, History } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { CrashGraph } from "./CrashGraph";
import {
  generateCrashPoint,
  multiplierAt,
  elapsedForMultiplier,
  makeBots,
  formatMultiplier,
  type CrashPhase,
  type CrashBot,
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
import { avatarColor, bettorInitial } from "../roulette/bettors";

/** How long bets stay open before the rocket launches. */
const BETTING_MS = 5000;
/** How long the bust screen lingers before the next round opens. */
const RESULT_MS = 3500;

const QUICK_ADD = [10, 100, 1000, 10000] as const;

interface ActiveBet {
  amount: number;
}

export function CrashPanel({ panelId: _panelId }: { panelId: string }) {
  const [balance, setBalance] = useSharedBalance();
  const [history, setHistory] = usePersistentState<number[]>(
    "commiq.crash.history",
    [],
  );
  const [betLog, recordBet, clearBetLog] = useBetHistory("commiq.crash.betlog");
  const [historyOpen, toggleHistory] = useHistoryOpen();

  const [phase, setPhase] = useState<CrashPhase>("betting");
  const [multiplier, setMultiplier] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [countdownMs, setCountdownMs] = useState(BETTING_MS);
  const [crashPoint, setCrashPoint] = useState(1);
  const [bots, setBots] = useState<CrashBot[]>([]);

  const [amount, setAmount] = useState(0);
  const [lastAmount, setLastAmount] = useState(0);
  const [autoTarget, setAutoTarget] = useState(0);

  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
  const [cashedAt, setCashedAt] = useState<number | null>(null);

  const [cheatInput, setCheatInput] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Refs the rAF loop reads without re-subscribing each frame.
  const startRef = useRef(0);
  const crashPointRef = useRef(1);
  const activeBetRef = useRef<ActiveBet | null>(null);
  const cashedRef = useRef<number | null>(null);
  const autoTargetRef = useRef(0);
  activeBetRef.current = activeBet;
  cashedRef.current = cashedAt;
  autoTargetRef.current = autoTarget;

  /** Pay out the active bet at a given multiplier (idempotent per round). */
  const settleCashOut = useCallback(
    (atMultiplier: number) => {
      if (!activeBetRef.current || cashedRef.current !== null) return;
      const payout = activeBetRef.current.amount * atMultiplier;
      setBalance((b) => b + payout);
      cashedRef.current = atMultiplier;
      setCashedAt(atMultiplier);
    },
    [setBalance],
  );

  // Round lifecycle driven by phase transitions.
  useEffect(() => {
    if (phase === "betting") {
      // Lock in this round's bust point and refresh the lobby.
      const cp = generateCrashPoint();
      crashPointRef.current = cp;
      setCrashPoint(cp);
      setBots(makeBots());
      setMultiplier(1);
      setElapsedMs(0);
      setCountdownMs(BETTING_MS);

      const start = Date.now();
      const id = setInterval(() => {
        const remaining = BETTING_MS - (Date.now() - start);
        if (remaining <= 0) {
          clearInterval(id);
          setCountdownMs(0);
          setPhase("running");
        } else {
          setCountdownMs(remaining);
        }
      }, 80);
      return () => clearInterval(id);
    }

    if (phase === "running") {
      startRef.current = performance.now();
      let raf = 0;
      const frame = () => {
        const elapsed = performance.now() - startRef.current;
        const m = multiplierAt(elapsed);
        const cp = crashPointRef.current;
        if (m >= cp) {
          setMultiplier(cp);
          setElapsedMs(elapsedForMultiplier(cp));
          setPhase("crashed");
          return;
        }
        const auto = autoTargetRef.current;
        if (
          auto > 0 &&
          activeBetRef.current &&
          cashedRef.current === null &&
          auto <= cp &&
          m >= auto
        ) {
          settleCashOut(auto);
        }
        setMultiplier(m);
        setElapsedMs(elapsed);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    }

    if (phase === "crashed") {
      setHistory((h) => [crashPointRef.current, ...h].slice(0, 24));
      const bet = activeBetRef.current;
      if (bet) {
        const cashed = cashedRef.current;
        const net = cashed !== null ? bet.amount * cashed - bet.amount : -bet.amount;
        recordBet({
          bet: bet.amount,
          net,
          outcome:
            cashed !== null
              ? `Cashed ${formatMultiplier(cashed)}`
              : `Busted ${formatMultiplier(crashPointRef.current)}`,
        });
      }
      const t = setTimeout(() => {
        setActiveBet(null);
        activeBetRef.current = null;
        setCashedAt(null);
        cashedRef.current = null;
        setPhase("betting");
      }, RESULT_MS);
      return () => clearTimeout(t);
    }
  }, [phase, settleCashOut, setBalance, setHistory, recordBet]);

  const canPlace =
    phase === "betting" && activeBet === null && amount > 0 && amount <= balance;
  const canCashOut =
    phase === "running" && activeBet !== null && cashedAt === null;

  const placeBet = useCallback(() => {
    if (!canPlace) return;
    setBalance((b) => b - amount);
    setLastAmount(amount);
    setActiveBet({ amount });
    activeBetRef.current = { amount };
    setCashedAt(null);
    cashedRef.current = null;
  }, [canPlace, amount, setBalance]);

  const cancelBet = useCallback(() => {
    if (phase !== "betting" || !activeBet) return;
    setBalance((b) => b + activeBet.amount);
    setActiveBet(null);
    activeBetRef.current = null;
  }, [phase, activeBet, setBalance]);

  const cashOutNow = useCallback(() => {
    if (!canCashOut) return;
    settleCashOut(multiplier);
  }, [canCashOut, multiplier, settleCashOut]);

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
    clearBetLog();
  }, [setBalance, setHistory, clearBetLog]);

  // Your live position for the lobby row + result banner.
  const yourPotential = activeBet ? activeBet.amount * multiplier : 0;
  const yourProfit =
    activeBet && cashedAt !== null
      ? activeBet.amount * cashedAt - activeBet.amount
      : 0;

  return (
    <div className="flex h-full bg-background text-sm text-foreground">
      <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            Crash
          </h1>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {phase === "betting"
              ? "Bets open"
              : phase === "running"
                ? "In flight"
                : "Busted"}
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
              No rounds yet
            </span>
          )}
          {history.map((point, i) => (
            <div
              key={i}
              className={cn(
                "flex h-6 shrink-0 items-center rounded px-1.5 font-mono text-[10px] font-bold tabular-nums",
                point >= 2
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400",
                i === 0 && "ring-1 ring-foreground/30",
              )}
            >
              {formatMultiplier(point)}
            </div>
          ))}
        </div>
      </div>

      {/* The rocket stage */}
      <CrashGraph
        phase={phase}
        multiplier={multiplier}
        elapsedMs={elapsedMs}
        crashPoint={crashPoint}
        countdownMs={countdownMs}
      />

      {/* Result banner */}
      <div className="flex h-7 items-center justify-center">
        {phase === "crashed" && activeBet && (
          <span
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              cashedAt !== null ? "text-emerald-400" : "text-red-400",
            )}
          >
            {cashedAt !== null ? (
              <>
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  Cashed @ {formatMultiplier(cashedAt)}
                </span>
                You won {formatMoney(yourProfit)}
              </>
            ) : (
              <>
                <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  Busted
                </span>
                You lost {formatMoney(activeBet.amount)}
              </>
            )}
          </span>
        )}
      </div>

      {/* Bet + cash out controls */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setAmount(0)}
            disabled={activeBet !== null}
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setAmount(lastAmount)}
            disabled={lastAmount <= 0 || activeBet !== null}
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
              disabled={activeBet !== null}
            >
              +{n}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setAmount((a) => Math.floor(a / 2))}
            disabled={activeBet !== null}
          >
            1/2
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setAmount((a) => Math.min(balance, a * 2))}
            disabled={activeBet !== null}
          >
            x2
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setAmount(Math.max(0, balance))}
            disabled={activeBet !== null}
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
            disabled={activeBet !== null}
            className={cn(
              "h-10 w-36 rounded-md border bg-background px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground/40 focus:border-ring disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              amount > balance
                ? "border-red-500/60 text-red-400"
                : "border-border text-foreground",
            )}
          />
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Auto @
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={autoTarget === 0 ? "" : autoTarget}
              onChange={(e) => {
                const n = Number(e.target.value);
                setAutoTarget(Number.isFinite(n) && n > 1 ? n : 0);
              }}
              placeholder="off"
              className="h-10 w-20 rounded-md border border-border bg-background px-2 text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          {canCashOut ? (
            <Button
              size="lg"
              onClick={cashOutNow}
              className="h-10 flex-1 gap-2 bg-amber-500 px-5 font-bold text-black hover:bg-amber-400"
            >
              <TrendingUp className="size-4" />
              Cash Out {formatMoney(yourPotential)}
            </Button>
          ) : phase === "betting" && activeBet ? (
            <Button
              size="lg"
              variant="outline"
              onClick={cancelBet}
              className="h-10 flex-1 gap-2 px-5 font-bold"
            >
              <XCircle className="size-4" />
              Cancel ({formatMoney(activeBet.amount)})
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={placeBet}
              disabled={!canPlace}
              className="h-10 flex-1 gap-2 bg-emerald-600 px-5 font-bold text-white hover:bg-emerald-500"
            >
              <Rocket className="size-4" />
              {activeBet
                ? "Bet placed"
                : phase === "betting"
                  ? "Place Bet"
                  : "Waiting..."}
            </Button>
          )}
        </div>
      </div>

      {/* Live lobby */}
      <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card/30 p-3">
        <span className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Players this round
        </span>
        {activeBet && (
          <LobbyRow
            name="You"
            bet={activeBet.amount}
            you
            status={
              cashedAt !== null
                ? { state: "cashed", at: cashedAt }
                : phase === "crashed"
                  ? { state: "busted" }
                  : { state: "in" }
            }
          />
        )}
        {bots.map((bot) => (
          <LobbyRow
            key={bot.id}
            name={bot.name}
            bet={bot.bet}
            status={resolveBot(bot, multiplier, phase, crashPoint)}
          />
        ))}
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

type LobbyStatus =
  | { state: "in" }
  | { state: "cashed"; at: number }
  | { state: "busted" };

/** Resolve a bot's outcome purely from the live multiplier and round state. */
function resolveBot(
  bot: CrashBot,
  multiplier: number,
  phase: CrashPhase,
  crashPoint: number,
): LobbyStatus {
  if (bot.target <= crashPoint && multiplier >= bot.target) {
    return { state: "cashed", at: bot.target };
  }
  if (phase === "crashed") return { state: "busted" };
  return { state: "in" };
}

interface LobbyRowProps {
  name: string;
  bet: number;
  status: LobbyStatus;
  you?: boolean;
}

function LobbyRow({ name, bet, status, you }: LobbyRowProps) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: avatarColor(name) }}
      >
        {bettorInitial(name)}
      </div>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs",
          you ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground/70">
        {formatMoney(bet)}
      </span>
      <span className="w-24 text-right font-mono text-xs tabular-nums">
        {status.state === "cashed" ? (
          <span className="text-emerald-400">
            +{formatMoney(bet * status.at - bet)}
            <span className="ml-1 text-emerald-400/60">
              {formatMultiplier(status.at)}
            </span>
          </span>
        ) : status.state === "busted" ? (
          <span className="text-red-400/80">bust</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </span>
    </div>
  );
}
