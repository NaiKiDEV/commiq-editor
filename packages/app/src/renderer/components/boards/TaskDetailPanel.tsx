import { useEffect, useMemo, useState } from "react";
import { ChevronDown, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { cn } from "@/lib/utils";
import type { TaskComment, TaskPriority, TaskType } from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";
import { TaskDescription } from "./TaskDescription";
import { MarkdownContent } from "./MarkdownContent";
import { PRIORITY_BADGE_CLASS, PRIORITY_LABEL, resolveIcon, sortByOrder } from "./shared";

const PRIORITY_OPTIONS: TaskPriority[] = ["critical", "high", "medium", "low"];
const COMMENT_AUTHOR_KEY = "boards_comment_author";

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
};

export function TaskDetailPanel({ open, onClose, taskId }: Props) {
  const {
    tasks,
    taskTypeRegistry,
    dispatch,
    activeProject,
    boards,
    sprints,
    epics,
  } = useBoardsContext();

  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) ?? null,
    [tasks, taskId],
  );

  const [title, setTitle] = useState(task?.title ?? "");
  const [assignee, setAssignee] = useState(task?.assignee ?? "");
  const [labelInput, setLabelInput] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentAuthor, setCommentAuthor] = useState(
    () => localStorage.getItem(COMMENT_AUTHOR_KEY) ?? "Me",
  );
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setAssignee(task.assignee ?? "");
    setLabelInput("");
    setCommentBody("");
    setEditingCommentId(null);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task || !open) return null;

  const enabledTypes = activeProject?.settings.enabledTaskTypes ?? [];
  const availableTypes = taskTypeRegistry.filter((t) =>
    enabledTypes.includes(t.key),
  );
  const typeConfig = availableTypes.find((t) => t.key === task.type);
  const TypeIcon = resolveIcon(typeConfig?.icon ?? "CheckSquare");

  const taskBoard = boards.find((b) => b.id === task.boardId);
  const taskBoardCols = taskBoard ? sortByOrder(taskBoard.columns) : [];
  const taskColumn = taskBoardCols.find((c) => c.id === task.columnId);

  const activeSprints = sprints.filter((s) => s.status !== "completed");
  const activeEpics = epics.filter((e) => e.status === "active");

  // ── Commit handlers ────────────────────────────────────────────────────────

  const commitTitle = async () => {
    const next = title.trim();
    if (!next || next === task.title) {
      setTitle(task.title);
      return;
    }
    await dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { title: next } });
  };

  const commitDescription = async (next: string) => {
    if (next === task.description) return;
    await dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { description: next },
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
    await dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { type } });
  };

  const setPriority = async (priority: TaskPriority) => {
    if (priority === task.priority) return;
    await dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { priority } });
  };

  const setColumn = async (columnId: string) => {
    if (columnId === task.columnId) return;
    const colTasks = tasks.filter(
      (t) => t.boardId === task.boardId && t.columnId === columnId,
    );
    const nextOrder = colTasks.length
      ? Math.max(...colTasks.map((t) => t.order)) + 1
      : 0;
    await dispatch({
      type: "MOVE_TASK",
      taskId: task.id,
      targetColumnId: columnId,
      newOrder: nextOrder,
    });
  };

  const setBoard = async (boardId: string) => {
    if (boardId === task.boardId) return;
    await dispatch({ type: "MOVE_TASK_TO_BOARD", taskId: task.id, targetBoardId: boardId });
  };

  const setSprint = async (sprintId: string) => {
    const next = sprintId || undefined;
    if (next === task.sprintId) return;
    await dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { sprintId: next } });
  };

  const setEpic = async (epicId: string) => {
    const next = epicId || undefined;
    if (next === task.epicId) return;
    await dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { epicId: next } });
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

  const addComment = async () => {
    const body = commentBody.trim();
    if (!body) return;
    await dispatch({
      type: "ADD_COMMENT",
      taskId: task.id,
      author: commentAuthor,
      body,
    });
    setCommentBody("");
  };

  const deleteComment = async (commentId: string) => {
    await dispatch({ type: "DELETE_COMMENT", taskId: task.id, commentId });
  };

  const startEditComment = (c: TaskComment) => {
    setEditingCommentId(c.id);
    setEditingCommentBody(c.body);
  };

  const saveEditComment = async () => {
    if (!editingCommentId) return;
    const body = editingCommentBody.trim();
    if (!body) return;
    await dispatch({
      type: "UPDATE_COMMENT",
      taskId: task.id,
      commentId: editingCommentId,
      body,
    });
    setEditingCommentId(null);
    setEditingCommentBody("");
  };

  const saveCommentAuthor = () => {
    localStorage.setItem(COMMENT_AUTHOR_KEY, commentAuthor);
  };

  const deleteTask = async () => {
    await dispatch({ type: "DELETE_TASK", taskId: task.id });
    onClose();
  };

  const comments = task.comments ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-[520px] bg-background border-l border-border shadow-xl z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <TypeIcon
          className="size-4 shrink-0"
          style={{ color: typeConfig?.color ?? "currentColor" }}
        />
        {task.number !== undefined && (
          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
            #{task.number}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground truncate flex-1">
          {taskBoard?.name ?? "—"} / {taskColumn?.name ?? "—"}
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

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto flex flex-col">

        {/* Title */}
        <div className="px-4 pt-4 pb-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
            className="w-full text-[15px] font-semibold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground"
            placeholder="Task title…"
          />
        </div>

        <Separator />

        {/* Type pills */}
        <div className="px-4 py-2.5 flex flex-col gap-1.5">
          <SectionLabel>Type</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {availableTypes.map((t) => {
              const Icon = resolveIcon(t.icon);
              const active = t.key === task.type;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => void setType(t.key)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors",
                    active
                      ? "border-foreground/30 text-foreground bg-muted"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30",
                  )}
                >
                  <Icon className="size-3" style={{ color: t.color }} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority pills */}
        <div className="px-4 pb-2.5 flex flex-col gap-1.5">
          <SectionLabel>Priority</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {PRIORITY_OPTIONS.map((p) => {
              const active = p === task.priority;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => void setPriority(p)}
                  className={cn(
                    "px-2 py-1 text-[11px] rounded-md capitalize transition-colors",
                    active
                      ? `${PRIORITY_BADGE_CLASS[p]} ring-1 ring-foreground/20`
                      : "border border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Meta grid */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <MetaRow label="Column">
              <MetaSelect
                value={task.columnId}
                onChange={(v) => void setColumn(v)}
                options={taskBoardCols.map((c) => ({ value: c.id, label: c.name }))}
              />
            </MetaRow>

            <MetaRow label="Board">
              <MetaSelect
                value={task.boardId}
                onChange={(v) => void setBoard(v)}
                options={boards.map((b) => ({ value: b.id, label: b.name }))}
              />
            </MetaRow>

            <MetaRow label="Sprint">
              <MetaSelect
                value={task.sprintId ?? ""}
                onChange={(v) => void setSprint(v)}
                placeholder="No sprint"
                options={activeSprints.map((s) => ({ value: s.id, label: s.name }))}
              />
            </MetaRow>

            <MetaRow
              label="Epic"
              accentColor={epics.find((e) => e.id === task.epicId)?.color}
            >
              <MetaSelect
                value={task.epicId ?? ""}
                onChange={(v) => void setEpic(v)}
                placeholder="No epic"
                options={activeEpics.map((e) => ({ value: e.id, label: e.name }))}
                accentColor={epics.find((e) => e.id === task.epicId)?.color}
              />
            </MetaRow>

            <MetaRow label="Assignee">
              <input
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                onBlur={() => void commitAssignee()}
                placeholder="Unassigned"
                className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </MetaRow>

            <MetaRow label="Story points">
              <input
                key={task.id + "-pts"}
                type="number"
                min={0}
                defaultValue={task.storyPoints ?? ""}
                onBlur={(e) => void setStoryPoints(e.target.value)}
                placeholder="—"
                className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </MetaRow>

            <MetaRow label="Due date">
              <input
                key={task.id + "-due"}
                type="date"
                defaultValue={task.dueDate?.slice(0, 10) ?? ""}
                onChange={(e) => void setDueDate(e.target.value)}
                className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </MetaRow>
          </div>
        </div>

        <Separator />

        {/* Description */}
        <div className="px-4 py-3">
          <TaskDescription
            key={task.id}
            value={task.description}
            onCommit={(next) => void commitDescription(next)}
          />
        </div>

        <Separator />

        {/* Labels */}
        <div className="px-4 py-3 flex flex-col gap-1.5">
          <SectionLabel>Labels</SectionLabel>
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
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
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
        </div>

        <Separator />

        {/* Comments */}
        <div className="px-4 py-3 flex flex-col gap-3">
          <SectionLabel>
            Comments{" "}
            {comments.length > 0 && (
              <span className="text-muted-foreground font-normal ml-1">
                ({comments.length})
              </span>
            )}
          </SectionLabel>

          {comments.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-foreground">
                  {c.author}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {relativeTime(c.createdAt)}
                </span>
                {c.updatedAt !== c.createdAt && (
                  <span className="text-[10px] text-muted-foreground">(edited)</span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEditComment(c)}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  >
                    <Pencil className="size-2.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteComment(c.id)}
                    className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
                  >
                    <Trash2 className="size-2.5" />
                    Delete
                  </button>
                </div>
              </div>
              {editingCommentId === c.id ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={editingCommentBody}
                    onChange={(e) => setEditingCommentBody(e.target.value)}
                    rows={3}
                    className="w-full text-xs bg-muted rounded-md px-2.5 py-2 outline-none resize-none border border-border"
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <Button size="xs" onClick={() => void saveEditComment()}>
                      Save
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setEditingCommentId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <MarkdownContent
                  content={c.body}
                  className="text-xs text-foreground/80 leading-relaxed bg-muted/50 rounded-md px-2.5 py-2"
                />
              )}
            </div>
          ))}

          {/* Add comment form */}
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">As:</span>
              <input
                type="text"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                onBlur={saveCommentAuthor}
                className="text-[10px] font-medium text-foreground bg-transparent border-b border-border/50 outline-none w-24"
              />
            </div>
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void addComment();
                }
              }}
              placeholder="Write a comment… (Markdown supported · Ctrl+Enter to submit)"
              rows={3}
              className="w-full text-xs bg-muted/40 rounded-md px-2.5 py-2 outline-none resize-none border border-border/50 focus:border-border placeholder-muted-foreground"
            />
            <div className="flex justify-end">
              <Button
                size="xs"
                onClick={() => void addComment()}
                disabled={!commentBody.trim()}
              >
                <MessageSquare className="size-3" />
                Add comment
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Timestamps */}
        <div className="px-4 py-3 text-[10px] text-muted-foreground space-y-0.5">
          <p>Created {new Date(task.createdAt).toLocaleString()}</p>
          <p>Updated {new Date(task.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </aside>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetaRow({
  label,
  accentColor,
  children,
}: {
  label: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {accentColor && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
          />
        )}
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function MetaSelect({
  value,
  onChange,
  options,
  placeholder,
  accentColor,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  accentColor?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full h-7 pl-2 pr-6 text-xs rounded-md border bg-background text-foreground",
          "appearance-none cursor-pointer outline-none focus:ring-1 focus:ring-ring",
          !value && "text-muted-foreground",
          accentColor ? "border-l-2" : "border-border",
        )}
        style={accentColor ? { borderLeftColor: accentColor } : undefined}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-1.5 top-1.5 size-3 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
