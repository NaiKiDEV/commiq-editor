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
} from '../lib/layout';

export type PanelType = 'terminal' | 'browser' | 'notes' | 'app';

export type Panel = {
  id: string;
  type: PanelType;
  title: string;
};

export type WorkspaceState = {
  panels: Panel[];
  activePanelId: string | null;
  layout: LayoutNode | null;
};

const initialState: WorkspaceState = {
  panels: [],
  activePanelId: null,
  layout: null,
};

export const PanelOpened = createEvent<Panel>('panel:opened');
export const PanelClosed = createEvent<{ id: string }>('panel:closed');
export const PanelActivated = createEvent<{ id: string }>('panel:activated');

const _store = createStore(initialState)
  .useExtension(withPatch<WorkspaceState>())
  .addCommandHandler('panel:open', (ctx, cmd) => {
    const panel = cmd.data as Panel;
    const { layout, activePanelId } = ctx.state;

    let newLayout: LayoutNode;
    let panels = [...ctx.state.panels];
    const closedIds: string[] = [];

    if (!layout) {
      // First panel — create a single leaf
      newLayout = { type: 'leaf', panelId: panel.id };
    } else if (activePanelId && containsPanel(layout, activePanelId)) {
      // Replace the focused leaf — close the old panel
      newLayout = replaceLeafPanel(layout, activePanelId, panel.id);
      closedIds.push(activePanelId);
      panels = panels.filter((p) => p.id !== activePanelId);
    } else {
      newLayout = { type: 'leaf', panelId: panel.id };
    }

    ctx.patch({
      panels: [...panels, panel],
      activePanelId: panel.id,
      layout: newLayout,
    });

    // Emit close for replaced panel so sessions get cleaned up
    for (const id of closedIds) {
      ctx.emit(PanelClosed, { id });
    }
    ctx.emit(PanelOpened, panel);
  })
  .addCommandHandler('panel:close', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    const panels = ctx.state.panels.filter((p) => p.id !== id);
    const layout = ctx.state.layout ? removePanel(ctx.state.layout, id) : null;
    const wasActive = ctx.state.activePanelId === id;

    let activePanelId: string | null;
    if (wasActive) {
      // Focus the first visible panel in layout, or last in panels list
      activePanelId = layout
        ? getFirstLeafPanelId(layout)
        : panels[panels.length - 1]?.id ?? null;
    } else {
      activePanelId = ctx.state.activePanelId;
    }

    ctx.patch({ panels, activePanelId, layout });
    ctx.emit(PanelClosed, { id });
  })
  .addCommandHandler('panel:activate', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    // Only focus panels that are in the layout — never mutate layout
    if (!ctx.state.layout || !containsPanel(ctx.state.layout, id)) return;
    ctx.patch({ activePanelId: id });
    ctx.emit(PanelActivated, { id });
  })
  .addCommandHandler('panel:updateTitle', (ctx, cmd) => {
    const { id, title } = cmd.data as { id: string; title: string };
    ctx.patch({
      panels: ctx.state.panels.map((p) =>
        p.id === id ? { ...p, title } : p,
      ),
    });
  })
  .addCommandHandler('layout:split', (ctx, cmd) => {
    const { direction, newPanel } = cmd.data as {
      direction: 'horizontal' | 'vertical';
      newPanel: Panel;
    };
    const { layout, activePanelId } = ctx.state;
    if (!layout || !activePanelId) return;

    const splitId = crypto.randomUUID();
    const newLayout = splitLeaf(layout, activePanelId, direction, newPanel.id, splitId);

    ctx.patch({
      panels: [...ctx.state.panels, newPanel],
      activePanelId: newPanel.id,
      layout: newLayout,
    });
    ctx.emit(PanelOpened, newPanel);
  })
  .addCommandHandler('layout:resize', (ctx, cmd) => {
    const { splitId, ratio } = cmd.data as { splitId: string; ratio: number };
    if (!ctx.state.layout) return;
    ctx.patch({
      layout: updateSplitRatio(ctx.state.layout, splitId, ratio),
    });
  });

export const workspaceStore = sealStore(_store);

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
