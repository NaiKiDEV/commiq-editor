import { useEffect, useState, useRef, useCallback } from "react";
import { Plus, Trash2, Play, Zap, Check, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
  useWorkspaceActions,
  useActiveWorkspaceId,
} from "../hooks/use-workspace";

type WorkflowCommand = {
  id: string;
  name: string;
  command: string;
};

type Workflow = {
  id: string;
  name: string;
  scope: "workspace" | "global";
  commands: WorkflowCommand[];
};

type SaveState = "saved" | "saving" | "idle";

type WorkflowPanelProps = {
  panelId: string;
};

export function WorkflowPanel({ panelId: _panelId }: WorkflowPanelProps) {
  const workspaceId = useActiveWorkspaceId();
  const { createTab } = useWorkspaceActions();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeWorkflow =
    workflows.find((w) => w.id === activeWorkflowId) ?? null;

  const globalWorkflows = workflows.filter((w) => w.scope === "global");
  const workspaceWorkflows = workflows.filter((w) => w.scope === "workspace");

  // Load workflows on mount / when workspaceId changes
  useEffect(() => {
    if (!workspaceId) return;
    window.electronAPI.workflow.list(workspaceId).then((list) => {
      setWorkflows(list);
      if (list.length > 0) setActiveWorkflowId(list[0].id);
      setLoaded(true);
    });
  }, [workspaceId]);

  const scheduleSave = useCallback(
    (workflow: Workflow) => {
      if (!workspaceId) return;
      setSaveState("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await window.electronAPI.workflow.save(workflow, workspaceId);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      }, 400);
    },
    [workspaceId],
  );

  const createWorkflow = useCallback(async () => {
    if (!workspaceId) return;
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      name: "New Workflow",
      scope: "workspace",
      commands: [],
    };
    await window.electronAPI.workflow.save(workflow, workspaceId);
    setWorkflows((prev) => [workflow, ...prev]);
    setActiveWorkflowId(workflow.id);
  }, [workspaceId]);

  const deleteWorkflow = useCallback(
    async (id: string) => {
      if (!workspaceId) return;
      const target = workflows.find((w) => w.id === id);
      if (!target) return;
      await window.electronAPI.workflow.delete(id, target.scope, workspaceId);
      setWorkflows((prev) => {
        const next = prev.filter((w) => w.id !== id);
        if (id === activeWorkflowId) {
          setActiveWorkflowId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [workflows, activeWorkflowId, workspaceId],
  );

  const updateWorkflow = useCallback(
    (id: string, data: Partial<Omit<Workflow, "id">>) => {
      setWorkflows((prev) => {
        const updated = prev.map((w) => (w.id === id ? { ...w, ...data } : w));
        const target = updated.find((w) => w.id === id);
        if (target) scheduleSave(target);
        return updated;
      });
    },
    [scheduleSave],
  );

  const changeScope = useCallback(
    async (id: string, newScope: "workspace" | "global") => {
      if (!workspaceId) return;
      const target = workflows.find((w) => w.id === id);
      if (!target || target.scope === newScope) return;

      // Delete from old scope, save to new scope
      await window.electronAPI.workflow.delete(id, target.scope, workspaceId);
      const updated = { ...target, scope: newScope };
      await window.electronAPI.workflow.save(updated, workspaceId);

      setWorkflows((prev) => prev.map((w) => (w.id === id ? updated : w)));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    },
    [workflows, workspaceId],
  );

  const addCommand = useCallback(
    (workflowId: string) => {
      const newCmd: WorkflowCommand = {
        id: crypto.randomUUID(),
        name: "",
        command: "",
      };
      setWorkflows((prev) => {
        const updated = prev.map((w) =>
          w.id === workflowId ? { ...w, commands: [...w.commands, newCmd] } : w,
        );
        const target = updated.find((w) => w.id === workflowId);
        if (target) scheduleSave(target);
        return updated;
      });
    },
    [scheduleSave],
  );

  const updateCommand = useCallback(
    (workflowId: string, cmdId: string, data: Partial<WorkflowCommand>) => {
      setWorkflows((prev) => {
        const updated = prev.map((w) =>
          w.id === workflowId
            ? {
                ...w,
                commands: w.commands.map((c) =>
                  c.id === cmdId ? { ...c, ...data } : c,
                ),
              }
            : w,
        );
        const target = updated.find((w) => w.id === workflowId);
        if (target) scheduleSave(target);
        return updated;
      });
    },
    [scheduleSave],
  );

  const removeCommand = useCallback(
    (workflowId: string, cmdId: string) => {
      setWorkflows((prev) => {
        const updated = prev.map((w) =>
          w.id === workflowId
            ? { ...w, commands: w.commands.filter((c) => c.id !== cmdId) }
            : w,
        );
        const target = updated.find((w) => w.id === workflowId);
        if (target) scheduleSave(target);
        return updated;
      });
    },
    [scheduleSave],
  );

  const runWorkflow = useCallback(() => {
    if (!activeWorkflow) return;
    for (const cmd of activeWorkflow.commands) {
      if (!cmd.command.trim()) continue;
      const tabName = cmd.name.trim() || activeWorkflow.name;
      const panelId = createTab("terminal", tabName);
      // Wait for the shell to emit its first data (prompt) before sending the command
      const removeListener = window.electronAPI.terminal.onData(panelId, () => {
        removeListener();
        window.electronAPI.terminal.write(panelId, cmd.command + "\r");
      });
    }
  }, [activeWorkflow, createTab]);

  if (!workspaceId) return null;
  if (!loaded) return null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-52 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Workflows
          </span>
          <Button variant="ghost" size="icon-xs" onClick={createWorkflow}>
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {workflows.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">No workflows yet</p>
            </div>
          )}

          {/* Global group */}
          {globalWorkflows.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                  Global
                </span>
              </div>
              {globalWorkflows.map((workflow) => (
                <WorkflowListItem
                  key={workflow.id}
                  workflow={workflow}
                  isActive={workflow.id === activeWorkflowId}
                  onClick={() => setActiveWorkflowId(workflow.id)}
                />
              ))}
            </>
          )}

          {/* Workspace group */}
          {workspaceWorkflows.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                  Workspace
                </span>
              </div>
              {workspaceWorkflows.map((workflow) => (
                <WorkflowListItem
                  key={workflow.id}
                  workflow={workflow}
                  isActive={workflow.id === activeWorkflowId}
                  onClick={() => setActiveWorkflowId(workflow.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeWorkflow ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
              <input
                type="text"
                value={activeWorkflow.name}
                onChange={(e) =>
                  updateWorkflow(activeWorkflow.id, { name: e.target.value })
                }
                placeholder="Workflow name..."
                className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center gap-1.5">
                {saveState === "saving" && (
                  <Loader2 className="size-3 text-muted-foreground/50 animate-spin" />
                )}
                {saveState === "saved" && (
                  <Check className="size-3 text-muted-foreground/50" />
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={runWorkflow}
                  className="text-muted-foreground hover:text-foreground"
                  title="Run workflow"
                >
                  <Play className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => deleteWorkflow(activeWorkflow.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Delete workflow"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Scope toggle */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">Scope:</span>
              <div className="flex items-center rounded-md border border-border overflow-hidden">
                <button
                  className={cn(
                    "px-2.5 py-1 text-xs transition-colors",
                    activeWorkflow.scope === "global"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  onClick={() => changeScope(activeWorkflow.id, "global")}
                >
                  Global
                </button>
                <button
                  className={cn(
                    "px-2.5 py-1 text-xs transition-colors border-l border-border",
                    activeWorkflow.scope === "workspace"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  onClick={() => changeScope(activeWorkflow.id, "workspace")}
                >
                  Workspace
                </button>
              </div>
            </div>

            {/* Command list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {activeWorkflow.commands.length === 0 && (
                <p className="text-xs text-muted-foreground/50 py-2">
                  No commands yet. Add one below.
                </p>
              )}
              {activeWorkflow.commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2"
                >
                  <div className="grow flex flex-col gap-2">
                    <input
                      type="text"
                      value={cmd.name}
                      onChange={(e) =>
                        updateCommand(activeWorkflow.id, cmd.id, {
                          name: e.target.value,
                        })
                      }
                      placeholder="Label (optional)"
                      className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
                    />
                    <span className="flex flex-row">
                      <span className="pr-2 text-xs font-mono">{">"}</span>
                      <input
                        type="text"
                        value={cmd.command}
                        onChange={(e) =>
                          updateCommand(activeWorkflow.id, cmd.id, {
                            command: e.target.value,
                          })
                        }
                        placeholder="e.g., npm run dev"
                        className="w-full bg-transparent text-xs font-mono text-muted-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeCommand(activeWorkflow.id, cmd.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => addCommand(activeWorkflow.id)}
                className="w-full text-muted-foreground hover:text-foreground text-xs mt-1"
              >
                <Plus className="size-3.5" />
                Add Command
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <Zap className="size-8 mx-auto opacity-40" />
              <p className="text-sm">Create a workflow to get started</p>
              <Button variant="outline" size="sm" onClick={createWorkflow}>
                <Plus className="size-3.5" />
                New Workflow
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type WorkflowListItemProps = {
  workflow: Workflow;
  isActive: boolean;
  onClick: () => void;
};

function WorkflowListItem({
  workflow,
  isActive,
  onClick,
}: WorkflowListItemProps) {
  return (
    <button
      className={cn(
        "w-full flex items-start gap-2 px-3 py-2 text-left transition-colors",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <Zap className="size-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">
          {workflow.name || "Untitled"}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {workflow.commands.length} command
          {workflow.commands.length !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}
