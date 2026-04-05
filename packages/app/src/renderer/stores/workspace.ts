import {
  createStore,
  sealStore,
  createCommand,
  createEvent,
} from '@naikidev/commiq';
import { withPatch } from '@naikidev/commiq-context';
import {
  type LayoutNode,
  containsPanel,
  replaceLeafPanel,
  removePanel,
  splitLeaf,
  updateSplitRatio,
  getFirstLeafPanelId,
  getVisiblePanelIds,
} from '../lib/layout';

export type PanelType = 'terminal' | 'browser' | 'notes' | 'app' | 'workflow' | 'timer' | 'ports' | 'process' | 'env' | 'http' | 'whiteboard' | 'regex' | 'data' | 'encoder' | 'cron' | 'diff' | 'color' | 'epoch' | 'uuid' | 'numbase' | 'ieee754' | 'hexdump' | 'endian' | 'bitfield' | 'svg' | 'k8s' | 'ws' | 'secrets' | 'db' | 'docker' | 'ssl';

export type Panel = {
  id: string;
  type: PanelType;
  title: string;
};

export type Tab = {
  id: string;
  name: string;
  panels: Panel[];
  activePanelId: string | null;
  layout: LayoutNode | null;
  transient?: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  tabs: Tab[];
  activeTabId: string | null;
};

export type EditorState = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
};

function getActiveWorkspace(state: EditorState): Workspace | null {
  return state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? null;
}

function getActiveTab(state: EditorState): Tab | null {
  const ws = getActiveWorkspace(state);
  if (!ws) return null;
  return ws.tabs.find((t) => t.id === ws.activeTabId) ?? null;
}

/** Immutably update the active tab within the state tree */
function updateActiveTab(
  state: EditorState,
  updater: (tab: Tab) => Tab,
): Partial<EditorState> {
  const ws = getActiveWorkspace(state);
  if (!ws) return {};
  const tab = ws.tabs.find((t) => t.id === ws.activeTabId);
  if (!tab) return {};

  const newTab = updater(tab);
  const newTabs = ws.tabs.map((t) => (t.id === tab.id ? newTab : t));
  const newWs = { ...ws, tabs: newTabs };
  return {
    workspaces: state.workspaces.map((w) => (w.id === ws.id ? newWs : w)),
  };
}

/** Immutably update the active workspace */
function updateActiveWorkspace(
  state: EditorState,
  updater: (ws: Workspace) => Workspace,
): Partial<EditorState> {
  const ws = getActiveWorkspace(state);
  if (!ws) return {};
  const newWs = updater(ws);
  return {
    workspaces: state.workspaces.map((w) => (w.id === ws.id ? newWs : w)),
  };
}

/** Collect all panelIds across all tabs of a workspace */
function getAllPanelIds(ws: Workspace): string[] {
  return ws.tabs.flatMap((t) => t.panels.map((p) => p.id));
}

export const PanelOpened = createEvent<Panel>('panel:opened');
export const PanelClosed = createEvent<{ id: string }>('panel:closed');
export const PanelActivated = createEvent<{ id: string }>('panel:activated');

export const TabCreated = createEvent<{ tab: Tab; workspaceId: string }>('tab:created');
export const TabClosed = createEvent<{ tabId: string; panelIds: string[] }>('tab:closed');
export const TabActivated = createEvent<{ tabId: string; browserPanelIds: string[] }>('tab:activated');

export const WorkspaceCreated = createEvent<{ workspace: Workspace }>('workspace:created');
export const WorkspaceSwitched = createEvent<{
  fromId: string | null;
  toId: string;
  fromPanelIds: string[];
  toPanelIds: string[];
}>('workspace:switched');


const defaultWorkspace: Workspace = {
  id: crypto.randomUUID(),
  name: 'Workspace 1',
  tabs: [],
  activeTabId: null,
};

const initialState: EditorState = {
  workspaces: [defaultWorkspace],
  activeWorkspaceId: defaultWorkspace.id,
};


