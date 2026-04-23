import { EventEmitter } from "events";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import type {
  RepoTycoonAction,
  RepoTycoonState,
} from "../../shared/repo-tycoon-types";
import { createInitialState, gameReducer } from "./engine";
import { SAVE_VERSION } from "./config/balance";

const SAVE_DEBOUNCE_MS = 1500;
const SAVE_FILE_NAME = "save.json";

export class RepoTycoonStateManager extends EventEmitter {
  private state: RepoTycoonState;
  private storageDir: string;
  private savePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.storageDir = path.join(app.getPath("userData"), "repo-tycoon");
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.savePath = path.join(this.storageDir, SAVE_FILE_NAME);
    this.state = this.loadSave();
  }

  private loadSave(): RepoTycoonState {
    if (!fs.existsSync(this.savePath)) return createInitialState();
    try {
      const raw = fs.readFileSync(this.savePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RepoTycoonState>;
      if (!parsed || parsed.version !== SAVE_VERSION) {
        return createInitialState();
      }
      // Forward-compat fallback for any new fields.
      const fresh = createInitialState();
      return {
        ...fresh,
        ...parsed,
        resources: { ...fresh.resources, ...(parsed.resources ?? {}) },
        upgrades: { ...(parsed.upgrades ?? {}) },
        milestonesUnlocked: [...(parsed.milestonesUnlocked ?? [])],
        activeEvents: [...(parsed.activeEvents ?? [])],
        stats: { ...fresh.stats, ...(parsed.stats ?? {}) },
        settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
      };
    } catch {
      return createInitialState();
    }
  }

  private scheduleSave(): void {
    if (!this.state.settings.autoSave) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), SAVE_DEBOUNCE_MS);
  }

  private flushSave(): void {
    try {
      fs.writeFileSync(this.savePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      this.emit("save-error", err);
    }
  }

  getState(): RepoTycoonState {
    return this.state;
  }

  dispatch(action: RepoTycoonAction): RepoTycoonState {
    const next = gameReducer(this.state, action);
    if (next === this.state) return this.state;
    this.state = next;
    this.emit("state-changed", this.state);
    this.scheduleSave();
    return this.state;
  }

  reset(): RepoTycoonState {
    this.state = createInitialState();
    this.flushSave();
    this.emit("state-changed", this.state);
    return this.state;
  }

  shutdown(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.flushSave();
  }
}

let instance: RepoTycoonStateManager | null = null;

export function getRepoTycoonState(): RepoTycoonStateManager {
  if (!instance) instance = new RepoTycoonStateManager();
  return instance;
}
