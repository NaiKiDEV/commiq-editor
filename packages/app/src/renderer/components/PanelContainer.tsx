import { usePanels, useLayout } from '../hooks/use-workspace';
import { LayoutRenderer } from './LayoutRenderer';
import { TerminalPanel } from './TerminalPanel';
import { BrowserPanel } from './BrowserPanel';
import { getVisiblePanelIds } from '../lib/layout';

export function PanelContainer() {
  const panels = usePanels();
  const layout = useLayout();

  if (!layout || panels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <p className="text-2xl font-semibold tracking-tight text-foreground/80">Commiq Editor</p>
          <div className="space-y-1 text-sm">
            <p>
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">Ctrl+K</kbd>
              {' '}to open command palette
            </p>
            <p className="text-muted-foreground/60">or click + to open a new tab</p>
          </div>
        </div>
      </div>
    );
  }

  const visibleIds = getVisiblePanelIds(layout);

  // Panels not in the layout tree — keep mounted but hidden to preserve state
  const hiddenPanels = panels.filter((p) => !visibleIds.has(p.id));

  return (
    <div className="flex-1 overflow-hidden relative">
      <LayoutRenderer node={layout} panels={panels} />

      {/* Hidden panels preserve xterm.js / WebContentsView state */}
      {hiddenPanels.map((panel) => (
        <div
          key={panel.id}
          className="absolute inset-0"
          style={{ display: 'none' }}
        >
          {panel.type === 'terminal' && (
            <TerminalPanel sessionId={panel.id} panelId={panel.id} />
          )}
          {panel.type === 'browser' && (
            <BrowserPanel sessionId={panel.id} panelId={panel.id} isActive={false} />
          )}
        </div>
      ))}
    </div>
  );
}
