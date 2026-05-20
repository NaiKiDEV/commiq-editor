import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { TaskType } from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";
import { resolveIcon, sortByOrder } from "./shared";

type Props = {
  /** undefined = backlog (unassigned); otherwise add to this sprint. */
  sprintId: string | undefined;
};

/**
 * Inline "+ Add task" used inside BacklogList sections. Defaults boardId+columnId
 * to the first board / first column in the active project, since the backlog is
 * project-scoped.
 */
export function QuickCreateBacklogTask({ sprintId }: Props) {
  const { dispatch, taskTypeRegistry, activeProject, boards } =
    useBoardsContext();

  const enabledTypes = activeProject?.settings.enabledTaskTypes ?? [];
  const availableTypes = taskTypeRegistry.filter((t) =>
    enabledTypes.includes(t.key),
  );

  // Default board = first board; default column = first column (by order).
  const targetBoard = boards[0] ?? null;
  const targetColumn = targetBoard
    ? sortByOrder(targetBoard.columns)[0] ?? null
    : null;

  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>(
    availableTypes[0]?.key ?? "task",
  );

  useEffect(() => {
    if (!availableTypes.length) return;
    if (!availableTypes.some((t) => t.key === taskType)) {
      setTaskType(availableTypes[0].key);
    }
  }, [availableTypes, taskType]);

  const submit = async () => {
    if (!targetBoard || !targetColumn) {
      setIsOpen(false);
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setIsOpen(false);
      return;
    }
    await dispatch({
      type: "CREATE_TASK",
      boardId: targetBoard.id,
      columnId: targetColumn.id,
      title: trimmed,
      taskType,
      sprintId,
    });
    setTitle("");
  };

  const cancel = () => {
    setTitle("");
    setIsOpen(false);
  };

  if (!targetBoard || !targetColumn) {
    return (
      <p className="px-3 py-2 text-[10px] text-muted-foreground/60 italic">
        Create a board to add tasks here.
      </p>
    );
  }

  if (!isOpen) {
    return (
      <div className="px-3 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add task
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 flex flex-col gap-1.5 p-2 rounded-md bg-card border border-border">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") cancel();
        }}
        placeholder="Task title"
        className="h-7 text-xs"
      />
      <div className="flex items-center gap-1 flex-wrap">
        {availableTypes.map((t) => {
          const Icon = resolveIcon(t.icon);
          const active = t.key === taskType;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTaskType(t.key)}
              className={`flex items-center gap-1 px-1.5 py-1 text-[10px] rounded-md border ${
                active
                  ? "border-foreground text-foreground bg-muted"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
              title={t.label}
            >
              <Icon className="size-3" style={{ color: t.color }} />
              {t.label}
            </button>
          );
        })}
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-xs" onClick={cancel} title="Cancel">
            <X className="size-3.5" />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void submit()}
            disabled={!title.trim()}
          >
            Add
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        Created in <span className="text-muted-foreground">{targetBoard.name}</span>
        {" · "}
        <span className="text-muted-foreground">{targetColumn.name}</span>
      </p>
    </div>
  );
}