const _store = createStore(initialState)
  .useExtension(withPatch<EditorState>())


  .addCommandHandler('workspace:hydrate', (ctx, cmd) => {
    const state = cmd.data as EditorState;
    ctx.patch({
      workspaces: state.workspaces,
      activeWorkspaceId: state.activeWorkspaceId,
    });
  })

  .addCommandHandler('workspace:create', (ctx, cmd) => {
    const { name } = cmd.data as { name: string };
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      tabs: [],
      activeTabId: null,
    };

    const oldWs = getActiveWorkspace(ctx.state);
    const fromPanelIds = oldWs ? getAllPanelIds(oldWs) : [];

    ctx.patch({
      workspaces: [...ctx.state.workspaces, workspace],
      activeWorkspaceId: workspace.id,
    });
    ctx.emit(WorkspaceCreated, { workspace });
    ctx.emit(WorkspaceSwitched, {
      fromId: oldWs?.id ?? null,
      toId: workspace.id,
      fromPanelIds,
      toPanelIds: [],
    });
  })

  .addCommandHandler('workspace:switch', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    if (id === ctx.state.activeWorkspaceId) return;
    const target = ctx.state.workspaces.find((w) => w.id === id);
    if (!target) return;

    const oldWs = getActiveWorkspace(ctx.state);
    const fromPanelIds = oldWs ? getAllPanelIds(oldWs) : [];
    const activeTab = target.tabs.find((t) => t.id === target.activeTabId);
    const toPanelIds = activeTab ? activeTab.panels.map((p) => p.id) : [];

    ctx.patch({ activeWorkspaceId: id });
    ctx.emit(WorkspaceSwitched, {
      fromId: oldWs?.id ?? null,
      toId: id,
      fromPanelIds,
      toPanelIds,
    });
  })

  .addCommandHandler('workspace:rename', (ctx, cmd) => {
    const { id, name } = cmd.data as { id: string; name: string };
    ctx.patch({
      workspaces: ctx.state.workspaces.map((w) =>
        w.id === id ? { ...w, name } : w,
      ),
    });
  })

  .addCommandHandler('workspace:delete', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    const ws = ctx.state.workspaces.find((w) => w.id === id);
    if (!ws) return;

    const wasActive = ctx.state.activeWorkspaceId === id;

    for (const tab of ws.tabs) {
      const panelIds = tab.panels.map((p) => p.id);
      for (const panel of tab.panels) {
        ctx.emit(PanelClosed, { id: panel.id });
      }
      ctx.emit(TabClosed, { tabId: tab.id, panelIds });
    }

    const remaining = ctx.state.workspaces.filter((w) => w.id !== id);

    if (remaining.length === 0) {
      // Always keep at least one workspace
      const newWs: Workspace = {
        id: crypto.randomUUID(),
        name: 'Workspace 1',
        tabs: [],
        activeTabId: null,
      };
      ctx.patch({
        workspaces: [newWs],
        activeWorkspaceId: newWs.id,
      });
      ctx.emit(WorkspaceCreated, { workspace: newWs });
      if (wasActive) {
        ctx.emit(WorkspaceSwitched, {
          fromId: id,
          toId: newWs.id,
          fromPanelIds: [],
          toPanelIds: [],
        });
      }
    } else {
      const newActiveId = wasActive ? remaining[0].id : ctx.state.activeWorkspaceId;
      ctx.patch({
        workspaces: remaining,
        activeWorkspaceId: newActiveId,
      });
      if (wasActive) {
        const newActiveWs = remaining[0];
        const activeTab = newActiveWs.tabs.find((t) => t.id === newActiveWs.activeTabId);
        const toPanelIds = activeTab
          ? activeTab.panels.reduce<string[]>((acc, p) => { if (p.type === 'browser') acc.push(p.id); return acc; }, [])
          : [];
        ctx.emit(WorkspaceSwitched, {
          fromId: id,
          toId: newActiveWs.id,
          fromPanelIds: [],
          toPanelIds,
        });
      }
    }
  })


  .addCommandHandler('tab:create', (ctx, cmd) => {
    const { panel, tabName, transient, background } = cmd.data as { panel: Panel; tabName?: string; transient?: boolean; background?: boolean };
    const ws = getActiveWorkspace(ctx.state);
    if (!ws) return;

    const tab: Tab = {
      id: crypto.randomUUID(),
      name: tabName ?? panel.title,
      panels: [panel],
      activePanelId: panel.id,
      layout: { type: 'leaf', panelId: panel.id },
      ...(transient ? { transient: true } : {}),
    };

    const newWs = {
      ...ws,
      tabs: [...ws.tabs, tab],
      activeTabId: background ? ws.activeTabId : tab.id,
    };

    ctx.patch({
      workspaces: ctx.state.workspaces.map((w) =>
        w.id === ws.id ? newWs : w,
      ),
    });
    ctx.emit(TabCreated, { tab, workspaceId: ws.id });
    ctx.emit(PanelOpened, panel);

    if (!background && ws.activeTabId && ws.activeTabId !== tab.id) {
      const browserPanelIds = panel.type === 'browser' ? [panel.id] : [];
      ctx.emit(TabActivated, { tabId: tab.id, browserPanelIds });
    }
  })

  .addCommandHandler('tab:close', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    const ws = getActiveWorkspace(ctx.state);
    if (!ws) return;
    const tab = ws.tabs.find((t) => t.id === id);
    if (!tab) return;

    const panelIds = tab.panels.map((p) => p.id);
    const newTabs = ws.tabs.filter((t) => t.id !== id);

    let newActiveTabId: string | null;
    if (ws.activeTabId === id) {
      const oldIdx = ws.tabs.findIndex((t) => t.id === id);
      const neighbor = newTabs[Math.min(oldIdx, newTabs.length - 1)];
      newActiveTabId = neighbor?.id ?? null;
    } else {
      newActiveTabId = ws.activeTabId;
    }

    const newWs = { ...ws, tabs: newTabs, activeTabId: newActiveTabId };
    ctx.patch({
      workspaces: ctx.state.workspaces.map((w) =>
        w.id === ws.id ? newWs : w,
      ),
    });

    for (const pid of panelIds) {
      ctx.emit(PanelClosed, { id: pid });
    }
    ctx.emit(TabClosed, { tabId: id, panelIds });
  })

  .addCommandHandler('tab:activate', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    const ws = getActiveWorkspace(ctx.state);
    if (!ws || ws.activeTabId === id) return;
    const tab = ws.tabs.find((t) => t.id === id);
    if (!tab) return;

    ctx.patch(updateActiveWorkspace(ctx.state, (w) => ({ ...w, activeTabId: id })));

    const visibleIds = tab.layout ? getVisiblePanelIds(tab.layout) : new Set<string>();
    const browserPanelIds = tab.panels.reduce<string[]>((acc, p) => {
      if (p.type === 'browser' && visibleIds.has(p.id)) acc.push(p.id);
      return acc;
    }, []);
    ctx.emit(TabActivated, { tabId: id, browserPanelIds });
  })

  .addCommandHandler('tab:rename', (ctx, cmd) => {
    const { id, name } = cmd.data as { id: string; name: string };
    const ws = getActiveWorkspace(ctx.state);
    if (!ws) return;

    ctx.patch(updateActiveWorkspace(ctx.state, (w) => ({
      ...w,
      tabs: w.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
    })));
  })

  .addCommandHandler('tab:reorder', (ctx, cmd) => {
    const { tabId, toIndex } = cmd.data as { tabId: string; toIndex: number };
    const ws = getActiveWorkspace(ctx.state);
    if (!ws) return;
    const fromIndex = ws.tabs.findIndex((t) => t.id === tabId);
    if (fromIndex === -1 || fromIndex === toIndex) return;

    const newTabs = [...ws.tabs];
    const [moved] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, moved);

    ctx.patch(updateActiveWorkspace(ctx.state, (w) => ({ ...w, tabs: newTabs })));
  })

  .addCommandHandler('tab:closeOthers', (ctx, cmd) => {
    const { tabId } = cmd.data as { tabId: string };
    const ws = getActiveWorkspace(ctx.state);
    if (!ws) return;
    const keepTab = ws.tabs.find((t) => t.id === tabId);
    if (!keepTab) return;

    const closing = ws.tabs.filter((t) => t.id !== tabId);
    if (closing.length === 0) return;

    const prevActiveTabId = ws.activeTabId;

    ctx.patch(updateActiveWorkspace(ctx.state, (w) => ({
      ...w,
      tabs: [keepTab],
      activeTabId: tabId,
    })));

    for (const tab of closing) {
      for (const panel of tab.panels) {
        ctx.emit(PanelClosed, { id: panel.id });
      }
      ctx.emit(TabClosed, { tabId: tab.id, panelIds: tab.panels.map((p) => p.id) });
    }

    if (prevActiveTabId !== tabId) {
      const visibleIds = keepTab.layout ? getVisiblePanelIds(keepTab.layout) : new Set<string>();
      const browserPanelIds = keepTab.panels.reduce<string[]>((acc, p) => {
        if (p.type === 'browser' && visibleIds.has(p.id)) acc.push(p.id);
        return acc;
      }, []);
      ctx.emit(TabActivated, { tabId, browserPanelIds });
    }
  })

  .addCommandHandler('tab:closeToRight', (ctx, cmd) => {
    const { tabId } = cmd.data as { tabId: string };
    const ws = getActiveWorkspace(ctx.state);
    if (!ws) return;
    const idx = ws.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1 || idx === ws.tabs.length - 1) return;

    const keeping = ws.tabs.slice(0, idx + 1);
    const closing = ws.tabs.slice(idx + 1);

    const prevActiveTabId = ws.activeTabId;
    const newActiveTabId = keeping.some((t) => t.id === prevActiveTabId)
      ? prevActiveTabId
      : tabId;

    ctx.patch(updateActiveWorkspace(ctx.state, (w) => ({
      ...w,
      tabs: keeping,
      activeTabId: newActiveTabId,
    })));

    for (const tab of closing) {
      for (const panel of tab.panels) {
        ctx.emit(PanelClosed, { id: panel.id });
      }
      ctx.emit(TabClosed, { tabId: tab.id, panelIds: tab.panels.map((p) => p.id) });
    }

    if (prevActiveTabId !== newActiveTabId) {
      const activeTab = keeping.find((t) => t.id === newActiveTabId)!;
      const visibleIds = activeTab.layout ? getVisiblePanelIds(activeTab.layout) : new Set<string>();
      const browserPanelIds = activeTab.panels.reduce<string[]>((acc, p) => {
        if (p.type === 'browser' && visibleIds.has(p.id)) acc.push(p.id);
        return acc;
      }, []);
      ctx.emit(TabActivated, { tabId: newActiveTabId, browserPanelIds });
    }
  })


  .addCommandHandler('panel:open', (ctx, cmd) => {
    const panel = cmd.data as Panel;
    const tab = getActiveTab(ctx.state);
    if (!tab) return;

    let newLayout: LayoutNode;
    let panels = [...tab.panels];
    const closedIds: string[] = [];

    if (!tab.layout) {
      newLayout = { type: 'leaf', panelId: panel.id };
    } else if (tab.activePanelId && containsPanel(tab.layout, tab.activePanelId)) {
      newLayout = replaceLeafPanel(tab.layout, tab.activePanelId, panel.id);
      closedIds.push(tab.activePanelId);
      panels = panels.filter((p) => p.id !== tab.activePanelId);
    } else {
      newLayout = { type: 'leaf', panelId: panel.id };
    }

    ctx.patch(updateActiveTab(ctx.state, (t) => ({
      ...t,
      panels: [...panels, panel],
      activePanelId: panel.id,
      layout: newLayout,
    })));

    for (const id of closedIds) {
      ctx.emit(PanelClosed, { id });
    }
    ctx.emit(PanelOpened, panel);
  })

  .addCommandHandler('panel:close', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    const tab = getActiveTab(ctx.state);
    if (!tab) return;

    const panels = tab.panels.filter((p) => p.id !== id);
    const layout = tab.layout ? removePanel(tab.layout, id) : null;
    const wasActive = tab.activePanelId === id;

    let activePanelId: string | null;
    if (wasActive) {
      activePanelId = layout
        ? getFirstLeafPanelId(layout)
        : panels[panels.length - 1]?.id ?? null;
    } else {
      activePanelId = tab.activePanelId;
    }

    ctx.patch(updateActiveTab(ctx.state, (t) => ({
      ...t,
      panels,
      activePanelId,
      layout,
    })));
    ctx.emit(PanelClosed, { id });
  })

  .addCommandHandler('panel:activate', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    const tab = getActiveTab(ctx.state);
    if (!tab || !tab.layout || !containsPanel(tab.layout, id)) return;

    ctx.patch(updateActiveTab(ctx.state, (t) => ({
      ...t,
      activePanelId: id,
    })));
    ctx.emit(PanelActivated, { id });
  })

  .addCommandHandler('panel:updateTitle', (ctx, cmd) => {
    const { id, title } = cmd.data as { id: string; title: string };
    // Search across all tabs in the active workspace (title updates come async from PTY)
    const ws = getActiveWorkspace(ctx.state);
    if (!ws) return;

    ctx.patch(updateActiveWorkspace(ctx.state, (w) => ({
      ...w,
      tabs: w.tabs.map((t) => ({
        ...t,
        panels: t.panels.map((p) => (p.id === id ? { ...p, title } : p)),
      })),
    })));
  })


  .addCommandHandler('layout:split', (ctx, cmd) => {
    const { direction, newPanel } = cmd.data as {
      direction: 'horizontal' | 'vertical';
      newPanel: Panel;
    };
    const tab = getActiveTab(ctx.state);
    if (!tab || !tab.layout || !tab.activePanelId) return;

    const splitId = crypto.randomUUID();
    const newLayout = splitLeaf(
      tab.layout,
      tab.activePanelId,
      direction,
      newPanel.id,
      splitId,
    );

    ctx.patch(updateActiveTab(ctx.state, (t) => ({
      ...t,
      panels: [...t.panels, newPanel],
      activePanelId: newPanel.id,
      layout: newLayout,
    })));
    ctx.emit(PanelOpened, newPanel);
  })

  .addCommandHandler('layout:resize', (ctx, cmd) => {
    const { splitId, ratio } = cmd.data as { splitId: string; ratio: number };
    const tab = getActiveTab(ctx.state);
    if (!tab || !tab.layout) return;

    ctx.patch(updateActiveTab(ctx.state, (t) => ({
      ...t,
      layout: updateSplitRatio(t.layout!, splitId, ratio),
    })));
  });

