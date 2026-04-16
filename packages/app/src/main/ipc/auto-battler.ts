import { BrowserWindow, ipcMain } from "electron";
import type { GameAction } from "../../shared/auto-battler-types";
import { getAutoBattlerState } from "../auto-battler/state";
import {
  UNITS,
  UNIT_MAP,
} from "../auto-battler/config/units";
import { ENEMIES, ENEMY_MAP } from "../auto-battler/config/enemies";
import { SYNERGIES, SYNERGY_MAP } from "../auto-battler/config/synergies";
import { RELICS, RELIC_MAP } from "../auto-battler/config/relics";
import { WAVES, MAX_WAVE } from "../auto-battler/config/waves";
import { PROGRESSION_NODES } from "../auto-battler/config/progression";

export function registerAutoBattlerIpc(): void {
  const state = getAutoBattlerState();

  // Broadcast state changes to all renderer windows
  state.on("state-changed", (save) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("auto-battler:state-changed", save);
      }
    }
  });

  ipcMain.handle("auto-battler:get-save", () => state.getSave());

  ipcMain.handle("auto-battler:dispatch", (_event, action: GameAction) =>
    state.dispatch(action),
  );

  ipcMain.handle("auto-battler:reset-save", () => state.resetSave());

  ipcMain.handle("auto-battler:get-config", () => ({
    units: UNITS,
    unitMap: UNIT_MAP,
    enemies: ENEMIES,
    enemyMap: ENEMY_MAP,
    synergies: SYNERGIES,
    synergyMap: SYNERGY_MAP,
    relics: RELICS,
    relicMap: RELIC_MAP,
    waves: WAVES,
    maxWave: MAX_WAVE,
    progression: PROGRESSION_NODES,
  }));
}
