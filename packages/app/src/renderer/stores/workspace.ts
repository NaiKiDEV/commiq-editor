import {
  createStore,
  sealStore,
  createCommand,
  createEvent,
} from '@naikidev/commiq';
import { withPatch } from '@naikidev/commiq-context';

export type PanelType = 'terminal' | 'browser' | 'app';

export type Panel = {
  id: string;
  type: PanelType;
  title: string;
};

export type WorkspaceState = {
  panels: Panel[];
  activePanelId: string | null;
};

const initialState: WorkspaceState = {
  panels: [],
  activePanelId: null,
};

export const PanelOpened = createEvent<Panel>('panel:opened');
export const PanelClosed = createEvent<{ id: string }>('panel:closed');
export const PanelActivated = createEvent<{ id: string }>('panel:activated');

const _store = createStore(initialState)
  .useExtension(withPatch<WorkspaceState>())
  .addCommandHandler('panel:open', (ctx, cmd) => {
    const panel = cmd.data as Panel;
    ctx.patch({
      panels: [...ctx.state.panels, panel],
      activePanelId: panel.id,
    });
    ctx.emit(PanelOpened, panel);
  })
  .addCommandHandler('panel:close', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    const panels = ctx.state.panels.filter((p) => p.id !== id);
    const wasActive = ctx.state.activePanelId === id;
    ctx.patch({
      panels,
      activePanelId: wasActive
        ? panels[panels.length - 1]?.id ?? null
        : ctx.state.activePanelId,
    });
    ctx.emit(PanelClosed, { id });
  })
  .addCommandHandler('panel:activate', (ctx, cmd) => {
    const { id } = cmd.data as { id: string };
    if (ctx.state.panels.some((p) => p.id === id)) {
      ctx.patch({ activePanelId: id });
      ctx.emit(PanelActivated, { id });
    }
  })
  .addCommandHandler('panel:updateTitle', (ctx, cmd) => {
    const { id, title } = cmd.data as { id: string; title: string };
    ctx.patch({
      panels: ctx.state.panels.map((p) =>
        p.id === id ? { ...p, title } : p,
      ),
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
