import { useCallback, useState } from "react";

/** Secret code typed into the command palette to reveal the hidden roulette tab. */
export const ROULETTE_UNLOCK_CODE = "csgodouble";
/** Separate code typed into the roulette panel to top up the balance. */
export const ROULETTE_MONEY_CODE = "hesoiyam";

export const STARTING_BALANCE = 1000;
export const MONEY_CHEAT_AMOUNT = 100_000;

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
