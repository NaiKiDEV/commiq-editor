import { useEffect, useMemo, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Separator } from "../ui/separator";
import type {
  TaskPriority,
  TaskType,
} from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";
import {
  PRIORITY_BADGE_CLASS,
  PRIORITY_LABEL,
  resolveIcon,
} from "./shared";

const PRIORITY_OPTIONS: TaskPriority[] = ["critical", "high", "medium", "low"];

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
};

export function TaskDetailPanel({ open, onClose, taskId }: Props) {
  const { tasks, taskTypeRegistry, dispatch, activeProject } =
    useBoardsContext();
  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) ?? null,
    [tasks, taskId],
  );

  // Local form state mirrors the task — debounced commits via blur/enter.
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assignee, setAssignee] = useState(task?.assignee ?? "");
  const [labelInput, setLabelInput] = useState("");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
    setAssignee(task.assignee ?? "");
    setLabelInput("");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task || !open) return null;

  const enabledTypes = activeProject?.settings.enabledTaskTypes ?? [];
  const availableTypes = taskTypeRegistry.filter((t) =>
    enabledTypes.includes(t.key),
  );

  const commitTitle = async () => {
    const next = title.trim();
    if (!next || next === task.title) {
      setTitle(task.title);
      return;
    }
    await dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { title: next } });
  };

  const commitDescription = async () => {
    if (description === task.description) return;
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { description },
    });
  };

  const commitAssignee = async () => {
    const next = assignee.trim();
    if ((task.assignee ?? "") === next) return;
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { assignee: next || undefined },
    });
  };

  const setType = async (type: TaskType) => {
    if (type === task.type) return;
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { type },
    });
  };

  const setPriority = async (priority: TaskPriority) => {
    if (priority === task.priority) return;
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { priority },
    });
  };

  const setStoryPoints = async (raw: string) => {
    const num = raw === "" ? undefined : Number(raw);
    if (raw !== "" && (!Number.isFinite(num) || (num as number) < 0)) return;
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { storyPoints: num },
    });
  };

  const setDueDate = async (raw: string) => {
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { dueDate: raw || undefined },
    });
  };

  const setStatus = async (status: string) => {
    if (status === task.status) return;
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { status },
    });
  };

  const addLabel = async () => {
    const next = labelInput.trim();
    if (!next || task.labels.includes(next)) {
      setLabelInput("");
      return;
    }
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { labels: [...task.labels, next] },
    });
    setLabelInput("");
  };

  const removeLabel = async (label: string) => {
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { labels: task.labels.filter((l) => l !== label) },
    });
  };

  const deleteTask = async () => {
    await dispatch({ type: "DELETE_TASK", taskId: task.id });
    onClose();
  };

  const typeConfig = availableTypes.find((t) => t.key === task.type);
  const TypeIcon = resolveIcon(typeConfig?.icon ?? "CheckSquare");

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-96 bg-background border-l border-border shadow-xl z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <TypeIcon
          className="size-4 shrink-0"
          style={{ color: typeConfig?.color ?? "currentColor" }}
        />
        <span className="text-xs text-muted-foreground flex-1 truncate">
          Task details
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void deleteTask()}
          title="Delete task"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close">
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 text-xs">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="h-8 text-sm"
          />
        </Field>

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => void commitDescription()}
            rows={4}
            placeholder="Add a description…"
          />
        </Field>

        <Separator />

        <Field label="Type">
          <div className="flex flex-wrap gap-1">
            {availableTypes.map((t) => {
              const Icon = resolveIcon(t.icon);
              const active = t.key === task.type;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => void setType(t.key)}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border ${
                    active
                      ? "border-foreground text-foreground bg-muted"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3" style={{ color: t.color }} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Priority">
          <div className="flex flex-wrap gap-1">
            {PRIORITY_OPTIONS.map((p) => {
              const active = p === task.priority;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => void setPriority(p)}
                  className={`px-2 py-1 text-[11px] rounded-md capitalize ${
                    active
                      ? PRIORITY_BADGE_CLASS[p] +
                        " ring-1 ring-foreground/20"
                      : "border border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Status">
          <Input
            defaultValue={task.status}
            onBlur={(e) => void setStatus(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="h-7 text-xs"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Story points">
            <Input
              type="number"
              min={0}
              defaultValue={task.storyPoints ?? ""}
              onBlur={(e) => void setStoryPoints(e.target.value)}
              className="h-7 text-xs"
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              defaultValue={task.dueDate?.slice(0, 10) ?? ""}
              onChange={(e) => void setDueDate(e.target.value)}
              className="h-7 text-xs"
            />
          </Field>
        </div>

        <Field label="Assignee">
          <Input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            onBlur={() => void commitAssignee()}
            placeholder="Unassigned"
            className="h-7 text-xs"
          />
        </Field>

        <Field label="Labels">
          <div className="flex flex-wrap gap-1 mb-1.5">
            {task.labels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground"
              >
                {label}
                <button
                  type="button"
                  onClick={() => void removeLabel(label)}
                  className="hover:text-foreground"
                  title="Remove label"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addLabel();
              }
            }}
            placeholder="Add label and press Enter"
            className="h-7 text-xs"
          />
        </Field>

        <Separator />
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <p>Created {new Date(task.createdAt).toLocaleString()}</p>
          <p>Updated {new Date(task.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
