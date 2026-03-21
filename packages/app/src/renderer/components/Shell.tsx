import { TabBar } from './TabBar';
import { PanelContainer } from './PanelContainer';
import { useWorkspaceActions } from '../hooks/use-workspace';
import { useTerminalActions } from '../hooks/use-terminal';

export function Shell() {
  const { openPanel, closePanel } = useWorkspaceActions();
  const { kill: killTerminal } = useTerminalActions();

  const handleClosePanel = (id: string, type: string) => {
    if (type === 'terminal') {
      killTerminal(id);
    }
    closePanel(id);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100">
      <TabBar
        onNewTerminal={() => openPanel('terminal', 'Terminal')}
        onNewBrowser={() => openPanel('browser', 'Browser')}
        onClosePanel={handleClosePanel}
      />
      <PanelContainer />
    </div>
  );
}
