import type { SealedStore, StreamListener } from '@naikidev/commiq';
import type { EditorState } from '../stores/workspace';
import type { BrowserState } from '../stores/browser';
import { hydrateWorkspace } from '../stores/workspace';

/**
 * Persisted shape — workspace structure + browser URLs for restoration.
 * Panel IDs are preserved so we can match them to restore browser URLs.
 */
type PersistedState = {
  version: 1;
  editor: EditorState;
  /** Map of panelId → last known URL for browser panels */
  browserUrls: Record<string, string>;
};

const SAVE_DEBOUNCE_MS = 1500;

/**
 * Wire up auto-save and initial load for workspace persistence.
 * Call once after stores are created.
 */
export function initPersistence(
  workspaceStore: SealedStore<EditorState>,
  browserStore: SealedStore<BrowserState>,
) {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    const editor = workspaceStore.state;
    const browserSessions = browserStore.state.sessions;

    // Filter out transient tabs before persisting
    const filteredEditor = {
      ...editor,
      workspaces: editor.workspaces.map((ws) => ({
        ...ws,
        tabs: ws.tabs.filter((t) => !t.transient),
      })),
    };

    // Collect last known URL for each browser panel
    const browserUrls: Record<string, string> = {};
    for (const [id, session] of Object.entries(browserSessions)) {
      if (session.url && session.url !== 'about:blank') {
        browserUrls[id] = session.url;
      }
    }

    const persisted: PersistedState = {
      version: 1,
      editor: filteredEditor,
      browserUrls,
    };

    window.electronAPI.workspace.save(persisted);
  };

  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DEBOUNCE_MS);
  };

  // Subscribe to all workspace store events to trigger save
  const listener: StreamListener = () => debouncedSave();
  workspaceStore.openStream(listener);

  // Also save when browser URLs change
  const browserListener: StreamListener = () => debouncedSave();
  browserStore.openStream(browserListener);

  return { save, dispose: () => {
    workspaceStore.closeStream(listener);
    browserStore.closeStream(browserListener);
    if (saveTimer) clearTimeout(saveTimer);
  }};
}

/**
 * Load persisted state and hydrate the workspace store.
 * Returns the browser URLs map so the caller can restore browsers after panels mount.
 */
export async function loadPersistedState(
  workspaceStore: SealedStore<EditorState>,
): Promise<Record<string, string> | null> {
  const raw = await window.electronAPI.workspace.load() as PersistedState | null;
  if (!raw || raw.version !== 1) return null;

  // Validate the persisted state has the expected shape
  if (!raw.editor?.workspaces?.length) return null;

  workspaceStore.queue(hydrateWorkspace(raw.editor));
  await workspaceStore.flush();

  return raw.browserUrls ?? null;
}
