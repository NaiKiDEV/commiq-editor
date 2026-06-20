import { useCallback, useEffect, useState } from "react";
import { ChevronsUpDown, Plus, Radio, Settings, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { useBoardsContext } from "./BoardsContext";
import { ProjectSettingsModal } from "./ProjectSettingsModal";
import { useSettings } from "../../contexts/settings";
import { cn } from "@/lib/utils";

function McpToggle() {
  const { settings } = useSettings();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    window.electronAPI.boards
      .getMcpStatus()
      .then((s) => setRunning(s.running))
      .catch(() => {});
  }, []);

  const toggle = useCallback(async () => {
    if (running) {
      await window.electronAPI.boards.stopMcpServer();
      setRunning(false);
    } else {
      const port = settings.boards?.mcpPort ?? 3300;
      const result = await window.electronAPI.boards.startMcpServer(port);
      if (result.success) setRunning(true);
    }
  }, [running, settings]);

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors",
        running
          ? "text-green-500 border-green-500/40 bg-green-500/10"
          : "text-muted-foreground border-border hover:text-foreground hover:bg-muted/50",
      )}
      title={running ? "Stop MCP server" : "Start MCP server"}
    >
      <Radio className="size-3.5" />
      {running ? "MCP" : "MCP Off"}
    </button>
  );
}

export function ProjectHeader() {
  const {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    dispatch,
  } = useBoardsContext();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const createProject = async () => {
    const name = newName.trim();
    if (!name) return;
    await dispatch({ type: "CREATE_PROJECT", name });
    setNewName("");
    setPickerOpen(false);
  };

  const deleteProject = async (projectId: string) => {
    await dispatch({ type: "DELETE_PROJECT", projectId });
  };

  return (
    <>
      <header className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Project
        </span>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 min-w-[12rem] justify-between"
              />
            }
          >
            {activeProject ? (
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block size-2 rounded-sm shrink-0"
                  style={{ backgroundColor: activeProject.color }}
                />
                <span className="truncate">{activeProject.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {projects.length === 0
                  ? "No projects"
                  : "Select a project"}
              </span>
            )}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="w-72 p-2 flex flex-col gap-1"
          >
            {projects.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground/70">
                No projects yet. Create one below.
              </p>
            ) : (
              <ul className="flex flex-col">
                {projects.map((p) => {
                  const active = p.id === activeProjectId;
                  return (
                    <li key={p.id} className="group">
                      <div
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${
                          active
                            ? "bg-muted text-foreground"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveProjectId(p.id);
                            setPickerOpen(false);
                          }}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          <span
                            className="inline-block size-2 rounded-sm shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="truncate">{p.name}</span>
                        </button>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 rounded-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteProject(p.id);
                          }}
                          title="Delete project"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="h-px bg-border -mx-2 my-1" />

            <div className="flex flex-col gap-1.5 px-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                New project
              </span>
              <div className="flex gap-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createProject();
                  }}
                  placeholder="Project name"
                  className="h-7 text-xs"
                  autoFocus
                />
                <Button
                  variant="default"
                  size="icon-xs"
                  onClick={() => void createProject()}
                  disabled={!newName.trim()}
                  title="Create project"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {activeProject && (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSettingsOpen(true)}
              title="Project settings"
            >
              <Settings className="size-3.5 text-muted-foreground" />
            </Button>
            {activeProject.description && (
              <span className="text-xs text-muted-foreground truncate hidden md:inline">
                {activeProject.description}
              </span>
            )}
          </>
        )}

        <div className="ml-auto">
          <McpToggle />
        </div>
      </header>

      {activeProject && (
        <ProjectSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          project={activeProject}
        />
      )}
    </>
  );
}
