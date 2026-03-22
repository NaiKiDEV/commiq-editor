import { TerminalSquare, Globe, NotepadText, Columns2, Layers } from 'lucide-react';
import {
  usePanels,
  useActivePanel,
  useActiveWorkspace,
  useTabs,
  useActiveTab,
} from '../hooks/use-workspace';

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
  const activeWorkspace = useActiveWorkspace();
  const tabs = useTabs();
  const activeTab = useActiveTab();

  return (
    <div className="flex items-center h-6 px-3 bg-card border-t border-border text-[11px] text-muted-foreground select-none shrink-0 gap-3">
      {/* Workspace name */}
      {activeWorkspace && (
        <div className="flex items-center gap-1">
          <Layers className="size-3" />
          <span className="truncate max-w-32">{activeWorkspace.name}</span>
        </div>
      )}

      {/* Active panel indicator */}
      {activePanel && (
        <div className="flex items-center gap-1.5">
          <PanelIcon type={activePanel.type} />
          <span className="truncate max-w-48">{activePanel.title}</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tab count */}
      {tabs.length > 1 && (
        <span>
          {tabs.length} tabs
        </span>
      )}

      {/* Pane count within active tab */}
      {panels.length > 1 && (
        <div className="flex items-center gap-1">
          <Columns2 className="size-3" />
          <span>{panels.length} panes</span>
        </div>
      )}
    </div>
  );
}
