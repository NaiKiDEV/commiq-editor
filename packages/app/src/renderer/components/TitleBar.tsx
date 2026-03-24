import { useState } from 'react';
import {
  Layers,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Settings2,
} from 'lucide-react';
import {
  useWorkspaces,
  useActiveWorkspace,
  useWorkspaceActions,
  usePanels,
  useLayout,
} from '../hooks/use-workspace';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getVisiblePanelIds } from '../lib/layout';

export function TitleBar({ onSettingsOpen }: { onSettingsOpen?: () => void }) {
  const workspaces = useWorkspaces();
  const activeWorkspace = useActiveWorkspace();
  const panels = usePanels();
  const layout = useLayout();
  const {
    createWorkspace,
    switchWorkspace,
    renameWorkspace,
    deleteWorkspace,
  } = useWorkspaceActions();

  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleMenuOpenChange = (open: boolean) => {
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
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingWorkspaceId(id);
    setEditName(currentName);
  };

  const handleFinishRename = () => {
    if (editingWorkspaceId && editName.trim()) {
      renameWorkspace(editingWorkspaceId, editName.trim());
    }
    setEditingWorkspaceId(null);
    setEditName('');
  };

  const isMac = window.electronAPI.platform === 'darwin';

  return (
    <div
      className="flex items-center h-9 bg-card border-b border-border select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Spacer for macOS traffic lights (left side) */}
      {isMac && <div className="w-[70px] shrink-0" />}

      <span className="px-3 text-xs font-medium text-muted-foreground tracking-wide">
        Commiq Editor
      </span>

      {/* Workspace switcher */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {editingWorkspaceId ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRename();
              if (e.key === 'Escape') {
                setEditingWorkspaceId(null);
                setEditName('');
              }
            }}
            className="h-5 w-28 px-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <DropdownMenu onOpenChange={handleMenuOpenChange}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                />
              }
            >
              <Layers className="size-3" />
              <span className="max-w-32 truncate">
                {activeWorkspace?.name ?? 'Workspace'}
              </span>
              <ChevronDown className="size-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  className={cn(
                    'flex items-center justify-between',
                    ws.id === activeWorkspace?.id && 'bg-accent',
                  )}
                  onClick={() => switchWorkspace(ws.id)}
                >
                  <span className="truncate">{ws.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {ws.tabs.length} tab{ws.tabs.length !== 1 ? 's' : ''}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  createWorkspace(`Workspace ${workspaces.length + 1}`)
                }
              >
                <Plus className="size-3.5" />
                New Workspace
              </DropdownMenuItem>
              {activeWorkspace && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      handleStartRename(
                        activeWorkspace.id,
                        activeWorkspace.name,
                      )
                    }
                  >
                    <Pencil className="size-3.5" />
                    Rename Workspace
                  </DropdownMenuItem>
                  {workspaces.length > 1 && (
                    <DropdownMenuItem
                      onClick={() => deleteWorkspace(activeWorkspace.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete Workspace
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Settings button — right-aligned before traffic light spacer */}
      <div className="ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button variant="ghost" size="icon-xs" onClick={onSettingsOpen}>
          <Settings2 className="size-3.5" />
        </Button>
      </div>

      {/* Spacer for Windows/Linux title bar overlay controls (right side) */}
      {!isMac && <div className="w-[138px] shrink-0" />}
    </div>
  );
}
