import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Trash2, Play, Pause, RotateCcw } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────

type TimerType = 'countdown' | 'stopwatch' | 'pomodoro' | 'interval';
type TimerStatus = 'idle' | 'running' | 'paused' | 'done';
type PomodoroPhase = 'work' | 'break';

type TimerData = {
  id: string;
  label: string;
  type: TimerType;
  status: TimerStatus;
  createdAt: number;
  durationSeconds: number;
  workSeconds: number;
  breakSeconds: number;
  repeatCount: number;
  accumulatedSeconds: number;
  startedAt: number | null;
  pomodoroPhase: PomodoroPhase;
  pomodoroRound: number;
  intervalRound: number;
};

function makeTimer(type: TimerType): TimerData {
  const base: TimerData = {
    id: crypto.randomUUID(),
    label: type.charAt(0).toUpperCase() + type.slice(1),
    type,
    status: 'idle',
    createdAt: Date.now(),
    durationSeconds: 0,
    workSeconds: 0,
    breakSeconds: 0,
    repeatCount: 0,
    accumulatedSeconds: 0,
    startedAt: null,
    pomodoroPhase: 'work',
    pomodoroRound: 1,
    intervalRound: 1,
  };
  if (type === 'countdown') return { ...base, durationSeconds: 300 };
  if (type === 'pomodoro') return { ...base, workSeconds: 1500, breakSeconds: 300 };
  if (type === 'interval') return { ...base, durationSeconds: 60, repeatCount: 3 };
  return base; // stopwatch
}

// ── Formatting helpers ─────────────────────────────────────────────────

function parseMmSs(value: string): number | null {
  const m = value.match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  if (secs >= 60) return null;
  return mins * 60 + secs;
}

function toMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatDisplayTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatStopwatchTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  if (h > 0) return formatDisplayTime(totalSeconds);
  const m = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  const cs = Math.floor((totalSeconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ── Notifications ──────────────────────────────────────────────────────

function notify(title: string, body: string): void {
  try {
    new Notification(title, { body });
  } catch { /* notifications may be blocked */ }
}

// ── Reload reconciliation ──────────────────────────────────────────────

function reconcileTimer(timer: TimerData): TimerData {
  if (timer.status !== 'running' || timer.startedAt === null) return timer;

  const now = Date.now();

  if (timer.type === 'stopwatch') {
    return { ...timer, startedAt: now };
  }

  if (timer.type === 'countdown') {
    const elapsed = timer.accumulatedSeconds + (now - timer.startedAt) / 1000;
    if (elapsed >= timer.durationSeconds) {
      return { ...timer, status: 'done', accumulatedSeconds: timer.durationSeconds, startedAt: null };
    }
    return { ...timer, accumulatedSeconds: 0, startedAt: now - elapsed * 1000 };
  }

  if (timer.type === 'pomodoro') {
    let elapsed = timer.accumulatedSeconds + (now - timer.startedAt) / 1000;
    let phase = timer.pomodoroPhase;
    let round = timer.pomodoroRound;

    if (elapsed >= (phase === 'work' ? timer.workSeconds : timer.breakSeconds)) {
      if (phase === 'work') {
        round = round + 1;
        elapsed = elapsed - timer.workSeconds;
        phase = 'break';
        if (elapsed >= timer.breakSeconds) {
          return { ...timer, status: 'done', pomodoroPhase: 'break', pomodoroRound: round, accumulatedSeconds: timer.breakSeconds, startedAt: null };
        }
      } else {
        return { ...timer, status: 'done', pomodoroPhase: 'break', pomodoroRound: round, accumulatedSeconds: timer.breakSeconds, startedAt: null };
      }
    }

    return {
      ...timer,
      pomodoroPhase: phase,
      pomodoroRound: round,
      accumulatedSeconds: 0,
      startedAt: now - elapsed * 1000,
    };
  }

  if (timer.type === 'interval') {
    if (timer.durationSeconds <= 0) {
      return { ...timer, status: 'done' };
    }
    const totalElapsed =
      (timer.intervalRound - 1) * timer.durationSeconds +
      timer.accumulatedSeconds +
      (now - timer.startedAt) / 1000;
    const completedRepeats = Math.floor(totalElapsed / timer.durationSeconds);

    if (timer.repeatCount > 0 && completedRepeats >= timer.repeatCount) {
      return { ...timer, status: 'done', startedAt: null };
    }

    const newRound = completedRepeats + 1;
    const newAcc = totalElapsed - completedRepeats * timer.durationSeconds;
    return {
      ...timer,
      intervalRound: newRound,
      accumulatedSeconds: 0,
      startedAt: now - newAcc * 1000,
    };
  }

  return timer;
}

// ── checkDone ──────────────────────────────────────────────────────────

function checkDone(
  timer: TimerData,
  elapsed: number,
  onChange: (t: TimerData) => void,
): void {
  if (timer.status !== 'running') return;

  if (timer.type === 'countdown') {
    if (elapsed >= timer.durationSeconds) {
      onChange({ ...timer, status: 'done', accumulatedSeconds: timer.durationSeconds, startedAt: null });
      notify('Timer done', timer.label);
    }
    return;
  }

  if (timer.type === 'pomodoro') {
    const phaseDur = timer.pomodoroPhase === 'work' ? timer.workSeconds : timer.breakSeconds;
    if (elapsed >= phaseDur) {
      if (timer.pomodoroPhase === 'work') {
        const next: TimerData = {
          ...timer,
          pomodoroPhase: 'break',
          pomodoroRound: timer.pomodoroRound + 1,
          accumulatedSeconds: 0,
          startedAt: Date.now(),
        };
        onChange(next);
        notify('Break time!', `${timer.label} — Round ${timer.pomodoroRound}`);
      } else {
        onChange({ ...timer, status: 'done', accumulatedSeconds: timer.breakSeconds, startedAt: null });
        notify('Timer done', timer.label);
      }
    }
    return;
  }

  if (timer.type === 'interval') {
    if (timer.durationSeconds <= 0) return;
    if (elapsed >= timer.durationSeconds) {
      const isLast = timer.repeatCount > 0 && timer.intervalRound >= timer.repeatCount;
      if (isLast) {
        onChange({ ...timer, status: 'done', accumulatedSeconds: timer.durationSeconds, startedAt: null });
        notify('Timer done', timer.label);
      } else {
        const next: TimerData = {
          ...timer,
          intervalRound: timer.intervalRound + 1,
          accumulatedSeconds: 0,
          startedAt: Date.now(),
        };
        onChange(next);
        notify('Interval', `${timer.label} — Rep ${timer.intervalRound} complete`);
      }
    }
    return;
  }
  // Stopwatch: never done automatically
}

// ── TimerPanel ──────────────────────────────────────────────────────────

export function TimerPanel({ panelId: _panelId }: { panelId: string }) {
  const [timers, setTimers] = useState<TimerData[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load and reconcile on mount
  useEffect(() => {
    window.electronAPI.timer.list().then((raw) => {
      const loaded = (raw as TimerData[])
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(reconcileTimer);
      setTimers(loaded);
      for (const t of loaded) {
        window.electronAPI.timer.save(t);
      }
    });
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const addTimer = (type: TimerType) => {
    const t = makeTimer(type);
    setTimers((prev) => [...prev, t]);
    window.electronAPI.timer.save(t);
    setMenuOpen(false);
  };

  const updateTimer = (updated: TimerData, debounce = false) => {
    setTimers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (debounce) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        window.electronAPI.timer.save(updated);
      }, 400);
    } else {
      window.electronAPI.timer.save(updated);
    }
  };

  const deleteTimer = (id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
    window.electronAPI.timer.delete(id);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timers</span>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
          >
            <span>+ Add Timer</span>
            <ChevronDown className="size-3" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 rounded-md border border-border bg-popover shadow-lg z-50 py-1">
              {(['countdown', 'stopwatch', 'pomodoro', 'interval'] as TimerType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => addTimer(type)}
                  className="w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-muted transition-colors"
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {timers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No timers yet — add one above
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {timers.map((timer) => (
              <TimerCard
                key={timer.id}
                timer={timer}
                onChange={updateTimer}
                onDelete={() => deleteTimer(timer.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TimerCard ──────────────────────────────────────────────────────────

function TimerCard({
  timer,
  onChange,
  onDelete,
}: {
  timer: TimerData;
  onChange: (t: TimerData, debounce?: boolean) => void;
  onDelete: () => void;
}) {
  const isIdle = timer.status === 'idle';

  // Config input local state (only used in idle)
  const [durationInput, setDurationInput] = useState(toMmSs(timer.durationSeconds));
  const [workInput, setWorkInput] = useState(toMmSs(timer.workSeconds));
  const [breakInput, setBreakInput] = useState(toMmSs(timer.breakSeconds));
  const [repeatInput, setRepeatInput] = useState(String(timer.repeatCount));

  // Sync inputs when timer resets to idle
  useEffect(() => {
    if (isIdle) {
      setDurationInput(toMmSs(timer.durationSeconds));
      setWorkInput(toMmSs(timer.workSeconds));
      setBreakInput(toMmSs(timer.breakSeconds));
      setRepeatInput(String(timer.repeatCount));
    }
  }, [isIdle, timer.durationSeconds, timer.workSeconds, timer.breakSeconds, timer.repeatCount]);

  // Live elapsed (seconds)
  const [elapsed, setElapsed] = useState<number>(() => {
    if (timer.status === 'running' && timer.startedAt !== null) {
      return timer.accumulatedSeconds + (Date.now() - timer.startedAt) / 1000;
    }
    return timer.accumulatedSeconds;
  });

  // Keep refs to avoid stale closures in interval
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Tick interval
  useEffect(() => {
    if (timer.status !== 'running') return;
    const interval = setInterval(
      () => {
        if (timerRef.current.startedAt === null) return;
        const newElapsed =
          timerRef.current.accumulatedSeconds +
          (Date.now() - timerRef.current.startedAt) / 1000;
        setElapsed(newElapsed);
        checkDone(timerRef.current, newElapsed, onChangeRef.current);
      },
      timer.type === 'stopwatch' ? 50 : 200,
    );
    return () => clearInterval(interval);
  }, [timer.status, timer.type]);

  // Sync elapsed on external timer changes (reset, reload)
  useEffect(() => {
    if (timer.status === 'running' && timer.startedAt !== null) {
      setElapsed(timer.accumulatedSeconds + (Date.now() - timer.startedAt) / 1000);
    } else {
      setElapsed(timer.accumulatedSeconds);
    }
  }, [timer.status, timer.accumulatedSeconds, timer.startedAt]);

  // Done pulse
  const [isPulsing, setIsPulsing] = useState(false);
  const prevStatusRef = useRef(timer.status);

  useEffect(() => {
    if (prevStatusRef.current !== 'done' && timer.status === 'done') {
      setIsPulsing(true);
      const t = setTimeout(() => setIsPulsing(false), 3000);
      return () => clearTimeout(t);
    }
    prevStatusRef.current = timer.status;
  }, [timer.status]);

  // Pomodoro phase flash
  const [isFlashing, setIsFlashing] = useState(false);
  const prevPhaseRef = useRef(timer.pomodoroPhase);

  useEffect(() => {
    if (prevPhaseRef.current !== timer.pomodoroPhase) {
      setIsFlashing(true);
      const t = setTimeout(() => setIsFlashing(false), 150);
      prevPhaseRef.current = timer.pomodoroPhase;
      return () => clearTimeout(t);
    }
  }, [timer.pomodoroPhase]);

  // Config commit helpers
  const commitDuration = () => {
    const secs = parseMmSs(durationInput);
    if (secs !== null && secs >= 1) onChange({ ...timer, durationSeconds: secs });
    else setDurationInput(toMmSs(timer.durationSeconds));
  };

  const commitWork = () => {
    const secs = parseMmSs(workInput);
    if (secs !== null && secs >= 1) onChange({ ...timer, workSeconds: secs });
    else setWorkInput(toMmSs(timer.workSeconds));
  };

  const commitBreak = () => {
    const secs = parseMmSs(breakInput);
    if (secs !== null && secs >= 1) onChange({ ...timer, breakSeconds: secs });
    else setBreakInput(toMmSs(timer.breakSeconds));
  };

  const commitRepeat = () => {
    const n = parseInt(repeatInput, 10);
    if (!isNaN(n) && n >= 0) onChange({ ...timer, repeatCount: n });
    else setRepeatInput(String(timer.repeatCount));
  };

  // Actions
  const play = () => {
    if (timer.status === 'done') return;
    onChange({ ...timer, status: 'running', startedAt: Date.now() });
  };

  const pause = () => {
    if (timer.status !== 'running' || timer.startedAt === null) return;
    const acc = timer.accumulatedSeconds + (Date.now() - timer.startedAt) / 1000;
    onChange({ ...timer, status: 'paused', accumulatedSeconds: acc, startedAt: null });
  };

  const reset = () => {
    onChange({
      ...timer,
      status: 'idle',
      accumulatedSeconds: 0,
      startedAt: null,
      pomodoroPhase: 'work',
      pomodoroRound: 1,
      intervalRound: 1,
    });
  };

  // Display computations
  const displaySeconds = (() => {
    if (timer.status === 'idle') {
      if (timer.type === 'stopwatch') return 0;
      if (timer.type === 'pomodoro') return timer.workSeconds;
      return timer.durationSeconds;
    }
    if (timer.type === 'countdown') {
      return Math.max(0, timer.durationSeconds - elapsed);
    }
    if (timer.type === 'stopwatch') {
      return elapsed;
    }
    if (timer.type === 'pomodoro') {
      const phaseDur = timer.pomodoroPhase === 'work' ? timer.workSeconds : timer.breakSeconds;
      return Math.max(0, phaseDur - elapsed);
    }
    // interval
    const withinRepeat = elapsed % (timer.durationSeconds || 1);
    return Math.max(0, timer.durationSeconds - withinRepeat);
  })();

  const progressFraction = (() => {
    if (timer.type === 'countdown') {
      const dur = timer.durationSeconds || 1;
      return Math.min(elapsed / dur, 1);
    }
    if (timer.type === 'pomodoro') {
      const phaseDur = (timer.pomodoroPhase === 'work' ? timer.workSeconds : timer.breakSeconds) || 1;
      return Math.min(elapsed / phaseDur, 1);
    }
    if (timer.type === 'interval') {
      const dur = timer.durationSeconds || 1;
      const withinRepeat = elapsed % dur;
      return Math.min(withinRepeat / dur, 1);
    }
    return 0;
  })();

  const isDone = timer.status === 'done';

  return (
    <div
      className={[
        'rounded-lg border p-4 flex flex-col gap-3 transition-colors',
        isDone ? 'bg-green-500/10 border-green-500/20' : 'bg-card border-border',
        isPulsing ? 'animate-pulse' : '',
        isFlashing ? 'opacity-50' : 'opacity-100',
      ].filter(Boolean).join(' ')}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <input
          className="bg-transparent text-sm font-medium outline-none border-b border-transparent hover:border-border focus:border-border flex-1 min-w-0"
          value={timer.label}
          onChange={(e) => onChange({ ...timer, label: e.target.value }, true)}
        />
        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
          {timer.type}
        </span>
      </div>

      {/* Config inputs (idle only) */}
      {isIdle && (timer.type === 'countdown' || timer.type === 'interval') && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>Duration:</span>
          <input
            className="w-16 bg-muted rounded px-1.5 py-0.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => e.key === 'Enter' && commitDuration()}
            placeholder="MM:SS"
          />
          {timer.type === 'interval' && (
            <>
              <span>Repeats:</span>
              <input
                className="w-10 bg-muted rounded px-1.5 py-0.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                value={repeatInput}
                onChange={(e) => setRepeatInput(e.target.value)}
                onBlur={commitRepeat}
                onKeyDown={(e) => e.key === 'Enter' && commitRepeat()}
                placeholder="0=∞"
              />
            </>
          )}
        </div>
      )}

      {isIdle && timer.type === 'pomodoro' && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1.5">
            <span>Work:</span>
            <input
              className="w-16 bg-muted rounded px-1.5 py-0.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={workInput}
              onChange={(e) => setWorkInput(e.target.value)}
              onBlur={commitWork}
              onKeyDown={(e) => e.key === 'Enter' && commitWork()}
              placeholder="MM:SS"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span>Break:</span>
            <input
              className="w-16 bg-muted rounded px-1.5 py-0.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={breakInput}
              onChange={(e) => setBreakInput(e.target.value)}
              onBlur={commitBreak}
              onKeyDown={(e) => e.key === 'Enter' && commitBreak()}
              placeholder="MM:SS"
            />
          </div>
        </div>
      )}

      {/* Time display — flex-1 so it fills remaining height, keeping controls pinned to bottom */}
      <div className={`flex-1 flex items-center justify-center font-mono text-3xl tracking-tight ${isDone ? 'text-green-400' : 'text-foreground'}`}>
        {timer.type === 'stopwatch' && timer.status !== 'idle'
          ? formatStopwatchTime(displaySeconds)
          : formatDisplayTime(displaySeconds)}
      </div>

      {/* Progress bar (not shown for Stopwatch) */}
      {timer.type !== 'stopwatch' && (
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-none"
            style={{ width: `${Math.min(progressFraction * 100, 100)}%` }}
          />
        </div>
      )}

      {/* Phase / round info */}
      {timer.type === 'pomodoro' && timer.status !== 'idle' && (
        <div className="text-xs text-center text-muted-foreground">
          {timer.pomodoroPhase === 'work' ? 'Work' : 'Break'} · Round {timer.pomodoroRound}
        </div>
      )}
      {timer.type === 'interval' && timer.status !== 'idle' && (
        <div className="text-xs text-center text-muted-foreground">
          Rep {timer.intervalRound} / {timer.repeatCount === 0 ? '∞' : timer.repeatCount}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={timer.status === 'running' ? pause : play}
          disabled={isDone}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {timer.status === 'running' ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
        >
          <RotateCcw className="size-3.5" />
          <span>Reset</span>
        </button>
        <button
          onClick={onDelete}
          className="ml-auto p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
