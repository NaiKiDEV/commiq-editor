import { useSelector, useQueue } from '@naikidev/commiq-react';
import {
  workspaceStore,
  getActiveWorkspace,
  getActiveTab,
  createWorkspace as createWorkspaceCmd,
  switchWorkspace as switchWorkspaceCmd,
  renameWorkspace as renameWorkspaceCmd,
  deleteWorkspace as deleteWorkspaceCmd,
  createTab as createTabCmd,
  closeTab as closeTabCmd,
  activateTab as activateTabCmd,
  renameTab as renameTabCmd,
  reorderTab as reorderTabCmd,
  closeOtherTabs as closeOtherTabsCmd,
  closeTabsToRight as closeTabsToRightCmd,
  openPanel,
  closePanel,
  activatePanel,
  updatePanelTitle,
  layoutSplit,
  layoutResize,
  type Panel,
  type PanelType,
  type Workspace,
  type Tab,
} from '../stores/workspace';
import type { LayoutNode } from '../lib/layout';

// Stable empty references to avoid infinite useSyncExternalStore loops
const EMPTY_TABS: Tab[] = [];
const EMPTY_PANELS: Panel[] = [];

// Memoized flat panel list across all workspaces — avoids new array on every selector call
let _cachedAllPanels: Panel[] = EMPTY_PANELS;
let _cachedAllPanelsKey = '';

function selectAllPanels(s: { workspaces: Workspace[] }): Panel[] {
  // Build a cheap identity key from workspace/tab/panel counts + IDs
  // Only rebuild the flat array when the key changes
  let key = '';
  for (const ws of s.workspaces) {
    for (const tab of ws.tabs) {
      for (const p of tab.panels) {
        key += p.id;
      }
    }
  }
  if (key === _cachedAllPanelsKey) return _cachedAllPanels;
  _cachedAllPanelsKey = key;
  _cachedAllPanels = s.workspaces.reduce<Panel[]>((acc, ws) => {
    for (const tab of ws.tabs) {
      for (const p of tab.panels) acc.push(p);
    }
    return acc;
  }, []);
  return _cachedAllPanels;
}

// ── Workspace selectors ────────────────────────────────────────────────

export function useWorkspaces() {
  return useSelector(workspaceStore, (s) => s.workspaces);
}

export function useActiveWorkspaceId() {
  return useSelector(workspaceStore, (s) => s.activeWorkspaceId);
}

export function useActiveWorkspace() {
  return useSelector(workspaceStore, (s) => getActiveWorkspace(s));
}

// ── Tab selectors ──────────────────────────────────────────────────────

export function useTabs() {
  return useSelector(workspaceStore, (s) => {
    const ws = getActiveWorkspace(s);
    return ws?.tabs ?? EMPTY_TABS;
  });
}

export function useActiveTabId() {
  return useSelector(workspaceStore, (s) => {
    const ws = getActiveWorkspace(s);
    return ws?.activeTabId ?? null;
  });
}

export function useActiveTab() {
  return useSelector(workspaceStore, (s) => getActiveTab(s));
}

// ── Panel selectors ────────────────────────────────────────────────────

/** All panels across all workspaces — for stable rendering (never unmount) */
export function useAllPanels() {
  return useSelector(workspaceStore, selectAllPanels);
}

export function usePanels() {
  return useSelector(workspaceStore, (s) => {
    const tab = getActiveTab(s);
    return tab?.panels ?? EMPTY_PANELS;
  });
}

export function useActivePanelId() {
  return useSelector(workspaceStore, (s) => {
    const tab = getActiveTab(s);
    return tab?.activePanelId ?? null;
  });
}

export function useActivePanel() {
  return useSelector(workspaceStore, (s) => {
    const tab = getActiveTab(s);
    if (!tab) return null;
    return tab.panels.find((p) => p.id === tab.activePanelId) ?? null;
  });
}

export function useLayout() {
  return useSelector(workspaceStore, (s) => {
    const tab = getActiveTab(s);
    return tab?.layout ?? null;
  });
}

// ── Actions ────────────────────────────────────────────────────────────

export function useWorkspaceActions() {
  const queue = useQueue(workspaceStore);

  return {
    createWorkspace: (name: string) => {
      queue(createWorkspaceCmd(name));
    },
    switchWorkspace: (id: string) => {
      queue(switchWorkspaceCmd(id));
    },
    renameWorkspace: (id: string, name: string) => {
      queue(renameWorkspaceCmd(id, name));
    },
    deleteWorkspace: (id: string) => {
      queue(deleteWorkspaceCmd(id));
    },

    createTab: (type: PanelType, title: string, options?: { transient?: boolean }) => {
      const panel: Panel = {
        id: crypto.randomUUID(),
        type,
        title,
      };
      queue(createTabCmd(panel, undefined, options?.transient));
      return panel.id;
    },
    closeTab: (id: string) => queue(closeTabCmd(id)),
    activateTab: (id: string) => queue(activateTabCmd(id)),
    renameTab: (id: string, name: string) => queue(renameTabCmd(id, name)),
    reorderTab: (tabId: string, toIndex: number) => queue(reorderTabCmd(tabId, toIndex)),
    closeOtherTabs: (tabId: string) => queue(closeOtherTabsCmd(tabId)),
    closeTabsToRight: (tabId: string) => queue(closeTabsToRightCmd(tabId)),

    openPanel: (type: PanelType, title: string) => {
      const panel: Panel = {
        id: crypto.randomUUID(),
        type,
        title,
      };
      queue(openPanel(panel));
      return panel.id;
    },
    closePanel: (id: string) => queue(closePanel(id)),
    activatePanel: (id: string) => queue(activatePanel(id)),
    updatePanelTitle: (id: string, title: string) =>
      queue(updatePanelTitle(id, title)),

    splitPanel: (
      direction: 'horizontal' | 'vertical',
      type: PanelType,
      title: string,
    ) => {
      const panel: Panel = {
        id: crypto.randomUUID(),
        type,
        title,
      };
      queue(layoutSplit(direction, panel));
      return panel.id;
    },
    resizeSplit: (splitId: string, ratio: number) =>
      queue(layoutResize(splitId, ratio)),
  };
}
