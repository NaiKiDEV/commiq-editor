import { useState, useRef, useCallback, useEffect } from "react";
import {
  TerminalSquare,
  Globe,
  Globe2,
  NotepadText,
  Zap,
  X,
  Plus,
  Timer,
  Network,
  Cpu,
  KeyRound,
  LayoutDashboard,
  Regex,
  FileJson2,
  ShieldCheck,
  CalendarClock,
} from "lucide-react";
import {
  useTabs,
  useActiveTabId,
  usePanels,
  useLayout,
  useWorkspaceActions,
} from "../hooks/use-workspace";
import { useBrowserVisibility } from "../contexts/browser-visibility";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";
import { getVisiblePanelIds } from "../lib/layout";
import type { PanelType } from "../stores/workspace";
import { isRenamingTabRef } from "./Shell";

function TabIcon({ type }: { type: PanelType }) {
  switch (type) {
    case "terminal":
      return <TerminalSquare className="size-3" />;
    case "browser":
      return <Globe className="size-3" />;
    case "notes":
      return <NotepadText className="size-3" />;
    case "workflow":
      return <Zap className="size-3" />;
    case "timer":
      return <Timer className="size-3" />;
    case "ports":
      return <Network className="size-3" />;
    case "process":
      return <Cpu className="size-3" />;
    case "env":
      return <KeyRound className="size-3" />;
    case "http":
      return <Globe2 className="size-3" />;
    case "whiteboard":
      return <LayoutDashboard className="size-3" />;
    case "regex":
      return <Regex className="size-3" />;
    case "data":
      return <FileJson2 className="size-3" />;
    case "encoder":
      return <ShieldCheck className="size-3" />;
    case "cron":
      return <CalendarClock className="size-3" />;
    default:
      return <TerminalSquare className="size-3" />;
  }
}

