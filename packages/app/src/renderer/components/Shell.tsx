import { useCallback, useEffect, useRef, useState } from 'react';
import { useEvent } from '@naikidev/commiq-react';
import { TooltipProvider } from './ui/tooltip';
import { TitleBar } from './TitleBar';
import { TabBar } from './TabBar';
import { PanelContainer } from './PanelContainer';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import type { CommandPaletteHandle } from './CommandPalette';
import { SettingsProvider } from '../contexts/settings';
import { SettingsModal } from './SettingsModal';
import { useTerminalActions } from '../hooks/use-terminal';
import { useBrowserActions } from '../hooks/use-browser';
import {
  workspaceStore,
  PanelClosed,
  WorkspaceSwitched,
  TabActivated,
} from '../stores/workspace';
import { useTabs, useActiveTabId, useWorkspaceActions } from '../hooks/use-workspace';

export const isRenamingTabRef = { current: false };

export function Shell() {
  const { kill: killTerminal } = useTerminalActions();
  const { close: closeBrowser } = useBrowserActions();

  useEvent(
    workspaceStore,
    PanelClosed,
    useCallback(
      (event) => {
        const { id } = event.data;
        killTerminal(id);
        closeBrowser(id);
      },
      [killTerminal, closeBrowser],
    ),
  );

  useEvent(
    workspaceStore,
    WorkspaceSwitched,
    useCallback((event) => {
      const { toPanelIds } = event.data;
      window.electronAPI.browser.hideAll();
      for (const id of toPanelIds) {
        window.electronAPI.browser.showSession(id);
      }
    }, []),
  );

  useEvent(
    workspaceStore,
    TabActivated,
    useCallback((event) => {
      window.electronAPI.browser.hideAll();
      for (const id of event.data.browserPanelIds) {
        window.electronAPI.browser.showSession(id);
      }
    }, []),
  );

  const tabs = useTabs();
  const activeTabId = useActiveTabId();
  const { activateTab, closeTab } = useWorkspaceActions();
  const commandPaletteRef = useRef<CommandPaletteHandle | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isRenamingTabRef.current) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length <= 1) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx === -1) return;
        const next = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        activateTab(tabs[next].id);
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        const targetIdx = num === 9 ? tabs.length - 1 : num - 1;
        if (targetIdx < tabs.length) {
          activateTab(tabs[targetIdx].id);
        }
        return;
      }

      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (tabs.length <= 1 || !activeTabId) return;
        closeTab(activeTabId);
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        commandPaletteRef.current?.openWithSearch('New');
        return;
      }

      if (e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, activeTabId, activateTab, closeTab]);

  useEffect(() => {
    return window.electronAPI.onShortcut((action) => {
      if (isRenamingTabRef.current) return;
      if (action === 'next-tab') {
        if (tabs.length <= 1) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const next = (idx + 1) % tabs.length;
        activateTab(tabs[next].id);
      } else if (action === 'prev-tab') {
        if (tabs.length <= 1) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const prev = (idx - 1 + tabs.length) % tabs.length;
        activateTab(tabs[prev].id);
      } else if (action === 'close-tab') {
        if (tabs.length <= 1 || !activeTabId) return;
        closeTab(activeTabId);
      } else if (action === 'new-tab') {
        commandPaletteRef.current?.openWithSearch('New');
      } else if (action.startsWith('activate-tab-')) {
        const num = parseInt(action.split('-')[2], 10);
        const targetIdx = num === 9 ? tabs.length - 1 : num - 1;
        if (targetIdx >= 0 && targetIdx < tabs.length) {
          activateTab(tabs[targetIdx].id);
        }
      }
    });
  }, [tabs, activeTabId, activateTab, closeTab]);

  return (
    <SettingsProvider>
      <TooltipProvider delay={300}>
        <div className="flex flex-col h-screen bg-background text-foreground">
          <TitleBar onSettingsOpen={() => setSettingsOpen(true)} />
          <TabBar />
          <PanelContainer />
          <StatusBar />
          <CommandPalette ref={commandPaletteRef} />
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      </TooltipProvider>
    </SettingsProvider>
  );
}
