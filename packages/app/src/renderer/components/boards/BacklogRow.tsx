import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import type {
  Task,
  TaskPriority,
  TaskType,
  TaskTypeConfig,
  Epic,
} from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";
import {
  PRIORITY_BADGE_CLASS,
  PRIORITY_LABEL,
  resolveIcon,
} from "./shared";

const PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];

type Props = {
  task: Task;
  selected: boolean;
  onToggleSelect: (next: boolean) => void;
  registry: TaskTypeConfig[];
  epics: Epic[];
  isPlaceholder?: boolean;
};

export function BacklogRow({
  task,
  selected,
  onToggleSelect,
  registry,
  epics,
  isPlaceholder,
}: Props) {
  const { dispatch, openTaskDetail, activeProject } = useBoardsContext();
  const enabledTypes = activeProject?.settings.enabledTaskTypes ?? [];
  const availableTypes = registry.filter((t) => enabledTypes.includes(t.key));

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", sprintId: task.sprintId ?? null },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isPlaceholder ? 0.4 : 1,
  };

  const typeConfig = registry.find((t) => t.key === task.type);
  const TypeIcon = resolveIcon(typeConfig?.icon ?? "CheckSquare");

  const epic = epics.find((e) => e.id === task.epicId);

  const setPriority = (p: TaskPriority) =>
    void dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { priority: p },
    });

  const setType = (t: TaskType) =>
    void dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { type: t },
    });

  const setStoryPoints = (raw: string) => {
    const num = raw === "" ? undefined : Number(raw);
    if (raw !== "" && (!Number.isFinite(num) || (num as number) < 0)) return;
    void dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: { storyPoints: num },
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`grid grid-cols-[auto_auto_minmax(0,2.5fr)_auto_5rem_5rem_minmax(0,1fr)] gap-2 items-center px-2 py-1.5 rounded-md text-xs hover:bg-muted/40 ${
        selected ? "bg-muted/60" : ""
      }`}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        type="button"
        className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="size-3.5" />
      </button>

      {/* Select */}
      <Checkbox
        checked={selected}
        onCheckedChange={(next) => onToggleSelect(next)}
      />

      {/* Title (click to open detail) */}
      <button
        type="button"
        onClick={() => openTaskDetail(task.id)}
        className="text-left truncate text-foreground hover:underline"
      >
        {task.title}
      </button>

      {/* Type (popover) */}
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 hover:border-foreground/40"
              title={typeConfig?.label ?? task.type}
            />
          }
        >
          <TypeIcon
            className="size-3"
            style={{ color: typeConfig?.color }}
          />
          <span className="hidden sm:inline text-[10px]">
            {typeConfig?.label ?? task.type}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1.5" sideOffset={4}>
          <div className="flex flex-col gap-0.5">
            {availableTypes.map((t) => {
              const Icon = resolveIcon(t.icon);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={`flex items-center gap-2 px-2 py-1 text-xs rounded-md hover:bg-muted ${
                    t.key === task.type ? "bg-muted" : ""
                  }`}
                >
                  <Icon className="size-3.5" style={{ color: t.color }} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Priority (popover) */}
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${PRIORITY_BADGE_CLASS[task.priority]}`}
              title="Change priority"
            />
          }
        >
          {PRIORITY_LABEL[task.priority]}
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1.5" sideOffset={4}>
          <div className="flex flex-col gap-0.5">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`text-left px-2 py-1 text-xs rounded-md hover:bg-muted capitalize ${
                  p === task.priority ? "bg-muted" : ""
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Story points (inline input) */}
      <Input
        type="number"
        min={0}
        defaultValue={task.storyPoints ?? ""}
        onBlur={(e) => setStoryPoints(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        placeholder="—"
        className="h-6 w-14 text-xs px-1.5"
      />

      {/* Epic */}
      {epic ? (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] truncate"
          style={{
            backgroundColor: `${epic.color}33`,
            color: epic.color,
          }}
          title={epic.name}
        >
          {epic.name}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50">—</span>
      )}
    </div>
  );
}

export function BacklogRowHeader({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <div className="grid grid-cols-[auto_auto_minmax(0,2.5fr)_auto_5rem_5rem_minmax(0,1fr)] gap-2 items-center px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b border-border">
      <span />
      <span />
      <SortHeader
        active={sortKey === "title"}
        dir={sortDir}
        onClick={() => onSort("title")}
      >
        Title
      </SortHeader>
      <SortHeader
        active={sortKey === "type"}
        dir={sortDir}
        onClick={() => onSort("type")}
      >
        Type
      </SortHeader>
      <SortHeader
        active={sortKey === "priority"}
        dir={sortDir}
        onClick={() => onSort("priority")}
      >
        Priority
      </SortHeader>
      <SortHeader
        active={sortKey === "storyPoints"}
        dir={sortDir}
        onClick={() => onSort("storyPoints")}
      >
        SP
      </SortHeader>
      <SortHeader
        active={sortKey === "epic"}
        dir={sortDir}
        onClick={() => onSort("epic")}
      >
        Epic
      </SortHeader>
    </div>
  );
}

function SortHeader({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left hover:text-foreground ${active ? "text-foreground" : ""}`}
    >
      {children}
      {active && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

export type SortKey =
  | "manual"
  | "title"
  | "type"
  | "priority"
  | "storyPoints"
  | "createdAt"
  | "epic"
  | "sprint";

export type SortDir = "asc" | "desc";
