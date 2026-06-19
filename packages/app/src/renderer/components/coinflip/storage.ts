/** Secret code typed into the command palette to reveal the hidden coinflip tab. */
export const COINFLIP_UNLOCK_CODE = "csgowild";

const UNLOCK_KEY = "commiq.coinflip.unlocked";

/** Whether the hidden coinflip tab has been unlocked on this machine. */
export function isCoinflipUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the unlocked state so the tab stays available after the code is entered. */
export function unlockCoinflip(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // Ignore failures if storage is unavailable.
  }
}