export const workspaceStore = sealStore(_store);


// Hydrate
export const hydrateWorkspace = (state: EditorState) =>
  createCommand('workspace:hydrate', state);

export const createWorkspace = (name: string) =>
  createCommand('workspace:create', { name });

export const switchWorkspace = (id: string) =>
  createCommand('workspace:switch', { id });

export const renameWorkspace = (id: string, name: string) =>
  createCommand('workspace:rename', { id, name });

export const deleteWorkspace = (id: string) =>
  createCommand('workspace:delete', { id });

export const createTab = (panel: Panel, tabName?: string, transient?: boolean, background?: boolean) =>
  createCommand('tab:create', { panel, tabName, transient, background });

export const closeTab = (id: string) =>
  createCommand('tab:close', { id });

export const activateTab = (id: string) =>
  createCommand('tab:activate', { id });

export const renameTab = (id: string, name: string) =>
  createCommand('tab:rename', { id, name });

export const reorderTab = (tabId: string, toIndex: number) =>
  createCommand('tab:reorder', { tabId, toIndex });

export const closeOtherTabs = (tabId: string) =>
  createCommand('tab:closeOthers', { tabId });

export const closeTabsToRight = (tabId: string) =>
  createCommand('tab:closeToRight', { tabId });

export const openPanel = (panel: Panel) =>
  createCommand('panel:open', panel);

export const closePanel = (id: string) =>
  createCommand('panel:close', { id });

export const activatePanel = (id: string) =>
  createCommand('panel:activate', { id });

export const updatePanelTitle = (id: string, title: string) =>
  createCommand('panel:updateTitle', { id, title });

export const layoutSplit = (
  direction: 'horizontal' | 'vertical',
  newPanel: Panel,
) => createCommand('layout:split', { direction, newPanel });

export const layoutResize = (splitId: string, ratio: number) =>
  createCommand('layout:resize', { splitId, ratio });

export { getActiveWorkspace, getActiveTab };
