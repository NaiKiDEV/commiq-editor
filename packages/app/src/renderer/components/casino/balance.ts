import { useSyncExternalStore } from "react";

/**
 * Shared casino balance. All hidden games (roulette, coinflip, crash, plinko)
 * draw from and pay into this single pot so money is consistent no matter which
 * game tab you bet in. The store lives at module scope, so every open panel in
 * the window subscribes to the same value and stays in sync as bets are placed
 * and winnings land. A `storage` listener keeps separate windows in sync too.
 */

/** Bankroll every player starts with before any bets. */
export const STARTING_BALANCE = 1000;
/** Amount granted when the money cheat code is entered. */
export const MONEY_CHEAT_AMOUNT = 100_000;
/** Code typed into a game's cheat console to top up the shared balance. */
export const MONEY_CODE = "hesoiyam";

const BALANCE_KEY = "commiq.casino.balance";

/** Per-game balance keys used before money was shared; migrated on first read. */
const LEGACY_KEYS = [
  "commiq.roulette.balance",
  "commiq.coinflip.balance",
  "commiq.crash.balance",
];

/**
 * Resolve the starting balance. Prefer the shared value; otherwise migrate the
 * highest legacy per-game balance so existing progress isn't lost, then persist.
 */
function readInitialBalance(): number {
  try {
    const raw = localStorage.getItem(BALANCE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      return typeof parsed === "number" && Number.isFinite(parsed)
        ? parsed
        : STARTING_BALANCE;
    }

    let migrated: number | null = null;
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy === null) continue;
      const value = JSON.parse(legacy);
      if (typeof value === "number" && Number.isFinite(value)) {
        migrated = migrated === null ? value : Math.max(migrated, value);
      }
    }

    const initial = migrated ?? STARTING_BALANCE;
    localStorage.setItem(BALANCE_KEY, JSON.stringify(initial));
    return initial;
  } catch {
    return STARTING_BALANCE;
  }
}

let balance = readInitialBalance();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current shared balance (non-reactive read for timers and event handlers). */
export function getBalance(): number {
  return balance;
}

/** Update the shared balance and notify every subscriber + persist to storage. */
export function setBalance(next: number | ((prev: number) => number)): void {
  const resolved = typeof next === "function" ? next(balance) : next;
  if (resolved === balance) return;
  balance = resolved;
  try {
    localStorage.setItem(BALANCE_KEY, JSON.stringify(balance));
  } catch {
    // Ignore quota or serialization failures; in-memory value still updates.
  }
  emit();
}

// Keep other windows in sync. `storage` only fires in *other* documents, so
// this never double-handles a write made in this window.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== BALANCE_KEY || e.newValue === null) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (typeof parsed === "number" && Number.isFinite(parsed) && parsed !== balance) {
        balance = parsed;
        emit();
      }
    } catch {
      // Ignore malformed cross-window writes.
    }
  });
}

/**
 * Subscribe a component to the shared balance. Mirrors `useState`'s tuple shape
 * so it drops into the existing game panels in place of per-game state.
 */
export function useSharedBalance(): [
  number,
  (next: number | ((prev: number) => number)) => void,
] {
  const value = useSyncExternalStore(subscribe, getBalance, getBalance);
  return [value, setBalance];
}
