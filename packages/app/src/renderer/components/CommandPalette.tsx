import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  TerminalSquare,
  Globe,
  NotepadText,
  Zap,
  X,
  Columns2,
  Rows2,
  Layers,
  Plus,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from './ui/command';
import {
  usePanels,
  useTabs,
  useLayout,
  useWorkspaces,
  useActiveWorkspace,
  useWorkspaceActions,
} from '../hooks/use-workspace';
import { getVisiblePanelIds } from '../lib/layout';

export type CommandPaletteHandle = {
  openWithSearch: (search: string) => void;
};

export const CommandPalette = forwardRef<CommandPaletteHandle>(function CommandPalette(_props, ref) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const panels = usePanels();
  const tabs = useTabs();
  const layout = useLayout();
  const workspaces = useWorkspaces();
  const activeWorkspace = useActiveWorkspace();
  const {
    createTab,
    closeTab,
    activateTab,
    activatePanel,
    closePanel,
    splitPanel,
    createWorkspace,
    switchWorkspace,
  } = useWorkspaceActions();

  useImperativeHandle(ref, () => ({
    openWithSearch: (initialSearch: string) => {
      setSearch(initialSearch);
      setOpen(true);
      window.electronAPI.browser.hideAll();
    },
  }));

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
        setSearch('');
        restoreVisibleBrowsers();
      }
      return next;
    });
  }, [restoreVisibleBrowsers]);

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

  useEffect(() => {
    return window.electronAPI.onShortcut((action) => {
      if (action === 'toggle-command-palette') {
        togglePalette();
      }
    });
  }, [togglePalette]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        window.electronAPI.browser.hideAll();
      } else {
        setSearch('');
        restoreVisibleBrowsers();
      }
    },
    [restoreVisibleBrowsers],
  );

  const runAction = (action: () => void) => {
    action();
    handleOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Type a command or search..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* New tab actions */}
        <CommandGroup heading="New Tab">
          <CommandItem
            onSelect={() => runAction(() => createTab('terminal', 'Terminal'))}
          >
            <TerminalSquare />
            <span>New Terminal Tab</span>
            <CommandShortcut>terminal</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => createTab('browser', 'Browser'))}
          >
            <Globe />
            <span>New Browser Tab</span>
            <CommandShortcut>browser</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => createTab('notes', 'Notes'))}
          >
            <NotepadText />
            <span>New Notes Tab</span>
            <CommandShortcut>notes</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => createTab('workflow', 'Workflows'))}
          >
            <Zap />
            <span>New Workflow Tab</span>
            <CommandShortcut>workflow</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Split actions (within active tab) */}
        {panels.length > 0 && (
          <CommandGroup heading="Split">
            <CommandItem
              onSelect={() =>
                runAction(() =>
                  splitPanel('horizontal', 'terminal', 'Terminal'),
                )
              }
            >
              <Columns2 />
              <span>Split Right: Terminal</span>
              <CommandShortcut>split</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runAction(() =>
                  splitPanel('vertical', 'terminal', 'Terminal'),
                )
              }
            >
              <Rows2 />
              <span>Split Down: Terminal</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runAction(() =>
                  splitPanel('horizontal', 'browser', 'Browser'),
                )
              }
            >
              <Columns2 />
              <span>Split Right: Browser</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runAction(() =>
                  splitPanel('vertical', 'browser', 'Browser'),
                )
              }
            >
              <Rows2 />
              <span>Split Down: Browser</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Workspace actions */}
        <CommandGroup heading="Workspace">
          <CommandItem
            onSelect={() =>
              runAction(() =>
                createWorkspace(`Workspace ${workspaces.length + 1}`),
              )
            }
          >
            <Plus />
            <span>New Workspace</span>
          </CommandItem>
          {workspaces
            .filter((ws) => ws.id !== activeWorkspace?.id)
            .map((ws) => (
              <CommandItem
                key={`ws-${ws.id}`}
                onSelect={() => runAction(() => switchWorkspace(ws.id))}
              >
                <Layers />
                <span>Switch to: {ws.name}</span>
              </CommandItem>
            ))}
        </CommandGroup>

        {/* Tab navigation */}
        {tabs.length > 1 && (
          <CommandGroup heading="Switch Tab">
            {tabs.map((tab) => (
              <CommandItem
                key={`tab-${tab.id}`}
                onSelect={() => runAction(() => activateTab(tab.id))}
              >
                {tab.panels[0]?.type === 'terminal' ? (
                  <TerminalSquare />
                ) : tab.panels[0]?.type === 'browser' ? (
                  <Globe />
                ) : (
                  <NotepadText />
                )}
                <span>{tab.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Focus pane (within active tab) */}
        {panels.length > 1 && (
          <CommandGroup heading="Focus Pane">
            {panels.map((panel) => (
              <CommandItem
                key={`focus-${panel.id}`}
                onSelect={() => runAction(() => activatePanel(panel.id))}
              >
                {panel.type === 'terminal' ? (
                  <TerminalSquare />
                ) : panel.type === 'browser' ? (
                  <Globe />
                ) : (
                  <NotepadText />
                )}
                <span>{panel.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Close actions */}
        {(tabs.length > 0 || panels.length > 0) && (
          <CommandGroup heading="Close">
            {tabs.map((tab) => (
              <CommandItem
                key={`close-tab-${tab.id}`}
                onSelect={() => runAction(() => closeTab(tab.id))}
              >
                <X />
                <span>Close Tab: {tab.name}</span>
              </CommandItem>
            ))}
            {panels.length > 1 &&
              panels.map((panel) => (
                <CommandItem
                  key={`close-${panel.id}`}
                  onSelect={() => runAction(() => closePanel(panel.id))}
                >
                  <X />
                  <span>Close Pane: {panel.title}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
});
