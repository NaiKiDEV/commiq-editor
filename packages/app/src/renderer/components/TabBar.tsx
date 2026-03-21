import { TerminalSquare, Globe, NotepadText, X, Plus } from 'lucide-react';
import {
  usePanels,
  useActivePanelId,
  useLayout,
  useWorkspaceActions,
} from '../hooks/use-workspace';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';
import { cn } from '@/lib/utils';
import { useCallback } from 'react';
import { getVisiblePanelIds } from '../lib/layout';

type TabBarProps = {
  onNewTerminal: () => void;
  onNewBrowser: () => void;
  onNewNotes: () => void;
  onClosePanel: (id: string, type: string) => void;
};

export function TabBar({ onNewTerminal, onNewBrowser, onNewNotes, onClosePanel }: TabBarProps) {
  const panels = usePanels();
  const activePanelId = useActivePanelId();
  const layout = useLayout();
  const { activatePanel } = useWorkspaceActions();

  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      window.electronAPI.browser.hideAll();
    } else {
      const visibleIds = getVisiblePanelIds(layout);
      for (const panel of panels) {
        if (panel.type === 'browser' && visibleIds.has(panel.id)) {
          window.electronAPI.browser.showSession(panel.id);
        }
      }
    }
  }, [panels, layout]);

  return (
    <div className="flex items-center h-8 bg-card/50 border-b border-border select-none shrink-0">
      <div className="flex items-center overflow-x-auto flex-1 min-w-0">
        {panels.map((panel) => (
          <button
            key={panel.id}
            className={cn(
              'group flex items-center gap-1.5 px-3 h-8 text-xs border-r border-border whitespace-nowrap transition-colors',
              panel.id === activePanelId
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
            onClick={() => activatePanel(panel.id)}
          >
            {panel.type === 'terminal' ? (
              <TerminalSquare className="size-3" />
            ) : panel.type === 'browser' ? (
              <Globe className="size-3" />
            ) : (
              <NotepadText className="size-3" />
            )}
            <span className="max-w-32 truncate">{panel.title}</span>
            <span
              className="ml-0.5 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onClosePanel(panel.id, panel.type);
              }}
            >
              <X className="size-3" />
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center px-1 shrink-0">
        <DropdownMenu onOpenChange={handleMenuOpenChange}>
          <Tooltip>
            <DropdownMenuTrigger
              render={<TooltipTrigger render={<Button variant="ghost" size="icon-xs" />} />}
            >
              <Plus className="size-3.5" />
            </DropdownMenuTrigger>
            <TooltipContent side="bottom">New Tab</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onNewTerminal}>
              <TerminalSquare />
              Terminal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewBrowser}>
              <Globe />
              Browser
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewNotes}>
              <NotepadText />
              Notes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
