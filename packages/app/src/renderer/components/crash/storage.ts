/** Secret code typed into the command palette to reveal the hidden crash tab. */
export const CRASH_UNLOCK_CODE = "csgocrash";

const UNLOCK_KEY = "commiq.crash.unlocked";

/** Whether the hidden crash tab has been unlocked on this machine. */
export function isCrashUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the unlocked state so the tab stays available after the code is entered. */
export function unlockCrash(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // Ignore failures if storage is unavailable.
  }
}
