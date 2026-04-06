import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import {
  Plus, Trash2, Play, Zap, Check, Loader2, Terminal, Globe,
  GripVertical, Circle, CheckCircle2, XCircle, Square, RotateCcw, Download, Upload,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
  useWorkspaceActions,
  useActiveWorkspaceId,
} from "../hooks/use-workspace";
import { useBrowserActions } from "../hooks/use-browser";

type WorkflowCommand = {
  id: string;
  name: string;
  command: string;
  type: "terminal" | "browser";
  signal?: string;
};

type Workflow = {
  id: string;
  name: string;
  scope: "workspace" | "global";
  mode: "parallel" | "sequential";
  commands: WorkflowCommand[];
};

type SaveState = "saved" | "saving" | "idle";

type StepStatus = "pending" | "running" | "done" | "cancelled";

type SequentialRunState = {
  workflowId: string;
  currentStepIndex: number;
  stepStatuses: StepStatus[];
};

type WorkflowPanelProps = {
  panelId: string;
};

/**
 * Delay before navigating a newly-created browser tab.
 * The browser panel needs a tick to register its IPC listener after the tab mounts.
 * There is currently no ready-state event from the browser panel, so we use a
 * short delay as a practical workaround.
 */
const BROWSER_TAB_READY_DELAY_MS = 100;

