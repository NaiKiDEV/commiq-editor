import { BrowserWindow, ipcMain } from "electron";
import type {
  RepoTycoonAction,
  RepoTycoonConfigPayload,
} from "../../shared/repo-tycoon-types";
import { getRepoTycoonState } from "../repo-tycoon/state";
import {
  BASE_EVENT_CHANCE_PER_ROLL,
  BASE_LOC_PER_SEC,
  COMMIT_THRESHOLD,
  EVENT_ROLL_INTERVAL_SEC,
  MANUAL_COMMIT_LOC,
  MAX_OFFLINE_SEC,
  PRESTIGE_THRESHOLD_STARS,
  PR_THRESHOLD,
  STARS_PER_PR,
} from "../repo-tycoon/config/balance";
import { EVENTS } from "../repo-tycoon/config/events";
import { MILESTONES } from "../repo-tycoon/config/milestones";
import { PRESTIGE_UPGRADES } from "../repo-tycoon/config/prestige-upgrades";
import { UPGRADES } from "../repo-tycoon/config/upgrades";

export function registerRepoTycoonIpc(): void {
  const state = getRepoTycoonState();

  state.on("state-changed", (next) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("repo-tycoon:state-changed", next);
      }
    }
  });

  ipcMain.handle("repo-tycoon:get-state", () => state.getState());

  ipcMain.handle(
    "repo-tycoon:dispatch",
    (_event, action: RepoTycoonAction) => state.dispatch(action),
  );

  ipcMain.handle("repo-tycoon:reset", () => state.reset());

  ipcMain.handle("repo-tycoon:get-config", (): RepoTycoonConfigPayload => ({
    upgrades: UPGRADES,
    milestones: MILESTONES,
    events: EVENTS,
    prestigeUpgrades: PRESTIGE_UPGRADES,
    balance: {
      baseLocPerSec: BASE_LOC_PER_SEC,
      commitThreshold: COMMIT_THRESHOLD,
      prThreshold: PR_THRESHOLD,
      starsPerPr: STARS_PER_PR,
      eventRollIntervalSec: EVENT_ROLL_INTERVAL_SEC,
      baseEventChancePerRoll: BASE_EVENT_CHANCE_PER_ROLL,
      maxOfflineSec: MAX_OFFLINE_SEC,
      manualCommitLoc: MANUAL_COMMIT_LOC,
      prestigeThreshold: PRESTIGE_THRESHOLD_STARS,
    },
  }));
}