export function TabBar() {
  const tabs = useTabs();
  const activeTabId = useActiveTabId();
  const panels = usePanels();
  const layout = useLayout();
  const {
    createTab,
    closeTab,
    activateTab,
    renameTab,
    closeOtherTabs,
    closeTabsToRight,
    reorderTab,
  } = useWorkspaceActions();

  const { pushOverlay, popOverlay } = useBrowserVisibility();

  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);

  const [dragState, setDragState] = useState<{
    tabId: string;
    startX: number;
    currentX: number;
    tabWidths: number[];
    tabOffsets: number[];
  } | null>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const startRename = (tabId: string, currentName: string) => {
    setRenamingTabId(tabId);
    setRenameValue(currentName);
    isRenamingTabRef.current = true;
  };

  const commitRename = () => {
    if (renamingTabId && renameValue.trim()) {
      renameTab(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
    isRenamingTabRef.current = false;
  };

  const cancelRename = () => {
    setRenamingTabId(null);
    isRenamingTabRef.current = false;
  };

  const openContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    pushOverlay();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    popOverlay();
  }, [popOverlay]);

  const runContextAction = (action: () => void) => {
    action();
    closeContextMenu();
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => closeContextMenu();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu, closeContextMenu]);

  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    if (e.button !== 0 || renamingTabId) return;

    const startX = e.clientX;
    const tabElements = tabStripRef.current?.children;
    if (!tabElements) return;

    const tabWidths: number[] = [];
    const tabOffsets: number[] = [];
    for (let i = 0; i < tabElements.length; i++) {
      const rect = (tabElements[i] as HTMLElement).getBoundingClientRect();
      tabWidths.push(rect.width);
      tabOffsets.push(rect.left);
    }

    let dragging = false;
    let currentX = startX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragging && Math.abs(moveEvent.clientX - startX) < 5) return;

      if (!dragging) {
        dragging = true;
        window.electronAPI.browser.hideAll();
      }

      currentX = moveEvent.clientX;

      setDragState({
        tabId,
        startX,
        currentX,
        tabWidths,
        tabOffsets,
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      if (dragging) {
        const currentTabs = tabsRef.current;
        const fromIdx = currentTabs.findIndex((t) => t.id === tabId);
        const deltaX = currentX - startX;
        const dragCenter =
          tabOffsets[fromIdx] + tabWidths[fromIdx] / 2 + deltaX;

        let toIdx = 0;
        for (let i = 0; i < tabOffsets.length; i++) {
          if (dragCenter > tabOffsets[i] + tabWidths[i] / 2) {
            toIdx = i + 1;
          }
        }
        if (toIdx > fromIdx) toIdx--;
        if (toIdx !== fromIdx) {
          reorderTab(tabId, toIdx);
        }

        const currentLayout = layoutRef.current;
        const currentPanels = panelsRef.current;
        const visibleIds = getVisiblePanelIds(currentLayout);
        for (const panel of currentPanels) {
          if (panel.type === "browser" && visibleIds.has(panel.id)) {
            window.electronAPI.browser.showSession(panel.id);
          }
        }
      }

      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="flex items-center h-8 bg-card/50 border-b border-border select-none shrink-0">
      {/* Tab strip */}
      <div
        ref={tabStripRef}
        className="flex items-center overflow-x-auto flex-1 min-w-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const primaryPanel = tab.panels[0];
          const panelType = primaryPanel?.type ?? "terminal";

          return (
            <button
              key={tab.id}
              className={cn(
                "group flex items-center gap-1.5 px-3 h-8 text-xs border-r border-border whitespace-nowrap transition-colors",
                tab.id === activeTabId
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              onClick={() => activateTab(tab.id)}
              onContextMenu={(e) => openContextMenu(e, tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              style={
                dragState?.tabId === tab.id
                  ? {
                      transform: `translateX(${dragState.currentX - dragState.startX}px)`,
                      zIndex: 50,
                      opacity: 0.8,
                      position: "relative" as const,
                    }
                  : undefined
              }
            >
              <TabIcon type={panelType} />
              {renamingTabId === tab.id ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") cancelRename();
                    e.stopPropagation();
                  }}
                  onFocus={(e) => e.target.select()}
                  autoFocus
                  className="w-24 h-4 px-1 text-xs bg-background border border-ring rounded-sm outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="max-w-32 truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(tab.id, tab.name);
                  }}
                >
                  {tab.name}
                </span>
              )}
              {tab.panels.length > 1 && (
                <span className="text-[10px] text-muted-foreground">
                  ({tab.panels.length})
                </span>
              )}
              <span
                className="ml-0.5 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <X className="size-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* New tab button */}
      <div className="flex items-center px-1 shrink-0">
        <DropdownMenu>
          <Tooltip>
            <DropdownMenuTrigger
              render={
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon-xs" />}
                />
              }
            >
              <Plus className="size-3.5" />
            </DropdownMenuTrigger>
            <TooltipContent side="bottom">New Tab</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => createTab("terminal", "Terminal")}>
              <TerminalSquare />
              Terminal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("browser", "Browser")}>
              <Globe />
              Browser
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("notes", "Notes")}>
              <NotepadText />
              Notes
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => createTab("workflow", "Workflows")}
            >
              <Zap />
              Workflows
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("timer", "Timers")}>
              <Timer />
              Timers
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => createTab("ports", "Port Monitor")}
            >
              <Network />
              Port Monitor
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => createTab("process", "Process Monitor")}
            >
              <Cpu />
              Process Monitor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("env", "Environment")}>
              <KeyRound />
              Environment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("http", "HTTP Client")}>
              <Globe2 />
              HTTP Client
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => createTab("whiteboard", "Whiteboard")}
            >
              <LayoutDashboard />
              Whiteboard
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => createTab("regex", "Regex Playground")}
            >
              <Regex />
              Regex Playground
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("data", "Data Viewer")}>
              <FileJson2 />
              Data Viewer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("encoder", "Encoder")}>
              <ShieldCheck />
              Encoder/Decoder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createTab("cron", "Cron")}>
              <CalendarClock />
              Cron Builder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-48 bg-popover border border-border rounded-md shadow-lg py-1 text-xs"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              if (tab) {
                closeContextMenu();
                startRename(tab.id, tab.name);
              }
            }}
          >
            Rename Tab
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={() => runContextAction(() => closeTab(contextMenu.tabId))}
          >
            Close Tab
          </button>
          {tabs.length > 1 && (
            <>
              <div className="h-px bg-border my-1" />
              <button
                className="w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() =>
                  runContextAction(() => closeOtherTabs(contextMenu.tabId))
                }
              >
                Close Other Tabs
              </button>
              {tabs.findIndex((t) => t.id === contextMenu.tabId) <
                tabs.length - 1 && (
                <button
                  className="w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() =>
                    runContextAction(() => closeTabsToRight(contextMenu.tabId))
                  }
                >
                  Close Tabs to the Right
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
