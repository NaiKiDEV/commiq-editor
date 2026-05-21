import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useBoardsContext } from "./BoardsContext";
import { CompleteSprintDialog } from "./CompleteSprintDialog";
import { SprintSummary } from "./SprintSummary";
import type { Sprint, SprintStatus } from "../../../shared/boards-types";

const todayIso = () => new Date().toISOString().slice(0, 10);
const inDaysIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

type StatusGroup = "active" | "planning" | "completed";

const GROUP_LABEL: Record<StatusGroup, string> = {
  active: "Active",
  planning: "Planning",
  completed: "Completed",
};

export function SprintsView() {
  const { sprints, tasks, activeProject, dispatch } = useBoardsContext();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<Sprint | null>(null);
  const [collapsed, setCollapsed] = useState<Set<StatusGroup>>(
    new Set(["completed"]),
  );

  if (!activeProject) return null;

  const grouped: Record<StatusGroup, Sprint[]> = {
    active: sprints.filter((s) => s.status === "active"),
    planning: sprints.filter((s) => s.status === "planning"),
    completed: sprints.filter((s) => s.status === "completed"),
  };

  const toggleGroup = (g: StatusGroup) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const taskCount = (sprintId: string) =>
    tasks.filter((t) => t.sprintId === sprintId).length;

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border sticky top-0 bg-background z-10">
          <span className="text-xs text-muted-foreground">
            {sprints.length} sprint{sprints.length !== 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreateForm((v) => !v)}
          >
            <Plus className="size-3.5 mr-1" />
            New Sprint
          </Button>
        </div>

        <div className="p-4 space-y-5">
          {/* Create form */}
          {showCreateForm && (
            <CreateSprintForm
              projectId={activeProject.id}
              dispatch={dispatch}
              onDone={() => setShowCreateForm(false)}
            />
          )}

          {/* Empty state */}
          {sprints.length === 0 && !showCreateForm && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <div className="text-center space-y-2">
                <p className="text-sm">No sprints yet.</p>
                <p className="text-xs">
                  Create a sprint to plan and track work in time-boxed iterations.
                </p>
              </div>
            </div>
          )}

          {/* Grouped sections */}
          {(["active", "planning", "completed"] as StatusGroup[]).map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            const isCollapsed = collapsed.has(group);

            return (
              <div key={group}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground py-1 mb-2"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                  {GROUP_LABEL[group]}
                  <span className="ml-0.5 font-normal normal-case text-muted-foreground/60">
                    ({items.length})
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-2">
                    {items.map((sprint) => (
                      <SprintCard
                        key={sprint.id}
                        sprint={sprint}
                        taskCount={taskCount(sprint.id)}
                        onStart={() =>
                          void dispatch({
                            type: "START_SPRINT",
                            sprintId: sprint.id,
                          })
                        }
                        onComplete={() => setCompleteTarget(sprint)}
                        onArchive={() =>
                          void dispatch({
                            type: "UPDATE_SPRINT",
                            sprintId: sprint.id,
                            patch: { status: "completed" },
                          })
                        }
                        onPatch={(patch) =>
                          void dispatch({
                            type: "UPDATE_SPRINT",
                            sprintId: sprint.id,
                            patch,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {completeTarget && (
        <CompleteSprintDialog
          open
          onClose={() => setCompleteTarget(null)}
          sprint={completeTarget}
        />
      )}
    </>
  );
}

// ─── SprintCard ───────────────────────────────────────────────────────────────

function SprintCard({
  sprint,
  taskCount,
  onStart,
  onComplete,
  onArchive,
  onPatch,
}: {
  sprint: Sprint;
  taskCount: number;
  onStart: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onPatch: (patch: Partial<Pick<Sprint, "name" | "goal" | "startDate" | "endDate" | "status">>) => void;
}) {
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [start, setStart] = useState(sprint.startDate.slice(0, 10));
  const [end, setEnd] = useState(sprint.endDate.slice(0, 10));

  useEffect(() => {
    setName(sprint.name);
    setGoal(sprint.goal ?? "");
    setStart(sprint.startDate.slice(0, 10));
    setEnd(sprint.endDate.slice(0, 10));
  }, [sprint.id, sprint.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEditable = sprint.status !== "completed";

  const statusBadge: Record<SprintStatus, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    planning: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    completed: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };

  const daysLeft = () => {
    if (sprint.status !== "active") return null;
    const diff = Math.ceil(
      (new Date(sprint.endDate).getTime() - Date.now()) / 86_400_000,
    );
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return "Ends today";
    return `${diff}d left`;
  };

  const daysLabel = daysLeft();

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
        {isEditable ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() &&
              name !== sprint.name &&
              onPatch({ name: name.trim() })
            }
            className="h-7 text-sm font-medium flex-1 border-transparent bg-transparent px-0 focus:border-border focus:bg-background focus:px-2"
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-foreground">
            {sprint.name}
          </span>
        )}
        <span
          className={`shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded-full border ${statusBadge[sprint.status]}`}
        >
          {sprint.status}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {taskCount} task{taskCount !== 1 ? "s" : ""}
        </span>
        {daysLabel && (
          <span
            className={`shrink-0 text-[10px] font-medium ${
              daysLabel.includes("overdue")
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {daysLabel}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2.5">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Start
            </span>
            <Input
              type="date"
              value={start}
              disabled={!isEditable}
              onChange={(e) => {
                setStart(e.target.value);
                onPatch({ startDate: e.target.value });
              }}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              End
            </span>
            <Input
              type="date"
              value={end}
              disabled={!isEditable}
              onChange={(e) => {
                setEnd(e.target.value);
                onPatch({ endDate: e.target.value });
              }}
              className="h-7 text-xs"
            />
          </div>
        </div>

        {/* Goal */}
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Goal
          </span>
          <Textarea
            value={goal}
            readOnly={!isEditable}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() =>
              goal !== (sprint.goal ?? "") && onPatch({ goal: goal || undefined })
            }
            rows={2}
            placeholder={isEditable ? "Sprint goal (optional)" : "—"}
            className={!isEditable ? "opacity-60 cursor-default" : ""}
          />
        </div>

        {/* Velocity summary for completed sprints */}
        {sprint.status === "completed" && sprint.velocity && (
          <SprintSummary velocity={sprint.velocity} />
        )}

        {/* Actions */}
        <div className="flex gap-1.5 pt-0.5">
          {sprint.status === "planning" && (
            <Button size="sm" onClick={onStart} className="gap-1.5">
              <Play className="size-3.5" />
              Start sprint
            </Button>
          )}
          {sprint.status === "active" && (
            <Button size="sm" onClick={onComplete} className="gap-1.5">
              <CheckCircle2 className="size-3.5" />
              Complete sprint
            </Button>
          )}
          {sprint.status !== "completed" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onArchive}
              className="text-destructive gap-1.5 ml-auto"
              title="Archive without completing"
            >
              <Trash2 className="size-3.5" />
              Archive
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CreateSprintForm ─────────────────────────────────────────────────────────

function CreateSprintForm({
  projectId,
  dispatch,
  onDone,
}: {
  projectId: string;
  dispatch: ReturnType<typeof useBoardsContext>["dispatch"];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(inDaysIso(14));

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || !startDate || !endDate) return;
    await dispatch({
      type: "CREATE_SPRINT",
      projectId,
      name: trimmed,
      goal: goal.trim() || undefined,
      startDate,
      endDate,
    });
    setName("");
    setGoal("");
    setStartDate(todayIso());
    setEndDate(inDaysIso(14));
    onDone();
  };

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg border border-border bg-card">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        New sprint
      </span>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
        placeholder="Sprint name (e.g. Sprint 24)"
        className="h-7 text-xs"
      />
      <Textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={2}
        placeholder="Sprint goal (optional)"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Start
          </span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            End
          </span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={!name.trim() || !startDate || !endDate}
          size="sm"
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          Create sprint
        </Button>
      </div>
    </div>
  );
}
