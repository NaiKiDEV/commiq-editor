import { useState } from "react";
import {
  Archive,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useBoardsContext } from "./BoardsContext";
import type { Epic, EpicStatus, Task } from "../../../shared/boards-types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PRIORITY_BADGE_CLASS, PRIORITY_LABEL, resolveIcon } from "./shared";

const EPIC_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#94a3b8",
];

const STATUS_LABELS: Record<EpicStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

type EpicFormData = {
  name: string;
  color: string;
  description: string;
  startDate: string;
  targetDate: string;
};

const DEFAULT_FORM: EpicFormData = {
  name: "",
  color: EPIC_COLORS[0],
  description: "",
  startDate: "",
  targetDate: "",
};

export function EpicsView() {
  const { epics, tasks, taskTypeRegistry, activeProjectId, dispatch, openTaskDetail } =
    useBoardsContext();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<EpicFormData>(DEFAULT_FORM);
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EpicFormData>(DEFAULT_FORM);
  const [deletingEpicId, setDeletingEpicId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<EpicStatus>>(
    new Set(["completed", "archived"]),
  );

  const epicTasks = (epicId: string) =>
    tasks.filter((t) => t.epicId === epicId);

  const grouped: Record<EpicStatus, Epic[]> = {
    active: epics.filter((e) => e.status === "active"),
    completed: epics.filter((e) => e.status === "completed"),
    archived: epics.filter((e) => e.status === "archived"),
  };

  const toggleSection = (status: EpicStatus) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!activeProjectId || !createForm.name.trim()) return;
    await dispatch({
      type: "CREATE_EPIC",
      projectId: activeProjectId,
      name: createForm.name.trim(),
      color: createForm.color,
      description: createForm.description.trim() || undefined,
      startDate: createForm.startDate || undefined,
      targetDate: createForm.targetDate || undefined,
    });
    setCreateForm(DEFAULT_FORM);
    setShowCreateForm(false);
  };

  const startEdit = (epic: Epic) => {
    setEditingEpicId(epic.id);
    setEditForm({
      name: epic.name,
      color: epic.color,
      description: epic.description,
      startDate: epic.startDate ?? "",
      targetDate: epic.targetDate ?? "",
    });
    setDeletingEpicId(null);
  };

  const handleUpdate = async () => {
    if (!editingEpicId || !editForm.name.trim()) return;
    await dispatch({
      type: "UPDATE_EPIC",
      epicId: editingEpicId,
      patch: {
        name: editForm.name.trim(),
        color: editForm.color,
        description: editForm.description.trim(),
        startDate: editForm.startDate || undefined,
        targetDate: editForm.targetDate || undefined,
      },
    });
    setEditingEpicId(null);
  };

  const setStatus = async (epicId: string, status: EpicStatus) => {
    await dispatch({ type: "UPDATE_EPIC", epicId, patch: { status } });
  };

  const handleDelete = async (epicId: string) => {
    await dispatch({ type: "DELETE_EPIC", epicId });
    setDeletingEpicId(null);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border sticky top-0 bg-background z-10">
        <span className="text-xs text-muted-foreground">
          {epics.length} epic{epics.length !== 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowCreateForm((v) => !v);
            setEditingEpicId(null);
          }}
        >
          <Plus className="size-3.5 mr-1" />
          New Epic
        </Button>
      </div>

      <div className="p-4 space-y-5">
        {/* Create form */}
        {showCreateForm && (
          <EpicForm
            form={createForm}
            onChange={setCreateForm}
            onSubmit={() => void handleCreate()}
            onCancel={() => {
              setCreateForm(DEFAULT_FORM);
              setShowCreateForm(false);
            }}
            submitLabel="Create Epic"
          />
        )}

        {/* Empty state */}
        {epics.length === 0 && !showCreateForm && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <div className="text-center space-y-2">
              <p className="text-sm">No epics yet.</p>
              <p className="text-xs">
                Create an epic to group and track related tasks.
              </p>
            </div>
          </div>
        )}

        {/* Grouped sections */}
        {(["active", "completed", "archived"] as EpicStatus[]).map((status) => {
          const items = grouped[status];
          if (items.length === 0 && status !== "active") return null;
          const collapsed = collapsedSections.has(status);

          return (
            <div key={status}>
              <button
                type="button"
                onClick={() => toggleSection(status)}
                className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground py-1 mb-2"
              >
                {collapsed ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
                {STATUS_LABELS[status]}
                <span className="ml-0.5 font-normal normal-case text-muted-foreground/60">
                  ({items.length})
                </span>
              </button>

              {!collapsed && (
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground/50 px-2 py-1">
                      No active epics yet.
                    </p>
                  ) : (
                    items.map((epic) =>
                      editingEpicId === epic.id ? (
                        <EpicForm
                          key={epic.id}
                          form={editForm}
                          onChange={setEditForm}
                          onSubmit={() => void handleUpdate()}
                          onCancel={() => setEditingEpicId(null)}
                          submitLabel="Save"
                        />
                      ) : (
                        <EpicCard
                          key={epic.id}
                          epic={epic}
                          tasks={epicTasks(epic.id)}
                          taskTypeRegistry={taskTypeRegistry}
                          isConfirmingDelete={deletingEpicId === epic.id}
                          onEdit={() => startEdit(epic)}
                          onDelete={() => setDeletingEpicId(epic.id)}
                          onDeleteConfirm={() => void handleDelete(epic.id)}
                          onDeleteCancel={() => setDeletingEpicId(null)}
                          onStatusChange={(s) => void setStatus(epic.id, s)}
                          onOpenTask={openTaskDetail}
                        />
                      ),
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EpicCard ────────────────────────────────────────────────────────────────

function EpicCard({
  epic,
  tasks,
  taskTypeRegistry,
  isConfirmingDelete,
  onEdit,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
  onStatusChange,
  onOpenTask,
}: {
  epic: Epic;
  tasks: Task[];
  taskTypeRegistry: import("../../../shared/boards-types").TaskTypeConfig[];
  isConfirmingDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onStatusChange: (status: EpicStatus) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [tasksExpanded, setTasksExpanded] = useState(true);

  const formatDate = (d?: string) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const start = formatDate(epic.startDate);
  const target = formatDate(epic.targetDate);

  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden"
      style={{ borderLeftColor: epic.color, borderLeftWidth: 3 }}
    >
      {/* Epic header */}
      <div className="group flex items-start gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              {epic.name}
            </span>
            <span
              className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                backgroundColor: `${epic.color}22`,
                color: epic.color,
              }}
            >
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </span>
            {(start ?? target) && (
              <span className="text-[10px] text-muted-foreground/60">
                {start && target
                  ? `${start} → ${target}`
                  : start
                    ? `From ${start}`
                    : `Due ${target}`}
              </span>
            )}
          </div>
          {epic.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {epic.description}
            </p>
          )}
        </div>

        {/* Actions */}
        {isConfirmingDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-destructive font-medium">Delete?</span>
            <Button
              size="icon-xs"
              variant="destructive"
              onClick={onDeleteConfirm}
              title="Confirm delete"
            >
              <Trash2 className="size-3" />
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={onDeleteCancel}>
              ✕
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {epic.status === "active" && (
              <>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Mark completed"
                  onClick={() => onStatusChange("completed")}
                >
                  <CheckCircle className="size-3.5 text-muted-foreground" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Archive"
                  onClick={() => onStatusChange("archived")}
                >
                  <Archive className="size-3.5 text-muted-foreground" />
                </Button>
              </>
            )}
            {(epic.status === "completed" || epic.status === "archived") && (
              <Button
                size="icon-xs"
                variant="ghost"
                title="Restore to active"
                onClick={() => onStatusChange("active")}
              >
                <RotateCcw className="size-3.5 text-muted-foreground" />
              </Button>
            )}
            {epic.status === "completed" && (
              <Button
                size="icon-xs"
                variant="ghost"
                title="Archive"
                onClick={() => onStatusChange("archived")}
              >
                <Archive className="size-3.5 text-muted-foreground" />
              </Button>
            )}
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onEdit}
              title="Edit epic"
            >
              <Pencil className="size-3.5 text-muted-foreground" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onDelete}
              title="Delete epic"
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>

      {/* Task list */}
      {tasks.length > 0 && (
        <div className="border-t border-border/60">
          <button
            type="button"
            onClick={() => setTasksExpanded((v) => !v)}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            {tasksExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </button>

          {tasksExpanded && (
            <div className="pb-1">
              {tasks.map((task) => {
                const typeConfig = taskTypeRegistry.find(
                  (t) => t.key === task.type,
                );
                const Icon = resolveIcon(typeConfig?.icon ?? "CheckSquare");
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors group/task"
                  >
                    <Icon
                      className="size-3 shrink-0"
                      style={{ color: typeConfig?.color ?? "currentColor" }}
                    />
                    {task.number !== undefined && (
                      <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
                        #{task.number}
                      </span>
                    )}
                    <span className="flex-1 text-xs text-foreground truncate group-hover/task:underline">
                      {task.title}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${PRIORITY_BADGE_CLASS[task.priority]}`}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground capitalize min-w-0 max-w-[6rem] truncate">
                      {task.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── EpicForm ────────────────────────────────────────────────────────────────

function EpicForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: EpicFormData;
  onChange: (f: EpicFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const set = <K extends keyof EpicFormData>(key: K, val: EpicFormData[K]) =>
    onChange({ ...form, [key]: val });

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Color swatches */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {EPIC_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set("color", c)}
            className={`w-4 h-4 rounded-full transition-transform ${
              form.color === c
                ? "scale-125 ring-2 ring-offset-1 ring-offset-card ring-foreground/40"
                : "hover:scale-110"
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      {/* Name */}
      <Input
        autoFocus
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Epic name"
        className="h-7 text-sm"
      />

      {/* Description */}
      <textarea
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      {/* Dates */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Start date
          </label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Target date
          </label>
          <Input
            type="date"
            value={form.targetDate}
            onChange={(e) => set("targetDate", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!form.name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
