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

  const buildState = (): PersistedState => {
    const editor = workspaceStore.state;
    const browserSessions = browserStore.state.sessions;

    // Filter out transient tabs before persisting
    const filteredEditor: EditorState = {
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

    return { version: 1, editor: filteredEditor, browserUrls };
  };

  const save = () => {
    window.electronAPI.workspace.save(buildState()).catch((err) => {
      console.error('[persistence] async save failed:', err);
    });
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

  // Flush immediately before the window closes so no changes are lost.
  // Uses sendSync so the main process finishes writing before the window is destroyed.
  const handleBeforeUnload = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    window.electronAPI.workspace.saveSync(buildState());
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  return {
    save,
    dispose: () => {
      workspaceStore.closeStream(listener);
      browserStore.closeStream(browserListener);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (saveTimer) clearTimeout(saveTimer);
    },
  };
}

/**
 * Load persisted state and hydrate the workspace store.
 * Returns the browser URLs map so the caller can restore browsers after panels mount.
 */
export async function loadPersistedState(
  workspaceStore: SealedStore<EditorState>,
): Promise<Record<string, string> | null> {
  console.log('[persistence] loading…');
  let raw: PersistedState | null = null;
  try {
    raw = await window.electronAPI.workspace.load() as PersistedState | null;
  } catch (err) {
    console.error('[persistence] load IPC failed:', err);
    return null;
  }

  console.log('[persistence] raw:', raw);

  if (!raw) { console.warn('[persistence] no data on disk'); return null; }
  if (raw.version !== 1) { console.warn('[persistence] version mismatch:', raw.version); return null; }
  if (!raw.editor?.workspaces?.length) { console.warn('[persistence] empty workspaces'); return null; }

  console.log('[persistence] hydrating', raw.editor.workspaces.length, 'workspace(s)');
  try {
    workspaceStore.queue(hydrateWorkspace(raw.editor));
    await workspaceStore.flush();
    console.log('[persistence] hydration complete');
  } catch (err) {
    console.error('[persistence] hydration failed:', err);
    return null;
  }

  return raw.browserUrls ?? null;
}
