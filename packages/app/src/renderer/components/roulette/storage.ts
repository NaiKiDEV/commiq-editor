import { useCallback, useState } from "react";
import { MONEY_CODE } from "../casino/balance";

/** Secret code typed into the command palette to reveal the hidden roulette tab. */
export const ROULETTE_UNLOCK_CODE = "csgodouble";
/**
 * Separate code typed into a game's cheat console to top up the balance.
 * Re-exported from the shared casino store so every game uses one code.
 */
export const ROULETTE_MONEY_CODE = MONEY_CODE;

// Balance constants now live in the shared casino store; re-export for the
// existing panels that import them from here.
export { STARTING_BALANCE, MONEY_CHEAT_AMOUNT } from "../casino/balance";

const UNLOCK_KEY = "commiq.roulette.unlocked";

/** Whether the hidden roulette tab has been unlocked on this machine. */
export function isRouletteUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the unlocked state so the tab stays available after the code is entered. */
export function unlockRoulette(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // Ignore failures if storage is unavailable.
  }
}

/** localStorage-backed state for balance and roll history (not synced via IPC). */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Ignore quota or serialization failures.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