export function WorkflowPanel({ panelId: _panelId }: WorkflowPanelProps) {
  const workspaceId = useActiveWorkspaceId();
  const { createTab } = useWorkspaceActions();
  const { navigate: navigateBrowser } = useBrowserActions();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [runState, setRunState] = useState<SequentialRunState | null>(null);
  const signalListenersRef = useRef<Map<string, () => void>>(new Map());
  const [dragState, setDragState] = useState<{
    cmdIndex: number;
    startY: number;
    currentY: number;
  } | null>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Mutable ref — synced every render so stable callbacks always read current values
  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;
  const stateRef = useRef<{ activeWorkflow: Workflow | null }>({ activeWorkflow: null });

  const activeWorkflow = useMemo(
    () => workflows.find((w) => w.id === activeWorkflowId) ?? null,
    [workflows, activeWorkflowId],
  );
  stateRef.current = { activeWorkflow };

  const { filteredGlobalWorkflows, filteredWorkspaceWorkflows } = useMemo(() => {
    const lower = searchQuery.toLowerCase();
    const filtered = searchQuery
      ? workflows.filter((w) => w.name.toLowerCase().includes(lower))
      : workflows;
    return {
      filteredGlobalWorkflows: filtered.filter((w) => w.scope === "global"),
      filteredWorkspaceWorkflows: filtered.filter((w) => w.scope === "workspace"),
    };
  }, [workflows, searchQuery]);

  useEffect(() => {
    if (!workspaceId) return;
    window.electronAPI.workflow.list(workspaceId)
      .then((list) => {
        const migrated = list.map((w: Workflow & { mode?: string; commands?: Array<WorkflowCommand & { type?: string }> }) => ({
          ...w,
          mode: (w.mode as Workflow['mode']) || "parallel",
          commands: (w.commands || []).map((c) => ({
            ...c,
            type: (c.type as WorkflowCommand['type']) || "terminal",
          })),
        }));
        setWorkflows(migrated);
        if (migrated.length > 0) setActiveWorkflowId(migrated[0].id);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
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
      mode: "parallel",
      commands: [],
    };
    await window.electronAPI.workflow.save(workflow, workspaceId);
    setWorkflows((prev) => [workflow, ...prev]);
    setActiveWorkflowId(workflow.id);
  }, [workspaceId]);

  const deleteWorkflow = useCallback(
    async (id: string) => {
      if (!workspaceId) return;
      const target = workflowsRef.current.find((w) => w.id === id);
      if (!target) return;
      await window.electronAPI.workflow.delete(id, target.scope, workspaceId);
      setWorkflows((prev) => {
        const next = prev.filter((w) => w.id !== id);
        setActiveWorkflowId((activeId) => activeId === id ? (next[0]?.id ?? null) : activeId);
        return next;
      });
    },
    [workspaceId],
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
      const target = workflowsRef.current.find((w) => w.id === id);
      if (!target || target.scope === newScope) return;

      await window.electronAPI.workflow.delete(id, target.scope, workspaceId);
      const updated = { ...target, scope: newScope };
      await window.electronAPI.workflow.save(updated, workspaceId);

      setWorkflows((prev) => prev.map((w) => (w.id === id ? updated : w)));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    },
    [workspaceId],
  );

  const addCommand = useCallback(
    (workflowId: string) => {
      const newCmd: WorkflowCommand = {
        id: crypto.randomUUID(),
        name: "",
        command: "",
        type: "terminal",
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

  const reorderCommand = useCallback(
    (workflowId: string, fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      setWorkflows((prev) => {
        const updated = prev.map((w) => {
          if (w.id !== workflowId) return w;
          const newCommands = [...w.commands];
          const [moved] = newCommands.splice(fromIndex, 1);
          newCommands.splice(toIndex, 0, moved);
          return { ...w, commands: newCommands };
        });
        const target = updated.find((w) => w.id === workflowId);
        if (target) scheduleSave(target);
        return updated;
      });
    },
    [scheduleSave],
  );

  const handleDragStart = useCallback((index: number, startY: number) => {
    let currentY = startY;

    const handleMouseMove = (e: MouseEvent) => {
      currentY = e.clientY;
      setDragState({ cmdIndex: index, startY, currentY });
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const { activeWorkflow } = stateRef.current;
      if (activeWorkflow && commandListRef.current) {
        const cards = commandListRef.current.querySelectorAll<HTMLDivElement>("[data-cmd-card]");
        const centers: number[] = [];
        cards.forEach((card) => {
          const rect = card.getBoundingClientRect();
          centers.push(rect.top + rect.height / 2);
        });

        let toIndex = 0;
        const dragY = currentY;
        for (let i = 0; i < centers.length; i++) {
          if (dragY > centers[i]) toIndex = i + 1;
        }
        if (toIndex > index) toIndex--;
        if (toIndex !== index) {
          reorderCommand(activeWorkflow.id, index, toIndex);
        }
      }

      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [reorderCommand]);

  const executeStep = useCallback(
    (workflow: Workflow, stepIndex: number) => {
      const cmd = workflow.commands[stepIndex];
      if (!cmd || !cmd.command.trim()) {
        setRunState((prev) => {
          if (!prev) return prev;
          const newStatuses = [...prev.stepStatuses];
          newStatuses[stepIndex] = "done";
          return { ...prev, currentStepIndex: stepIndex + 1, stepStatuses: newStatuses };
        });
        return;
      }

      if (cmd.type === "browser") {
        const tabName = cmd.name.trim() || cmd.command;
        const panelId = createTab("browser", tabName, { background: true });
        setTimeout(() => navigateBrowser(panelId, cmd.command.trim()), BROWSER_TAB_READY_DELAY_MS);

        setRunState((prev) => {
          if (!prev) return prev;
          const newStatuses = [...prev.stepStatuses];
          newStatuses[stepIndex] = "done";
          const nextIndex = stepIndex + 1;
          if (nextIndex < newStatuses.length) {
            newStatuses[nextIndex] = "running";
          }
          return { ...prev, currentStepIndex: nextIndex, stepStatuses: newStatuses };
        });

        const nextIndex = stepIndex + 1;
        if (nextIndex < workflow.commands.length) {
          setTimeout(() => executeStep(workflow, nextIndex), 50);
        }
      } else {
        const tabName = cmd.name.trim() || workflow.name;
        const panelId = createTab("terminal", tabName, { background: true });
        const removeListener = window.electronAPI.terminal.onData(panelId, () => {
          removeListener();
          window.electronAPI.terminal.write(panelId, cmd.command + "\r");

          if (cmd.signal) {
            const signalListener = window.electronAPI.terminal.onData(panelId, (data: string) => {
              if (data.includes(cmd.signal!)) {
                signalListener();
                signalListenersRef.current.delete(panelId);
                advanceStep(workflow);
              }
            });
            signalListenersRef.current.set(panelId, signalListener);
          }
        });
      }
    },
    [createTab, navigateBrowser],
  );

  const advanceStep = useCallback(
    (workflow: Workflow) => {
      setRunState((prev) => {
        if (!prev) return prev;
        const newStatuses = [...prev.stepStatuses];
        newStatuses[prev.currentStepIndex] = "done";
        const nextIndex = prev.currentStepIndex + 1;
        if (nextIndex < newStatuses.length) {
          newStatuses[nextIndex] = "running";
        }
        return { ...prev, currentStepIndex: nextIndex, stepStatuses: newStatuses };
      });
    },
    [],
  );

  useEffect(() => {
    if (!runState || !activeWorkflow) return;
    if (runState.currentStepIndex >= activeWorkflow.commands.length) return;
    if (runState.stepStatuses[runState.currentStepIndex] === "running") {
      executeStep(activeWorkflow, runState.currentStepIndex);
    }
  }, [runState?.currentStepIndex, runState?.stepStatuses, activeWorkflow, executeStep]);

  const startSequentialRun = useCallback(
    (workflow: Workflow) => {
      if (workflow.commands.length === 0) return;
      const statuses: StepStatus[] = workflow.commands.map((_, i) =>
        i === 0 ? "running" : "pending"
      );
      setRunState({
        workflowId: workflow.id,
        currentStepIndex: 0,
        stepStatuses: statuses,
      });
    },
    [],
  );

  const cancelRun = useCallback(() => {
    for (const cleanup of signalListenersRef.current.values()) {
      cleanup();
    }
    signalListenersRef.current.clear();

    setRunState((prev) => {
      if (!prev) return null;
      const newStatuses = prev.stepStatuses.map((s) =>
        s === "pending" || s === "running" ? "cancelled" : s
      );
      return { ...prev, stepStatuses: newStatuses as StepStatus[] };
    });

    setTimeout(() => setRunState(null), 1500);
  }, []);

  const restartRun = useCallback(() => {
    for (const cleanup of signalListenersRef.current.values()) {
      cleanup();
    }
    signalListenersRef.current.clear();
    setRunState(null);

    const { activeWorkflow } = stateRef.current;
    if (activeWorkflow) {
      setTimeout(() => startSequentialRun(activeWorkflow), 50);
    }
  }, [startSequentialRun]);

  const runWorkflow = useCallback(
    (workflowToRun?: Workflow) => {
      const workflow = workflowToRun || stateRef.current.activeWorkflow;
      if (!workflow) return;

      if (workflow.mode !== "sequential") {
        for (const cmd of workflow.commands) {
          if (!cmd.command.trim()) continue;
          if (cmd.type === "browser") {
            const tabName = cmd.name.trim() || cmd.command;
            const panelId = createTab("browser", tabName, { background: true });
            setTimeout(() => navigateBrowser(panelId, cmd.command.trim()), BROWSER_TAB_READY_DELAY_MS);
          } else {
            const tabName = cmd.name.trim() || workflow.name;
            const panelId = createTab("terminal", tabName, { background: true });
            const removeListener = window.electronAPI.terminal.onData(panelId, () => {
              removeListener();
              window.electronAPI.terminal.write(panelId, cmd.command + "\r");
            });
          }
        }
        return;
      }

      startSequentialRun(workflow);
    },
    [createTab, navigateBrowser, startSequentialRun],
  );

  const runSingleCommand = useCallback(
    (workflowName: string, command: WorkflowCommand) => {
      if (!command.command.trim()) return;
      if (command.type === "browser") {
        const tabName = command.name.trim() || command.command;
        const panelId = createTab("browser", tabName, { background: true });
        setTimeout(() => navigateBrowser(panelId, command.command.trim()), 100);
      } else {
        const tabName = command.name.trim() || `${workflowName} - Command`;
        const panelId = createTab("terminal", tabName, { background: true });
        const removeListener = window.electronAPI.terminal.onData(panelId, () => {
          removeListener();
          window.electronAPI.terminal.write(panelId, command.command + "\r");
        });
      }
    },
    [createTab, navigateBrowser],
  );

  // Stable advance — reads active workflow from ref so it never changes identity
  const advanceCurrentStep = useCallback(() => {
    const { activeWorkflow } = stateRef.current;
    if (activeWorkflow) advanceStep(activeWorkflow);
  }, [advanceStep]);

  const exportWorkflow = useCallback((workflow: Workflow) => {
    const exported = { ...workflow, scope: "global" as const };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importWorkflow = useCallback(async (file: File) => {
    if (!workspaceId) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Workflow & { mode?: string; commands?: Array<WorkflowCommand & { type?: string }> };
      const workflow: Workflow = {
        ...parsed,
        id: crypto.randomUUID(),
        scope: "global",
        mode: (parsed.mode as Workflow['mode']) || "parallel",
        commands: (parsed.commands || []).map((c) => ({
          ...c,
          id: crypto.randomUUID(),
          type: (c.type as WorkflowCommand['type']) || "terminal",
        })),
      };
      await window.electronAPI.workflow.save(workflow, workspaceId);
      setWorkflows((prev) => [...prev, workflow]);
      setActiveWorkflowId(workflow.id);
    } catch (err) {
      console.error('[WorkflowPanel] Import failed:', err);
    }
  }, [workspaceId]);

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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => importFileRef.current?.click()}
              title="Import workflow"
            >
              <Upload className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={createWorkflow} title="New workflow">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importWorkflow(file);
            e.target.value = "";
          }}
        />
        <div className="px-3 py-2 border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workflows..."
            className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {workflows.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">No workflows yet</p>
            </div>
          )}

          {/* Global group */}
          {filteredGlobalWorkflows.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                  Global
                </span>
              </div>
              {filteredGlobalWorkflows.map((workflow) => (
                <WorkflowListItem
                  key={workflow.id}
                  workflow={workflow}
                  isActive={workflow.id === activeWorkflowId}
                  onSelect={setActiveWorkflowId}
                  onPlay={runWorkflow}
                />
              ))}
            </>
          )}

          {/* Workspace group */}
          {filteredWorkspaceWorkflows.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                  Workspace
                </span>
              </div>
              {filteredWorkspaceWorkflows.map((workflow) => (
                <WorkflowListItem
                  key={workflow.id}
                  workflow={workflow}
                  isActive={workflow.id === activeWorkflowId}
                  onSelect={setActiveWorkflowId}
                  onPlay={runWorkflow}
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
                {runState && runState.workflowId === activeWorkflow.id ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={cancelRun}
                      className="text-muted-foreground hover:text-destructive"
                      title="Cancel run"
                    >
                      <Square className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={restartRun}
                      className="text-muted-foreground hover:text-foreground"
                      title="Restart run"
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => runWorkflow()}
                    className="text-muted-foreground hover:text-foreground"
                    title="Run workflow"
                  >
                    <Play className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => exportWorkflow(activeWorkflow)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Export workflow"
                >
                  <Download className="size-3.5" />
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

            {/* Scope & Mode toggles */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-border">
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Mode:</span>
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button
                    className={cn(
                      "px-2.5 py-1 text-xs transition-colors",
                      activeWorkflow.mode === "parallel"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    onClick={() => updateWorkflow(activeWorkflow.id, { mode: "parallel" })}
                  >
                    Parallel
                  </button>
                  <button
                    className={cn(
                      "px-2.5 py-1 text-xs transition-colors border-l border-border",
                      activeWorkflow.mode === "sequential"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    onClick={() => updateWorkflow(activeWorkflow.id, { mode: "sequential" })}
                  >
                    Sequential
                  </button>
                </div>
              </div>
            </div>

            {/* Command list / Progress view */}
            <div ref={commandListRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {runState && runState.workflowId === activeWorkflow.id ? (
                <>
                  {activeWorkflow.commands.map((cmd, i) => (
                    <SequentialStepCard
                      key={cmd.id}
                      cmd={cmd}
                      status={runState.stepStatuses[i] ?? "pending"}
                      isCurrentStep={runState.currentStepIndex === i}
                      onAdvance={advanceCurrentStep}
                    />
                  ))}
                  {runState.currentStepIndex >= activeWorkflow.commands.length && (
                    <div className="flex items-center gap-2 py-2">
                      <CheckCircle2 className="size-4 text-green-500" />
                      <span className="text-xs text-muted-foreground">Workflow complete</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startSequentialRun(activeWorkflow)}
                        className="text-xs ml-auto"
                      >
                        <RotateCcw className="size-3.5" />
                        Run Again
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {activeWorkflow.commands.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 py-2">
                      No commands yet. Add one below.
                    </p>
                  )}
                  {activeWorkflow.commands.map((cmd, i) => (
                    <div key={cmd.id} data-cmd-card>
                      <CommandCard
                        cmd={cmd}
                        index={i}
                        workflowMode={activeWorkflow.mode}
                        workflowId={activeWorkflow.id}
                        workflowName={activeWorkflow.name}
                        onUpdate={updateCommand}
                        onRemove={removeCommand}
                        onRun={runSingleCommand}
                        onDragStart={handleDragStart}
                        isDragging={dragState?.cmdIndex === i}
                        dragOffset={dragState?.cmdIndex === i ? dragState.currentY - dragState.startY : 0}
                      />
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
                </>
              )}
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

type CommandCardProps = {
  cmd: WorkflowCommand;
  index: number;
  workflowMode: "parallel" | "sequential";
  workflowId: string;
  workflowName: string;
  onUpdate: (workflowId: string, cmdId: string, data: Partial<WorkflowCommand>) => void;
  onRemove: (workflowId: string, cmdId: string) => void;
  onRun: (workflowName: string, cmd: WorkflowCommand) => void;
  onDragStart: (index: number, startY: number) => void;
  isDragging: boolean;
  dragOffset: number;
};

const CommandCard = memo(function CommandCard({ cmd, index, workflowMode, workflowId, workflowName, onUpdate, onRemove, onRun, onDragStart, isDragging, dragOffset }: CommandCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2 transition-colors hover:bg-muted/50",
        isDragging && "opacity-80 z-50 shadow-lg",
      )}
      style={isDragging ? { transform: `translateY(${dragOffset}px)`, position: "relative" as const } : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="shrink-0 mt-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          onDragStart(index, e.clientY);
        }}
      >
        <GripVertical className="size-3.5" />
      </div>
      <button
        className="shrink-0 mt-1 text-muted-foreground/60 hover:text-foreground transition-colors"
        onClick={() => onUpdate(workflowId, cmd.id, { type: cmd.type === "terminal" ? "browser" : "terminal" })}
        title={cmd.type === "terminal" ? "Terminal command (click to switch to browser)" : "Browser command (click to switch to terminal)"}
      >
        {cmd.type === "browser" ? (
          <Globe className="size-3.5" />
        ) : (
          <Terminal className="size-3.5" />
        )}
      </button>
      <div className="grow flex flex-col gap-2">
        <input
          type="text"
          value={cmd.name}
          onChange={(e) => onUpdate(workflowId, cmd.id, { name: e.target.value })}
          placeholder="Label (optional)"
          className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        <span className="flex flex-row">
          <span className="pr-2 text-xs font-mono">{">"}</span>
          <input
            type="text"
            value={cmd.command}
            onChange={(e) => onUpdate(workflowId, cmd.id, { command: e.target.value })}
            placeholder={cmd.type === "browser" ? "e.g., https://localhost:3000" : "e.g., npm run dev"}
            className="w-full bg-transparent text-xs font-mono text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </span>
        {workflowMode === "sequential" && cmd.type === "terminal" && (
          <input
            type="text"
            value={cmd.signal ?? ""}
            onChange={(e) => onUpdate(workflowId, cmd.id, { signal: e.target.value || undefined })}
            placeholder="Auto-advance signal (optional)"
            className="w-full bg-transparent text-xs font-mono text-muted-foreground/60 outline-none placeholder:text-muted-foreground/30"
          />
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isHovered && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onRun(workflowName, cmd)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Run command"
          >
            <Play className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onRemove(workflowId, cmd.id)}
          className="text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
});

type SequentialStepCardProps = {
  cmd: WorkflowCommand;
  status: StepStatus;
  isCurrentStep: boolean;
  onAdvance: () => void;
};

const SequentialStepCard = memo(function SequentialStepCard({ cmd, status, isCurrentStep, onAdvance }: SequentialStepCardProps) {
  const statusIcon = {
    pending: <Circle className="size-3.5 text-muted-foreground/30" />,
    running: <Loader2 className="size-3.5 text-blue-500 animate-spin" />,
    done: <CheckCircle2 className="size-3.5 text-green-500" />,
    cancelled: <XCircle className="size-3.5 text-destructive" />,
  }[status];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-border p-2",
        status === "running" ? "bg-blue-500/5 border-blue-500/20" : "bg-muted/30",
      )}
    >
      <div className="shrink-0 mt-1">{statusIcon}</div>
      <div className="shrink-0 mt-1 text-muted-foreground/60">
        {cmd.type === "browser" ? (
          <Globe className="size-3.5" />
        ) : (
          <Terminal className="size-3.5" />
        )}
      </div>
      <div className="grow flex flex-col gap-1">
        {cmd.name && (
          <span className="text-xs text-foreground">{cmd.name}</span>
        )}
        <span className="text-xs font-mono text-muted-foreground">{cmd.command}</span>
        {isCurrentStep && status === "running" && cmd.type === "terminal" && !cmd.signal && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAdvance}
            className="mt-1 w-fit text-xs"
          >
            Next
          </Button>
        )}
        {isCurrentStep && status === "running" && cmd.type === "terminal" && cmd.signal && (
          <span className="text-[10px] text-muted-foreground/50 mt-1">
            Waiting for: &quot;{cmd.signal}&quot;
          </span>
        )}
      </div>
    </div>
  );
});

type WorkflowListItemProps = {
  workflow: Workflow;
  isActive: boolean;
  onSelect: (id: string) => void;
  onPlay: (workflow: Workflow) => void;
};

const WorkflowListItem = memo(function WorkflowListItem({
  workflow,
  isActive,
  onSelect,
  onPlay,
}: WorkflowListItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "w-full flex items-start gap-2 px-3 py-2 text-left transition-colors cursor-pointer",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
      onClick={() => onSelect(workflow.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(workflow.id); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Zap className="size-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate">
          {workflow.name || "Untitled"}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {workflow.commands.length} command
          {workflow.commands.length !== 1 ? "s" : ""}
        </p>
      </div>
      {isHovered && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(workflow);
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Run workflow"
        >
          <Play className="size-3.5" />
        </Button>
      )}
    </div>
  );
});
