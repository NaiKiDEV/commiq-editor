import { useCallback } from 'react';
import { useEvent } from '@naikidev/commiq-react';
import { TooltipProvider } from './ui/tooltip';
import { TitleBar } from './TitleBar';
import { TabBar } from './TabBar';
import { PanelContainer } from './PanelContainer';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { useWorkspaceActions } from '../hooks/use-workspace';
import { useTerminalActions } from '../hooks/use-terminal';
import { useBrowserActions } from '../hooks/use-browser';
import { workspaceStore, PanelClosed } from '../stores/workspace';

export function Shell() {
  const { openPanel, closePanel } = useWorkspaceActions();
  const { kill: killTerminal } = useTerminalActions();
  const { close: closeBrowser } = useBrowserActions();

  // Reactively clean up sessions when any panel is closed (manual or replaced by open)
  useEvent(workspaceStore, PanelClosed, useCallback((event) => {
    const { id } = event.data;
    // Find the panel type from the panels list at the time of close
    // The panel may already be removed from state, so we check terminal/browser stores directly
    killTerminal(id);
    closeBrowser(id);
  }, [killTerminal, closeBrowser]));

  const handleClosePanel = (id: string) => {
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
