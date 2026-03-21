import { createEventBus } from '@naikidev/commiq';
import { workspaceStore } from './workspace';
import { createTerminalStore } from './terminal';

export const terminalStore = createTerminalStore({
  ipc: window.electronAPI.terminal,
});

export const eventBus = createEventBus();
eventBus.connect(workspaceStore);
eventBus.connect(terminalStore);

export { workspaceStore } from './workspace';
