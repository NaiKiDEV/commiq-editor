import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import type {
  Board,
  BoardColumn as BoardColumnType,
  Task,
  TaskTypeConfig,
} from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";
import { TaskCard } from "./TaskCard";
import { QuickCreateTask } from "./QuickCreateTask";
import { sortByOrder } from "./shared";

const COLUMN_COLOR_OPTIONS = [
  "#64748b",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ef4444",
  "#facc15",
  "#06b6d4",
];

type Props = {
  board: Board;
  column: BoardColumnType;
  tasks: Task[];
  taskTypeRegistry: TaskTypeConfig[];
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (direction: -1 | 1) => void;
  activeTaskId: string | null;
};

export function BoardColumn({
  board,
  column,
  tasks,
  taskTypeRegistry,
  canMoveLeft,
  canMoveRight,
  onMove,
  activeTaskId,
}: Props) {
  const { dispatch, openTaskDetail } = useBoardsContext();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);

  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column", columnId: column.id },
  });

  const sorted = sortByOrder(tasks);
  const overLimit =
    column.wipLimit !== undefined && sorted.length > column.wipLimit;
  const atLimit =
    column.wipLimit !== undefined && sorted.length >= column.wipLimit;

  const commitRename = async () => {
    const next = renameValue.trim();
    setIsRenaming(false);
    if (!next || next === column.name) {
      setRenameValue(column.name);
      return;
    }
    await dispatch({
      type: "UPDATE_COLUMN",
      boardId: board.id,
      columnId: column.id,
      patch: { name: next },
    });
  };

  const setColor = async (color: string) => {
    await dispatch({
      type: "UPDATE_COLUMN",
      boardId: board.id,
      columnId: column.id,
      patch: { color },
    });
  };

  const setWipLimit = async (raw: string) => {
    const num = raw === "" ? undefined : Number(raw);
    if (raw !== "" && (!Number.isFinite(num) || (num as number) < 0)) return;
    await dispatch({
      type: "UPDATE_COLUMN",
      boardId: board.id,
      columnId: column.id,
      patch: { wipLimit: num },
    });
  };

  const remove = async () => {
    await dispatch({
      type: "DELETE_COLUMN",
      boardId: board.id,
      columnId: column.id,
    });
  };

  return (
    <div className="flex flex-col w-72 shrink-0 h-full rounded-lg bg-muted/30 border border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span
          className="inline-block size-2 rounded-sm shrink-0"
          style={{ backgroundColor: column.color }}
        />
        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") {
                setIsRenaming(false);
                setRenameValue(column.name);
              }
            }}
            className="h-6 text-xs flex-1"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => {
              setRenameValue(column.name);
              setIsRenaming(true);
            }}
            className="text-xs font-medium uppercase tracking-wider text-foreground/80 hover:text-foreground flex-1 text-left truncate"
            title="Double-click to rename"
          >
            {column.name}
          </button>
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            overLimit
              ? "bg-destructive/20 text-destructive"
              : atLimit
                ? "bg-orange-500/20 text-orange-400"
                : "bg-muted text-muted-foreground"
          }`}
          title={
            column.wipLimit !== undefined
              ? `${sorted.length} / ${column.wipLimit} WIP`
              : `${sorted.length} tasks`
          }
        >
          {column.wipLimit !== undefined
            ? `${sorted.length}/${column.wipLimit}`
            : sorted.length}
          {overLimit && (
            <AlertTriangle className="inline size-2.5 ml-0.5 -mt-0.5" />
          )}
        </span>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                title="Column actions"
              />
            }
          >
            <MoreHorizontal className="size-3.5 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-2" sideOffset={4}>
            <div className="flex flex-col gap-2 text-xs">
              <PopoverButton
                onClick={() => {
                  setRenameValue(column.name);
                  setIsRenaming(true);
                }}
              >
                Rename
              </PopoverButton>

              <PopoverSection label="Color">
                <div className="flex flex-wrap gap-1">
                  {COLUMN_COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void setColor(c)}
                      className={`size-5 rounded-md border ${
                        c === column.color
                          ? "border-foreground"
                          : "border-border/60"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Set color ${c}`}
                    />
                  ))}
                </div>
              </PopoverSection>

              <PopoverSection label="WIP limit">
                <Input
                  type="number"
                  min={0}
                  placeholder="No limit"
                  defaultValue={column.wipLimit ?? ""}
                  onBlur={(e) => void setWipLimit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  className="h-7 text-xs"
                />
              </PopoverSection>

              <div className="h-px bg-border -mx-2" />

              <div className="flex gap-1">
                <PopoverButton
                  onClick={() => onMove(-1)}
                  disabled={!canMoveLeft}
                  className="flex-1 justify-center gap-1"
                >
                  <ChevronLeft className="size-3.5" />
                  Left
                </PopoverButton>
                <PopoverButton
                  onClick={() => onMove(1)}
                  disabled={!canMoveRight}
                  className="flex-1 justify-center gap-1"
                >
                  Right
                  <ChevronRight className="size-3.5" />
                </PopoverButton>
              </div>

              <div className="h-px bg-border -mx-2" />

              <PopoverButton
                onClick={() => void remove()}
                className="text-destructive gap-1.5"
              >
                <Trash2 className="size-3.5" />
                Delete column
              </PopoverButton>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Tasks list (droppable) */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-0 p-2 flex flex-col gap-1.5 overflow-y-auto transition-colors ${
          isOver ? "bg-muted/60" : ""
        }`}
      >
        <SortableContext
          id={column.id}
          items={sorted.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {sorted.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              board={board}
              taskTypeRegistry={taskTypeRegistry}
              onOpen={() => openTaskDetail(task.id)}
              isPlaceholder={activeTaskId === task.id}
            />
          ))}
        </SortableContext>
        {sorted.length === 0 && (
          <div className="text-[10px] text-muted-foreground/60 italic py-4 text-center">
            Drop tasks here
          </div>
        )}
      </div>

      {/* Quick create */}
      <div className="p-2 border-t border-border">
        <QuickCreateTask boardId={board.id} columnId={column.id} />
      </div>
    </div>
  );
}

function PopoverButton({
  className,
  disabled,
  onClick,
  children,
}: {
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center px-2 py-1.5 rounded-md text-left text-xs hover:bg-muted disabled:opacity-40 disabled:pointer-events-none ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function PopoverSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-2">
        {label}
      </span>
      <div className="px-2">{children}</div>
    </div>
  );
}
