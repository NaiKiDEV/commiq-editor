import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { TaskType } from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";
import { resolveIcon } from "./shared";

type Props = {
  boardId: string;
  columnId: string;
};

export function QuickCreateTask({ boardId, columnId }: Props) {
  const {
    dispatch,
    taskTypeRegistry,
    activeProject,
    activeSprint,
    showAllTasksInBoard,
  } = useBoardsContext();
  const enabledTypes = activeProject?.settings.enabledTaskTypes ?? [];
  const availableTypes = taskTypeRegistry.filter((t) =>
    enabledTypes.includes(t.key),
  );
  const sprintIdToAttach =
    activeSprint && !showAllTasksInBoard ? activeSprint.id : undefined;

  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>(
    availableTypes[0]?.key ?? "task",
  );

  // Snap selection back to a valid enabled type if settings change underneath.
  useEffect(() => {
    if (!availableTypes.length) return;
    if (!availableTypes.some((t) => t.key === taskType)) {
      setTaskType(availableTypes[0].key);
    }
  }, [availableTypes, taskType]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setIsOpen(false);
      return;
    }
    await dispatch({
      type: "CREATE_TASK",
      boardId,
      columnId,
      title: trimmed,
      taskType,
      sprintId: sprintIdToAttach,
    });
    setTitle("");
    // Keep panel open for rapid entry.
  };

  const cancel = () => {
    setTitle("");
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Add task
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-md bg-card border border-border">
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
      {availableTypes.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No task types enabled. Open project settings to enable some.
        </p>
      )}
    </div>
  );
}
