import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  Board,
  Task,
  TaskTypeConfig,
} from "../../../shared/boards-types";
import {
  PRIORITY_BADGE_CLASS,
  PRIORITY_LABEL,
  findTypeConfig,
  resolveIcon,
} from "./shared";
import { excerpt } from "../notes/utils";

type Props = {
  task: Task;
  board: Board;
  taskTypeRegistry: TaskTypeConfig[];
  onOpen: () => void;
  /** When true, render a hollow placeholder while the drag overlay shows the real card. */
  isPlaceholder?: boolean;
};

export function TaskCard({
  task,
  board,
  taskTypeRegistry,
  onOpen,
  isPlaceholder,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.columnId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isPlaceholder ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCardView
        task={task}
        board={board}
        taskTypeRegistry={taskTypeRegistry}
        onOpen={onOpen}
      />
    </div>
  );
}

/**
 * Visual-only card used both inside a sortable item and inside a `DragOverlay`.
 * Density and visible fields come from board.settings.
 */
export function TaskCardView({
  task,
  board,
  taskTypeRegistry,
  onOpen,
  dragging,
}: {
  task: Task;
  board: Board;
  taskTypeRegistry: TaskTypeConfig[];
  onOpen?: () => void;
  dragging?: boolean;
}) {
  const typeConfig = findTypeConfig(taskTypeRegistry, task.type);
  const Icon = resolveIcon(typeConfig?.icon ?? "CheckSquare");
  const density = board.settings.cardDisplayDensity;
  const visible = board.settings.visibleCardFields;

  const showField = (field: string) => visible.includes(field);

  const padding =
    density === "compact" ? "px-2 py-1.5" : density === "detailed" ? "p-3" : "px-2.5 py-2";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group w-full text-left ${padding} rounded-md bg-card border border-border hover:border-foreground/30 transition-colors flex flex-col gap-1.5 cursor-grab active:cursor-grabbing ${
        dragging ? "shadow-lg ring-1 ring-ring/40" : ""
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        {showField("type") && (
          <span
            className="mt-0.5 shrink-0"
            style={{ color: typeConfig?.color ?? "currentColor" }}
            title={typeConfig?.label ?? task.type}
          >
            <Icon className="size-3.5" />
          </span>
        )}
        <span className="text-xs font-medium leading-snug flex-1 min-w-0 break-words">
          {task.title}
        </span>
        {task.number !== undefined && (
          <span className="shrink-0 text-[9px] font-mono text-muted-foreground/50 mt-0.5">
            #{task.number}
          </span>
        )}
      </div>

      {(showField("priority") ||
        showField("storyPoints") ||
        showField("labels") ||
        showField("assignee")) && (
        <div className="flex items-center flex-wrap gap-1 -ml-0.5">
          {showField("priority") && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${PRIORITY_BADGE_CLASS[task.priority]}`}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {showField("storyPoints") && task.storyPoints !== undefined && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-muted text-muted-foreground">
              {task.storyPoints} pt
            </span>
          )}
          {showField("labels") &&
            task.labels.slice(0, 3).map((label) => (
              <span
                key={label}
                className="px-1.5 py-0.5 rounded-full text-[9px] bg-muted text-muted-foreground"
              >
                {label}
              </span>
            ))}
          {showField("assignee") && task.assignee && (
            <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[7rem]">
              {task.assignee}
            </span>
          )}
        </div>
      )}

      {density === "detailed" && task.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2">
          {excerpt(task.description, 160)}
        </p>
      )}
    </button>
  );
}
