import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useBoardsContext } from "./BoardsContext";
import { BoardColumn } from "./BoardColumn";
import { TaskCardView } from "./TaskCard";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { BoardSettingsModal } from "./BoardSettingsModal";
import { BacklogList } from "./BacklogList";
import { EpicsView } from "./EpicsView";
import { SprintsView } from "./SprintsView";
import { SprintSelector } from "./SprintSelector";
import {
  fractionalOrder,
  sortByOrder,
  tasksInColumn,
} from "./shared";
import type { Task } from "../../../shared/boards-types";

export function BoardView() {
  const {
    boards,
    tasks,
    taskTypeRegistry,
    activeBoardId,
    setActiveBoardId,
    activeProjectId,
    activeTab,
    setActiveTab,
    activeSprint,
    showAllTasksInBoard,
    dispatch,
    selectedTaskId,
    isTaskDetailOpen,
    closeTaskDetail,
  } = useBoardsContext();

  const board = useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  );

  // Optimistic per-task overrides while a MOVE_TASK is in flight. The card
  // would otherwise snap back to its source column for a frame before the
  // IPC round-trip refreshes context.
  const [taskOverrides, setTaskOverrides] = useState<
    Map<string, { columnId: string; order: number }>
  >(new Map());

  // Prune any override whose target state already matches context state.
  useEffect(() => {
    if (taskOverrides.size === 0) return;
    setTaskOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, ovr] of prev) {
        const t = tasks.find((x) => x.id === id);
        if (
          t &&
          t.columnId === ovr.columnId &&
          Math.abs(t.order - ovr.order) < 1e-9
        ) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks, taskOverrides]);

  const boardTasks = useMemo(() => {
    if (!board) return [];
    const onBoard = tasks.filter((t) => t.boardId === board.id);
    const withOverrides =
      taskOverrides.size === 0
        ? onBoard
        : onBoard.map((t) => {
            const ovr = taskOverrides.get(t.id);
            return ovr ? { ...t, columnId: ovr.columnId, order: ovr.order } : t;
          });
    // When an active sprint exists, filter kanban to that sprint unless overridden.
    if (activeSprint && !showAllTasksInBoard) {
      return withOverrides.filter((t) => t.sprintId === activeSprint.id);
    }
    return withOverrides;
  }, [tasks, board, activeSprint, showAllTasksInBoard, taskOverrides]);

  const [showNewBoardInput, setShowNewBoardInput] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const createBoard = async () => {
    if (!activeProjectId) return;
    const name = newBoardName.trim();
    if (!name) {
      setShowNewBoardInput(false);
      return;
    }
    await dispatch({ type: "CREATE_BOARD", projectId: activeProjectId, name });
    setNewBoardName("");
    setShowNewBoardInput(false);
  };

  const addColumn = async () => {
    if (!board) return;
    await dispatch({
      type: "CREATE_COLUMN",
      boardId: board.id,
      name: "New column",
    });
  };

  const moveColumn = async (columnId: string, direction: -1 | 1) => {
    if (!board) return;
    const cols = sortByOrder(board.columns);
    const idx = cols.findIndex((c) => c.id === columnId);
    if (idx === -1) return;
    const target = idx + direction;
    if (target < 0 || target >= cols.length) return;
    const prev = cols[target - 1]?.order ?? null;
    const next = cols[target + (direction === -1 ? 1 : -1)]?.order ?? null;
    // Compute a new order that lands between target's neighbors after swap.
    const newOrder =
      direction === -1
        ? fractionalOrder(prev, cols[target].order)
        : fractionalOrder(cols[target].order, next);
    await dispatch({
      type: "REORDER_COLUMN",
      boardId: board.id,
      columnId,
      newOrder,
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    const task = boardTasks.find((t) => t.id === id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    if (!board) return;
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const moving = boardTasks.find((t) => t.id === activeId);
    if (!moving) return;

    // Determine the target column id.
    let targetColumnId: string;
    if (overId.startsWith("column:")) {
      targetColumnId = overId.slice("column:".length);
    } else {
      const overTask = boardTasks.find((t) => t.id === overId);
      if (!overTask) return;
      targetColumnId = overTask.columnId;
    }

    // Compute fractional order in the target column.
    const targetColTasks = tasksInColumn(boardTasks, targetColumnId).filter(
      (t) => t.id !== activeId,
    );

    let newOrder: number;
    if (overId.startsWith("column:") || targetColTasks.length === 0) {
      const last = targetColTasks[targetColTasks.length - 1]?.order ?? null;
      newOrder = fractionalOrder(last, null);
    } else {
      const overIdx = targetColTasks.findIndex((t) => t.id === overId);
      if (overIdx === -1) {
        const last = targetColTasks[targetColTasks.length - 1]?.order ?? null;
        newOrder = fractionalOrder(last, null);
      } else {
        // Drop above the over-task by default (mirrors typical kanban UX).
        const prev = targetColTasks[overIdx - 1]?.order ?? null;
        const next = targetColTasks[overIdx].order;
        newOrder = fractionalOrder(prev, next);
      }
    }

    if (
      moving.columnId === targetColumnId &&
      Math.abs(moving.order - newOrder) < 1e-9
    ) {
      return;
    }

    // Optimistically reflect the move before the IPC round-trip lands.
    setTaskOverrides((prev) =>
      new Map(prev).set(activeId, { columnId: targetColumnId, order: newOrder }),
    );

    await dispatch({
      type: "MOVE_TASK",
      taskId: activeId,
      targetColumnId,
      newOrder,
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const viewSwitcher = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted">
        <button
          type="button"
          onClick={() => setActiveTab("board")}
          className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
            activeTab === "board"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Board
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("backlog")}
          className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
            activeTab === "backlog"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Backlog
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("epics")}
          className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
            activeTab === "epics"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Epics
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sprints")}
          className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
            activeTab === "sprints"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sprints
        </button>
      </div>
      {(activeTab === "board" || activeTab === "backlog") && (
        <div className="ml-auto">
          <SprintSelector />
        </div>
      )}
    </div>
  );

  if (activeTab === "backlog") {
    return (
      <main className="flex-1 min-h-0 flex flex-col min-w-0 relative">
        {viewSwitcher}
        <BacklogList />
        {selectedTaskId && (
          <TaskDetailPanel
            open={isTaskDetailOpen}
            onClose={closeTaskDetail}
            taskId={selectedTaskId}
          />
        )}
      </main>
    );
  }

  if (activeTab === "epics") {
    return (
      <main className="flex-1 min-h-0 flex flex-col min-w-0 relative">
        {viewSwitcher}
        <EpicsView />
        {selectedTaskId && (
          <TaskDetailPanel
            open={isTaskDetailOpen}
            onClose={closeTaskDetail}
            taskId={selectedTaskId}
          />
        )}
      </main>
    );
  }

  if (activeTab === "sprints") {
    return (
      <main className="flex-1 min-h-0 flex flex-col min-w-0 relative">
        {viewSwitcher}
        <SprintsView />
        {selectedTaskId && (
          <TaskDetailPanel
            open={isTaskDetailOpen}
            onClose={closeTaskDetail}
            taskId={selectedTaskId}
          />
        )}
      </main>
    );
  }

  if (boards.length === 0) {
    return (
      <main className="flex-1 flex flex-col min-w-0">
        {viewSwitcher}
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-3">
            <p className="text-sm">No boards in this project yet.</p>
            {showNewBoardInput ? (
              <div className="flex gap-1 max-w-xs mx-auto">
                <Input
                  autoFocus
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createBoard();
                    if (e.key === "Escape") setShowNewBoardInput(false);
                  }}
                  placeholder="Board name"
                  className="h-7 text-xs"
                />
                <Button
                  size="icon-xs"
                  onClick={() => void createBoard()}
                  disabled={!newBoardName.trim()}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button onClick={() => setShowNewBoardInput(true)} size="sm">
                <Plus className="size-3.5" />
                Create board
              </Button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-0 flex flex-col min-w-0 relative">
      {viewSwitcher}

      {/* Active-sprint filter banner */}
      {activeSprint && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1 text-[11px] bg-muted/40 border-b border-border">
          <span className="text-muted-foreground">
            {showAllTasksInBoard
              ? `Showing all tasks · active sprint: ${activeSprint.name}`
              : `Filtered to active sprint · ${activeSprint.name}`}
          </span>
        </div>
      )}

      {/* Board tab bar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
        {boards.map((b) => {
          const active = b.id === activeBoardId;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBoardId(b.id)}
              className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap ${
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {b.name}
            </button>
          );
        })}
        {showNewBoardInput ? (
          <Input
            autoFocus
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            onBlur={() => void createBoard()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createBoard();
              if (e.key === "Escape") {
                setShowNewBoardInput(false);
                setNewBoardName("");
              }
            }}
            placeholder="Board name"
            className="h-7 text-xs w-32"
          />
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowNewBoardInput(true)}
            title="New board"
          >
            <Plus className="size-3.5 text-muted-foreground" />
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1">
          {board && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setBoardSettingsOpen(true)}
              title="Board settings"
            >
              <Settings className="size-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Columns */}
      {!board ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          Select a board.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-3 p-3 h-full">
              {sortByOrder(board.columns).map((col, i, arr) => (
                <BoardColumn
                  key={col.id}
                  board={board}
                  column={col}
                  tasks={boardTasks.filter((t) => t.columnId === col.id)}
                  taskTypeRegistry={taskTypeRegistry}
                  canMoveLeft={i > 0}
                  canMoveRight={i < arr.length - 1}
                  onMove={(dir) => void moveColumn(col.id, dir)}
                  activeTaskId={activeTask?.id ?? null}
                />
              ))}

              <button
                type="button"
                onClick={() => void addColumn()}
                className="shrink-0 self-start w-72 h-12 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 flex items-center justify-center gap-1.5"
              >
                <Plus className="size-3.5" />
                Add column
              </button>
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <TaskCardView
                task={activeTask}
                board={board}
                taskTypeRegistry={taskTypeRegistry}
                dragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {board && (
        <BoardSettingsModal
          open={boardSettingsOpen}
          onClose={() => setBoardSettingsOpen(false)}
          board={board}
        />
      )}

      {selectedTaskId && (
        <TaskDetailPanel
          open={isTaskDetailOpen}
          onClose={closeTaskDetail}
          taskId={selectedTaskId}
        />
      )}
    </main>
  );
}
