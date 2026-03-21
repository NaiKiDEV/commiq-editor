import { useEffect, useState, useCallback } from 'react';
import { TerminalSquare, Globe, NotepadText, X, Columns2, Rows2 } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from './ui/command';
import { usePanels, useActivePanelId, useLayout, useWorkspaceActions } from '../hooks/use-workspace';
import { useTerminalActions } from '../hooks/use-terminal';
import { useBrowserActions } from '../hooks/use-browser';
import { getVisiblePanelIds } from '../lib/layout';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const activePanelId = useActivePanelId();
  const panels = usePanels();
  const layout = useLayout();
  const { openPanel, activatePanel, closePanel, splitPanel } = useWorkspaceActions();
  const { kill: killTerminal } = useTerminalActions();
  const { close: closeBrowser } = useBrowserActions();

  const restoreVisibleBrowsers = useCallback(() => {
    const visibleIds = getVisiblePanelIds(layout);
    for (const panel of panels) {
      if (panel.type === 'browser' && visibleIds.has(panel.id)) {
        window.electronAPI.browser.showSession(panel.id);
      }
    }
  }, [panels, layout]);

  const togglePalette = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        window.electronAPI.browser.hideAll();
      } else {
        restoreVisibleBrowsers();
      }
      return next;
    });
  }, [restoreVisibleBrowsers]);

  // Keyboard shortcut from renderer DOM (terminal lets this bubble)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePalette]);

  // Shortcut forwarded from WebContentsView via main process
  useEffect(() => {
    return window.electronAPI.onShortcut((action) => {
      if (action === 'toggle-command-palette') {
        togglePalette();
      }
    });
  }, [togglePalette]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      window.electronAPI.browser.hideAll();
    } else {
      restoreVisibleBrowsers();
    }
  }, [restoreVisibleBrowsers]);

  const runAction = (action: () => void) => {
    action();
    handleOpenChange(false);
  };

  const handleClosePanel = (id: string, type: string) => {
    if (type === 'terminal') killTerminal(id);
    else if (type === 'browser') closeBrowser(id);
    closePanel(id);
  };

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runAction(() => openPanel('terminal', 'Terminal'))}>
            <TerminalSquare />
            <span>New Terminal</span>
            <CommandShortcut>terminal</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => openPanel('browser', 'Browser'))}>
            <Globe />
            <span>New Browser</span>
            <CommandShortcut>browser</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => openPanel('notes', 'Notes'))}>
            <NotepadText />
            <span>New Notes</span>
            <CommandShortcut>notes</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        {panels.length > 0 && (
          <CommandGroup heading="Split">
            <CommandItem onSelect={() => runAction(() => splitPanel('horizontal', 'terminal', 'Terminal'))}>
              <Columns2 />
              <span>Split Right: Terminal</span>
              <CommandShortcut>split</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runAction(() => splitPanel('vertical', 'terminal', 'Terminal'))}>
              <Rows2 />
              <span>Split Down: Terminal</span>
            </CommandItem>
            <CommandItem onSelect={() => runAction(() => splitPanel('horizontal', 'browser', 'Browser'))}>
              <Columns2 />
              <span>Split Right: Browser</span>
            </CommandItem>
            <CommandItem onSelect={() => runAction(() => splitPanel('vertical', 'browser', 'Browser'))}>
              <Rows2 />
              <span>Split Down: Browser</span>
            </CommandItem>
          </CommandGroup>
        )}
        {panels.length > 0 && (
          <>
            <CommandGroup heading="Switch Tab">
              {panels.map((panel) => (
                <CommandItem
                  key={`switch-${panel.id}`}
                  onSelect={() => runAction(() => activatePanel(panel.id))}
                >
                  {panel.type === 'terminal' ? <TerminalSquare /> : <Globe />}
                  <span>{panel.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Close Tab">
              {panels.map((panel) => (
                <CommandItem
                  key={`close-${panel.id}`}
                  onSelect={() => runAction(() => handleClosePanel(panel.id, panel.type))}
                >
                  <X />
                  <span>Close: {panel.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
