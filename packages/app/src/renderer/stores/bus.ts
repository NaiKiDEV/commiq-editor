import { createEventBus, type SealedStore } from '@naikidev/commiq';
import { PanelClosed, type EditorState } from './workspace';
import { killTerminal, type TerminalState } from './terminal';
import { closeBrowser, type BrowserState } from './browser';

/**
 * Event bus — routes events between stores.
 * Cross-store coordination: workspace events trigger terminal/browser cleanup.
 */
export function initBus(
  workspaceStore: SealedStore<EditorState>,
  terminalStore: SealedStore<TerminalState>,
  browserStore: SealedStore<BrowserState>,
) {
  const eventBus = createEventBus();
  eventBus.connect(workspaceStore);
  eventBus.connect(terminalStore);
  eventBus.connect(browserStore);

  // When a panel is closed, clean up its terminal/browser session.
  // The terminal and browser stores silently no-op if no session exists for the ID.
  eventBus.on(PanelClosed, (event) => {
    terminalStore.queue(killTerminal(event.data.id));
    browserStore.queue(closeBrowser(event.data.id));
  });

  return eventBus;
}
