/** Secret code typed into the command palette to reveal the hidden blackjack tab. */
export const BLACKJACK_UNLOCK_CODE = "blackjack";

const UNLOCK_KEY = "commiq.blackjack.unlocked";

/** Whether the hidden blackjack tab has been unlocked on this machine. */
export function isBlackjackUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the unlocked state so the tab stays available after the code is entered. */
export function unlockBlackjack(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // Ignore failures if storage is unavailable.
  }
}
