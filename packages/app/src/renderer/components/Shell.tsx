import { TooltipProvider } from './ui/tooltip';
import { TitleBar } from './TitleBar';
import { TabBar } from './TabBar';
import { PanelContainer } from './PanelContainer';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { useWorkspaceActions } from '../hooks/use-workspace';
import { useTerminalActions } from '../hooks/use-terminal';
import { useBrowserActions } from '../hooks/use-browser';

export function Shell() {
  const { openPanel, closePanel } = useWorkspaceActions();
  const { kill: killTerminal } = useTerminalActions();
  const { close: closeBrowser } = useBrowserActions();

  const handleClosePanel = (id: string, type: string) => {
    if (type === 'terminal') {
      killTerminal(id);
    } else if (type === 'browser') {
      closeBrowser(id);
    }
    closePanel(id);
  };

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-col h-screen bg-background text-foreground">
        <TitleBar />
        <TabBar
          onNewTerminal={() => openPanel('terminal', 'Terminal')}
          onNewBrowser={() => openPanel('browser', 'Browser')}
          onNewNotes={() => openPanel('notes', 'Notes')}
          onClosePanel={handleClosePanel}
        />
        <PanelContainer />
        <StatusBar />
        <CommandPalette />
      </div>
    </TooltipProvider>
  );
}
