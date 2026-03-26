import {
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  TerminalSquare,
  Globe,
  Globe2,
  NotepadText,
  Zap,
  X,
  Columns2,
  Rows2,
  Layers,
  Plus,
  Timer,
  Network,
  Cpu,
  KeyRound,
  LayoutDashboard,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";
import {
  usePanels,
  useTabs,
  useLayout,
  useWorkspaces,
  useActiveWorkspace,
  useWorkspaceActions,
} from "../hooks/use-workspace";
import { getVisiblePanelIds } from "../lib/layout";

export type CommandPaletteHandle = {
  openWithSearch: (search: string) => void;
};

function PanelIcon({ type }: { type: string }) {
  if (type === "terminal") return <TerminalSquare />;
  if (type === "browser") return <Globe />;
  if (type === "workflow") return <Zap />;
  if (type === "timer") return <Timer />;
  if (type === "ports") return <Network />;
  if (type === "process") return <Cpu />;
  if (type === "env") return <KeyRound />;
  if (type === "http") return <Globe2 />;
  if (type === "whiteboard") return <LayoutDashboard />;
  return <NotepadText />;
}

export const CommandPalette = forwardRef<CommandPaletteHandle>(
  function CommandPalette(_props, ref) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
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
        if (panel.type === "browser" && visibleIds.has(panel.id)) {
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
          setSearch("");
          restoreVisibleBrowsers();
        }
        return next;
      });
    }, [restoreVisibleBrowsers]);

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          togglePalette();
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [togglePalette]);

    useEffect(() => {
      return window.electronAPI.onShortcut((action) => {
        if (action === "toggle-command-palette") {
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
          setSearch("");
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
        <CommandInput
          placeholder="Type a command or search..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* New tab */}
          <CommandGroup heading="New Tab">
            <CommandItem
              onSelect={() =>
                runAction(() => createTab("terminal", "Terminal"))
              }
            >
              <TerminalSquare />
              <span>New Terminal Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runAction(() => createTab("browser", "Browser"))}
            >
              <Globe />
              <span>New Browser Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runAction(() => createTab("notes", "Notes"))}
            >
              <NotepadText />
              <span>New Notes Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runAction(() => createTab("workflow", "Workflows"))
              }
            >
              <Zap />
              <span>New Workflow Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runAction(() => createTab("timer", "Timers"))}
            >
              <Timer />
              <span>New Timer Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runAction(() => createTab("ports", "Port Monitor"))
              }
            >
              <Network />
              <span>New Port Monitor Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runAction(() => createTab("process", "Process Monitor"))
              }
            >
              <Cpu />
              <span>New Process Monitor Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runAction(() => createTab("env", "Environment"))}
            >
              <KeyRound />
              <span>New Environment Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runAction(() => createTab("http", "HTTP Client"))}
            >
              <Globe2 />
              <span>New HTTP Client Tab</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runAction(() => createTab("whiteboard", "Whiteboard"))
              }
            >
              <LayoutDashboard />
              <span>New Whiteboard Tab</span>
            </CommandItem>
          </CommandGroup>

          {/* Split */}
          {panels.length > 0 && (
            <CommandGroup heading="Split">
              <CommandItem
                onSelect={() =>
                  runAction(() =>
                    splitPanel("horizontal", "terminal", "Terminal"),
                  )
                }
              >
                <Columns2 />
                <span>Split Right: Terminal</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() =>
                    splitPanel("vertical", "terminal", "Terminal"),
                  )
                }
              >
                <Rows2 />
                <span>Split Down: Terminal</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() =>
                    splitPanel("horizontal", "browser", "Browser"),
                  )
                }
              >
                <Columns2 />
                <span>Split Right: Browser</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => splitPanel("vertical", "browser", "Browser"))
                }
              >
                <Rows2 />
                <span>Split Down: Browser</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => splitPanel("horizontal", "notes", "Notes"))
                }
              >
                <Columns2 />
                <span>Split Right: Notes</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => splitPanel("vertical", "notes", "Notes"))
                }
              >
                <Rows2 />
                <span>Split Down: Notes</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() =>
                    splitPanel("horizontal", "workflow", "Workflows"),
                  )
                }
              >
                <Columns2 />
                <span>Split Right: Workflows</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() =>
                    splitPanel("vertical", "workflow", "Workflows"),
                  )
                }
              >
                <Rows2 />
                <span>Split Down: Workflows</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() =>
                    splitPanel("horizontal", "http", "HTTP Client"),
                  )
                }
              >
                <Columns2 />
                <span>Split Right: HTTP Client</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => splitPanel("vertical", "http", "HTTP Client"))
                }
              >
                <Rows2 />
                <span>Split Down: HTTP Client</span>
              </CommandItem>
            </CommandGroup>
          )}

          {/* Workspace */}
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

          {/* Switch tab */}
          {tabs.length > 1 && (
            <CommandGroup heading="Switch Tab">
              {tabs.map((tab) => (
                <CommandItem
                  key={`tab-${tab.id}`}
                  onSelect={() => runAction(() => activateTab(tab.id))}
                >
                  <PanelIcon type={tab.panels[0]?.type ?? ""} />
                  <span>{tab.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Focus pane */}
          {panels.length > 1 && (
            <CommandGroup heading="Focus Pane">
              {panels.map((panel) => (
                <CommandItem
                  key={`focus-${panel.id}`}
                  onSelect={() => runAction(() => activatePanel(panel.id))}
                >
                  <PanelIcon type={panel.type} />
                  <span>{panel.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Close */}
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
                    key={`close-pane-${panel.id}`}
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
  },
);
