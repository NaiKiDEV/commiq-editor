/** Secret code typed into the command palette to reveal the hidden plinko tab. */
export const PLINKO_UNLOCK_CODE = "plinko";

const UNLOCK_KEY = "commiq.plinko.unlocked";

/** Whether the hidden plinko tab has been unlocked on this machine. */
export function isPlinkoUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the unlocked state so the tab stays available after the code is entered. */
export function unlockPlinko(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // Ignore failures if storage is unavailable.
  }
}
