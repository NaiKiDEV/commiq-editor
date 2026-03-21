import { usePanels, useActivePanelId } from '../hooks/use-workspace';
import { TerminalPanel } from './TerminalPanel';

export function PanelContainer() {
  const panels = usePanels();
  const activePanelId = useActivePanelId();

  if (panels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600">
        <div className="text-center">
          <p className="text-lg font-medium">Commiq Editor</p>
          <p className="text-sm mt-1">Open a terminal or browser tab to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      {panels.map((panel) => (
        <div
          key={panel.id}
          className="absolute inset-0"
          style={{ display: panel.id === activePanelId ? 'block' : 'none' }}
        >
          {panel.type === 'terminal' && (
            <TerminalPanel sessionId={panel.id} panelId={panel.id} />
          )}
          {panel.type === 'browser' && (
            <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
              Browser panel: {panel.title} (WebContentsView integration pending)
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
