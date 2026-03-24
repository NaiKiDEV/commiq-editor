import { workspaceStore } from './workspace';
import { createTerminalStore } from './terminal';
import { createBrowserStore } from './browser';
import { initBus } from './bus';
import { initEffects } from './effects';
import { loadPersistedState, initPersistence } from '../lib/persistence';

export const terminalStore = createTerminalStore({
  ipc: window.electronAPI.terminal,
});

export const browserStore = createBrowserStore({
  ipc: window.electronAPI.browser,
});

initBus(workspaceStore, terminalStore, browserStore);
initEffects(workspaceStore);

export const persistenceReady: Promise<Record<string, string> | null> =
  loadPersistedState(workspaceStore).then((browserUrls) => {
    initPersistence(workspaceStore, browserStore);
    return browserUrls;
  });

export { workspaceStore } from './workspace';
