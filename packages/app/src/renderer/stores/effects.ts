import { createEffects } from '@naikidev/commiq-effects';
import type { SealedStore } from '@naikidev/commiq';
import { WorkspaceSwitched, TabActivated, type EditorState } from './workspace';

/**
 * Effects — side effects triggered by store events.
 * Browser visibility is managed here, not in React components,
 * because it must run regardless of which component is mounted.
 */
export function initEffects(workspaceStore: SealedStore<EditorState>) {
  const workspaceEffects = createEffects(workspaceStore);

  // When switching workspaces, hide all browser views and show only the active tab's browsers
  workspaceEffects.on(WorkspaceSwitched, (data) => {
    window.electronAPI.browser.hideAll();
    for (const id of data.toPanelIds) {
      window.electronAPI.browser.showSession(id);
    }
  });

  // When switching tabs, hide all browser views and show only the new tab's browsers
  workspaceEffects.on(TabActivated, (data) => {
    window.electronAPI.browser.hideAll();
    for (const id of data.browserPanelIds) {
      window.electronAPI.browser.showSession(id);
    }
  });

  return { workspaceEffects };
}
