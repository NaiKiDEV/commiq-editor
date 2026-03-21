import { TerminalSquare, Globe, NotepadText, Columns2 } from 'lucide-react';
import { usePanels, useActivePanel, useLayout } from '../hooks/use-workspace';
import { getVisiblePanelIds } from '../lib/layout';

function PanelIcon({ type }: { type: string }) {
  switch (type) {
    case 'terminal': return <TerminalSquare className="size-3" />;
    case 'browser': return <Globe className="size-3" />;
    case 'notes': return <NotepadText className="size-3" />;
    default: return null;
  }
}

export function StatusBar() {
  const panels = usePanels();
  const activePanel = useActivePanel();
  const layout = useLayout();

  const visibleIds = getVisiblePanelIds(layout);
  const visibleCount = visibleIds.size;

  return (
    <div className="flex items-center h-6 px-3 bg-card border-t border-border text-[11px] text-muted-foreground select-none shrink-0 gap-3">
      {/* Active panel indicator */}
      {activePanel && (
        <div className="flex items-center gap-1.5">
          <PanelIcon type={activePanel.type} />
          <span className="truncate max-w-48">{activePanel.title}</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Split indicator */}
      {visibleCount > 1 && (
        <div className="flex items-center gap-1">
          <Columns2 className="size-3" />
          <span>{visibleCount} panes</span>
        </div>
      )}

      {/* Panel count */}
      <span>{panels.length} {panels.length === 1 ? 'tab' : 'tabs'}</span>
    </div>
  );
}
