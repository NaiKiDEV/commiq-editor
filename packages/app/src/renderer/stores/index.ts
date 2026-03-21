import { createEventBus } from '@naikidev/commiq';
import { workspaceStore } from './workspace';
import { createTerminalStore } from './terminal';
import { createBrowserStore } from './browser';

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

export { workspaceStore } from './workspace';
