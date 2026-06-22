import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coins, RotateCcw, CircleDot, Sparkles, History } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { PlinkoBoard, type BallView, type Pop } from "./PlinkoBoard";
import {
  ROW_OPTIONS,
  RISKS,
  RISK_LABEL,
  multipliersFor,
  dropBall,
  formatMultiplier,
  type Risk,
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

const QUICK_ADD = [10, 100, 1000, 10000] as const;

/** Per-row + fixed settle time, so taller boards take a touch longer to fall. */
const DUR_PER_ROW = 95;
const DUR_BASE = 350;
/** How long the bucket pop + floating multiplier animation stays mounted. */
const POP_MS = 900;

function dropDuration(rows: number): number {
  return rows * DUR_PER_ROW + DUR_BASE;
}

/** A live ball, including the captured payout so settling needs no lookups. */
interface Ball {
  id: number;
  directions: boolean[];
  bucket: number;
  bet: number;
  mult: number;
  startTime: number;
  dur: number;
}

export function PlinkoPanel({ panelId: _panelId }: { panelId: string }) {
  const [balance, setBalance] = useSharedBalance();
  const [history, setHistory] = usePersistentState<number[]>(
    "commiq.plinko.history",
    [],
  );
  const [risk, setRisk] = usePersistentState<Risk>("commiq.plinko.risk", "medium");
  const [rows, setRows] = usePersistentState<number>("commiq.plinko.rows", 12);
  const [betLog, recordBet, clearBetLog] = useBetHistory("commiq.plinko.betlog");
  const [historyOpen, toggleHistory] = useHistoryOpen();

  const [amount, setAmount] = useState(0);
  const [lastAmount, setLastAmount] = useState(0);
  const [cheatInput, setCheatInput] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  // Landings in progress; each drives a bucket pop + floating multiplier.
  const [pops, setPops] = useState<Pop[]>([]);
  // Bumped each animation frame to re-render the board with moved balls.
  const [, forceRerender] = useState(0);

  const multipliers = useMemo(() => multipliersFor(rows, risk), [rows, risk]);

  const ballsRef = useRef<Ball[]>([]);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const nextIdRef = useRef(0);
  const nextPopIdRef = useRef(0);

  // Spawn a bucket pop and schedule its removal once the animation finishes.
  const spawnPop = useCallback((bucket: number, mult: number) => {
    const id = nextPopIdRef.current++;
    setPops((prev) => [...prev, { id, bucket, mult }]);
    setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== id));
    }, POP_MS);
  }, []);

  // Single animation loop shared by every in-flight ball. When a ball reaches
  // the bottom it settles (pays out) and is removed immediately; the bucket pop
  // then plays on its own via CSS, so the ball never gets stuck in a bucket.
  const loop = useCallback(() => {
    const now = performance.now();
    const balls = ballsRef.current;

    const remaining: Ball[] = [];
    for (const ball of balls) {
      if (now - ball.startTime >= ball.dur) {
        const payout = Math.round(ball.bet * ball.mult);
        setBalance((b) => b + payout);
        setHistory((h) => [ball.mult, ...h].slice(0, 24));
        recordBet({
          bet: ball.bet,
          net: payout - ball.bet,
          outcome: formatMultiplier(ball.mult),
        });
        spawnPop(ball.bucket, ball.mult);
      } else {
        remaining.push(ball);
      }
    }
    if (remaining.length !== balls.length) ballsRef.current = remaining;

    forceRerender((t) => t + 1);
    if (ballsRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      runningRef.current = false;
    }
  }, [setBalance, setHistory, spawnPop, recordBet]);

  const ensureLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const ballsActive = ballsRef.current.length > 0;
  const canDrop = amount > 0 && amount <= balance;

  const drop = useCallback(() => {
    if (amount <= 0 || amount > balance) return;
    setBalance((b) => b - amount);
    setLastAmount(amount);

    const { directions, bucket } = dropBall(rows);
    ballsRef.current = [
      ...ballsRef.current,
      {
        id: nextIdRef.current++,
        directions,
        bucket,
        bet: amount,
        mult: multipliers[bucket],
        startTime: performance.now(),
        dur: dropDuration(rows),
      },
    ];
    ensureLoop();
  }, [amount, balance, rows, multipliers, setBalance, ensureLoop]);

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

  const ballViews: BallView[] = ballsRef.current.map((b) => ({
    id: b.id,
    directions: b.directions,
    startTime: b.startTime,
    dur: b.dur,
  }));

  const topMultiplier = multipliers[0];

  return (
    <div className="flex h-full bg-background text-sm text-foreground">
      <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            Plinko
          </h1>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {RISK_LABEL[risk]} risk · {rows} rows · up to{" "}
            {formatMultiplier(topMultiplier)}
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
              No drops yet
            </span>
          )}
          {history.map((mult, i) => (
            <div
              key={i}
              className={cn(
                "flex h-6 shrink-0 items-center rounded px-1.5 font-mono text-[10px] font-bold tabular-nums",
                mult >= 2
                  ? "bg-emerald-500/15 text-emerald-400"
                  : mult >= 1
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-red-500/15 text-red-400",
                i === 0 && "ring-1 ring-foreground/30",
              )}
            >
              {formatMultiplier(mult)}
            </div>
          ))}
        </div>
      </div>

      {/* The peg board */}
      <PlinkoBoard
        rows={rows}
        multipliers={multipliers}
        balls={ballViews}
        pops={pops}
      />

      {/* Risk + rows selectors */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Risk
          </span>
          <div className="flex items-center gap-1">
            {RISKS.map((r) => (
              <Button
                key={r}
                variant={r === risk ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setRisk(r)}
                disabled={ballsActive}
              >
                {RISK_LABEL[r]}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Rows
          </span>
          <div className="flex items-center gap-1">
            {ROW_OPTIONS.map((r) => (
              <Button
                key={r}
                variant={r === rows ? "default" : "outline"}
                size="sm"
                className="text-xs tabular-nums"
                onClick={() => setRows(r)}
                disabled={ballsActive}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
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
            onClick={drop}
            disabled={!canDrop}
            className="h-10 gap-2 px-5 font-bold"
          >
            <CircleDot className="size-4" />
            Drop {amount > 0 ? formatMoney(amount) : ""}
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
