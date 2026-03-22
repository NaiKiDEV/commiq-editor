import { createEventBus } from '@naikidev/commiq';
import { workspaceStore } from './workspace';
import { createTerminalStore } from './terminal';
import { createBrowserStore } from './browser';
import { loadPersistedState, initPersistence } from '../lib/persistence';

export const terminalStore = createTerminalStore({
  ipc: window.electronAPI.terminal,
});

export const browserStore = createBrowserStore({
  ipc: window.electronAPI.browser,
});

export const eventBus = createEventBus();
eventBus.connect(workspaceStore);
eventBus.connect(terminalStore);
eventBus.connect(browserStore);

export const persistenceReady: Promise<Record<string, string> | null> =
  loadPersistedState(workspaceStore).then((browserUrls) => {
    initPersistence(workspaceStore, browserStore);
    return browserUrls;
  });

export { workspaceStore } from './workspace';
