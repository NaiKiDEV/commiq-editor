import { useSelector, useQueue } from '@naikidev/commiq-react';
import {
  workspaceStore,
  openPanel,
  closePanel,
  activatePanel,
  updatePanelTitle,
  type Panel,
  type PanelType,
} from '../stores/workspace';

export function usePanels() {
  return useSelector(workspaceStore, (s) => s.panels);
}

export function useActivePanelId() {
  return useSelector(workspaceStore, (s) => s.activePanelId);
}

export function useActivePanel() {
  return useSelector(workspaceStore, (s) =>
    s.panels.find((p) => p.id === s.activePanelId) ?? null,
  );
}

export function useWorkspaceActions() {
  const queue = useQueue(workspaceStore);

  return {
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
    updatePanelTitle: (id: string, title: string) => queue(updatePanelTitle(id, title)),
  };
}
