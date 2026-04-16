import { EventEmitter } from "events";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import type {
  AutoBattlerSave,
  GameAction,
} from "../../shared/auto-battler-types";
import { createInitialSave, gameReducer } from "./engine";
import { SAVE_VERSION } from "./config/balance";

const SAVE_DEBOUNCE_MS = 1500;
const SAVE_FILE_NAME = "save.json";

export class AutoBattlerStateManager extends EventEmitter {
  private save: AutoBattlerSave;
  private storageDir: string;
  private savePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.storageDir = path.join(app.getPath("userData"), "auto-battler");
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.savePath = path.join(this.storageDir, SAVE_FILE_NAME);
    this.save = this.loadSave();
  }

  private loadSave(): AutoBattlerSave {
    if (!fs.existsSync(this.savePath)) {
      return createInitialSave();
    }
    try {
      const raw = fs.readFileSync(this.savePath, "utf8");
      const parsed = JSON.parse(raw) as AutoBattlerSave;
      if (parsed.version !== SAVE_VERSION) {
        // simple migration strategy: keep meta, wipe activeRun
        return {
          ...createInitialSave(),
          meta: parsed.meta ?? createInitialSave().meta,
          settings: parsed.settings ?? createInitialSave().settings,
        };
      }
      return parsed;
    } catch {
      return createInitialSave();
    }
  }

  private scheduleSave(): void {
    if (!this.save.settings.autoSave) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  private flushSave(): void {
    try {
      fs.writeFileSync(this.savePath, JSON.stringify(this.save, null, 2));
    } catch (err) {
      this.emit("save-error", err);
    }
  }

  getSave(): AutoBattlerSave {
    return this.save;
  }

  dispatch(action: GameAction): AutoBattlerSave {
    const next = gameReducer(this.save, action);
    if (next === this.save) return this.save;
    this.save = next;
    this.emit("state-changed", this.save);
    this.scheduleSave();
    return this.save;
  }

  resetSave(): AutoBattlerSave {
    this.save = createInitialSave();
    this.flushSave();
    this.emit("state-changed", this.save);
    return this.save;
  }

  shutdown(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.flushSave();
  }
}

let instance: AutoBattlerStateManager | null = null;

export function getAutoBattlerState(): AutoBattlerStateManager {
  if (!instance) instance = new AutoBattlerStateManager();
  return instance;
}
