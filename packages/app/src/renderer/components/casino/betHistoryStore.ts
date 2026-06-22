import { useCallback } from "react";
import { usePersistentState } from "../roulette/storage";

/**
 * A single resolved bet, recorded across all hidden casino games. Unlike each
 * game's "Last" strip (which only shows what landed), this captures the wager
 * and the net outcome so the sidebar can show real profit and loss.
 */
export interface BetHistoryEntry {
  id: string;
  ts: number;
  /** Amount wagered on this bet. */
  bet: number;
  /** Net result: payout minus the wager. Negative on a loss. */
  net: number;
  /** Short label describing what landed (e.g. "2.5x", "14 red", "Busted"). */
  outcome: string;
}

/** What a caller passes in; id and timestamp are filled in by the hook. */
export type RecordedBet = Pick<BetHistoryEntry, "bet" | "net" | "outcome">;

/** How many resolved bets to keep per game before dropping the oldest. */
const MAX_ENTRIES = 100;

/**
 * Per-game detailed bet log backed by localStorage. Returns the entries plus a
 * `record` to append a resolved bet and a `clear` to wipe the log.
 */
export function useBetHistory(
  key: string,
): [BetHistoryEntry[], (bet: RecordedBet) => void, () => void] {
  const [entries, setEntries] = usePersistentState<BetHistoryEntry[]>(key, []);

  const record = useCallback(
    (bet: RecordedBet) => {
      setEntries((prev) =>
        [
          { ...bet, id: crypto.randomUUID(), ts: Date.now() },
          ...prev,
        ].slice(0, MAX_ENTRIES),
      );
    },
    [setEntries],
  );

  const clear = useCallback(() => setEntries([]), [setEntries]);

  return [entries, record, clear];
}

/**
 * Whether the bet-history sidebar is open. Shared across every game so the
 * preference carries from one tab to the next.
 */
export function useHistoryOpen(): [boolean, () => void] {
  const [open, setOpen] = usePersistentState<boolean>(
    "commiq.casino.historyOpen",
    true,
  );
  const toggle = useCallback(() => setOpen((o) => !o), [setOpen]);
  return [open, toggle];
}
