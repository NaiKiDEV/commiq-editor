import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useBoardsContext } from "./BoardsContext";
import {
  BacklogRow,
  BacklogRowHeader,
  type SortDir,
  type SortKey,
} from "./BacklogRow";
import { QuickCreateBacklogTask } from "./QuickCreateBacklogTask";
import {
  PRIORITY_RANK,
  fractionalOrder,
} from "./shared";
import type { Sprint, Task } from "../../../shared/boards-types";

type Section = {
  id: string; // 'unassigned' | sprintId
  label: string;
  sprint: Sprint | null;
  collapsible: boolean;
};

export function BacklogList() {
  const { tasks, sprints, epics, taskTypeRegistry, dispatch } =
    useBoardsContext();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("manual");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);

  // Optimistic per-task overrides for in-flight backlog moves.
  const [taskOverrides, setTaskOverrides] = useState<
    Map<string, { sprintId: string | undefined; backlogOrder: number }>
  >(new Map());

  useEffect(() => {
    if (taskOverrides.size === 0) return;
    setTaskOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, ovr] of prev) {
        const t = tasks.find((x) => x.id === id);
        if (
          t &&
          (t.sprintId ?? undefined) === ovr.sprintId &&
          Math.abs(t.backlogOrder - ovr.backlogOrder) < 1e-9
        ) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks, taskOverrides]);

  const effectiveTasks = useMemo(() => {
    if (taskOverrides.size === 0) return tasks;
    return tasks.map((t) => {
      const ovr = taskOverrides.get(t.id);
      return ovr
        ? { ...t, sprintId: ovr.sprintId, backlogOrder: ovr.backlogOrder }
        : t;
    });
  }, [tasks, taskOverrides]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Build sections: unassigned first, then sprints in created-desc order.
  const sections = useMemo<Section[]>(() => {
    const sorted = sprints
      .slice()
      .sort((a, b) => {
        // active first, then planning, then completed; tiebreak by createdAt desc
        const rank = (s: Sprint) =>
          s.status === "active" ? 0 : s.status === "planning" ? 1 : 2;
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return b.createdAt.localeCompare(a.createdAt);
      });
    return [
      {
        id: "unassigned",
        label: "Backlog (unassigned)",
        sprint: null,
        collapsible: true,
      },
      ...sorted.map<Section>((s) => ({
        id: s.id,
        label: `${s.name} · ${s.status}`,
        sprint: s,
        collapsible: true,
      })),
    ];
  }, [sprints]);

  // Group + sort tasks per section.
  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const s of sections) map.set(s.id, []);
    for (const t of effectiveTasks) {
      const key = t.sprintId ?? "unassigned";
      const bucket = map.get(key);
      if (bucket) bucket.push(t);
      // If a task references a sprint we don't have (shouldn't happen),
      // surface it under unassigned so it isn't hidden.
      else map.get("unassigned")?.push(t);
    }
    if (sortKey !== "manual") {
      for (const list of map.values()) sortInPlace(list, sortKey, sortDir, epics, sprints);
    } else {
      for (const list of map.values()) {
        list.sort((a, b) => a.backlogOrder - b.backlogOrder);
      }
    }
    return map;
  }, [effectiveTasks, sections, sortKey, sortDir, epics, sprints]);

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (taskId: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ─── DnD ────────────────────────────────────────────────────────────────

  const findSectionOfTask = (taskId: string): string | null => {
    const t = effectiveTasks.find((x) => x.id === taskId);
    if (!t) return null;
    return t.sprintId ?? "unassigned";
  };

  const handleDragStart = (e: DragStartEvent) => {
    const task = effectiveTasks.find((t) => t.id === (e.active.id as string));
    if (task) setActiveDragTask(task);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDragTask(null);
    if (sortKey !== "manual") {
      // Manual reorder only makes sense without column-based sort. Snap back
      // to manual sort so the new order shows immediately.
      setSortKey("manual");
    }
    const { active, over } = e;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const moving = effectiveTasks.find((t) => t.id === activeId);
    if (!moving) return;

    // Determine target section.
    let targetSectionId: string;
    if (overId.startsWith("section:")) {
      targetSectionId = overId.slice("section:".length);
    } else {
      const overSection = findSectionOfTask(overId);
      if (!overSection) return;
      targetSectionId = overSection;
    }

    const targetTasks = (grouped.get(targetSectionId) ?? []).filter(
      (t) => t.id !== activeId,
    );

    let newOrder: number;
    if (overId.startsWith("section:") || targetTasks.length === 0) {
      const last =
        targetTasks[targetTasks.length - 1]?.backlogOrder ?? null;
      newOrder = fractionalOrder(last, null);
    } else {
      const overIdx = targetTasks.findIndex((t) => t.id === overId);
      if (overIdx === -1) {
        const last =
          targetTasks[targetTasks.length - 1]?.backlogOrder ?? null;
        newOrder = fractionalOrder(last, null);
      } else {
        const prev = targetTasks[overIdx - 1]?.backlogOrder ?? null;
        const next = targetTasks[overIdx].backlogOrder;
        newOrder = fractionalOrder(prev, next);
      }
    }

    const targetSprintId =
      targetSectionId === "unassigned" ? undefined : targetSectionId;

    // Skip the dispatch if nothing actually changes.
    if (
      moving.backlogOrder === newOrder &&
      (moving.sprintId ?? undefined) === targetSprintId
    ) {
      return;
    }

    setTaskOverrides((prev) =>
      new Map(prev).set(activeId, {
        sprintId: targetSprintId,
        backlogOrder: newOrder,
      }),
    );

    await dispatch({
      type: "UPDATE_TASK",
      taskId: activeId,
      patch: {
        backlogOrder: newOrder,
        sprintId: targetSprintId,
      },
    });
  };

  // ─── Bulk actions ───────────────────────────────────────────────────────

  const bulkMoveTo = async (sprintId: string | undefined) => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await dispatch({
        type: "UPDATE_TASK",
        taskId: id,
        patch: { sprintId },
      });
    }
    clearSelection();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await dispatch({ type: "DELETE_TASK", taskId: id });
    }
    clearSelection();
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <BacklogRowHeader
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragTask(null)}
        >
          {sections.map((section) => {
            const sectionTasks = grouped.get(section.id) ?? [];
            const isCollapsed = collapsed.has(section.id);
            return (
              <BacklogSection
                key={section.id}
                section={section}
                tasks={sectionTasks}
                collapsed={isCollapsed}
                onToggleCollapsed={() => toggleCollapsed(section.id)}
                onStartSprint={
                  section.sprint?.status === "planning"
                    ? () =>
                        void dispatch({
                          type: "START_SPRINT",
                          sprintId: section.sprint!.id,
                        })
                    : undefined
                }
                selected={selected}
                onToggleSelect={toggleSelect}
                registry={taskTypeRegistry}
                epics={epics}
                activeDragTaskId={activeDragTask?.id ?? null}
              />
            );
          })}

          <DragOverlay dropAnimation={null}>
            {activeDragTask ? (
              <div className="px-2 py-1.5 rounded-md bg-card border border-foreground/30 shadow-lg text-xs">
                {activeDragTask.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/50 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" />}
            >
              Move to…
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Sprint</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void bulkMoveTo(undefined)}>
                Backlog (unassigned)
              </DropdownMenuItem>
              {sprints
                .filter((s) => s.status !== "completed")
                .map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => void bulkMoveTo(s.id)}
                  >
                    {s.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void bulkDelete()}
            className="text-destructive gap-1.5"
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="ml-auto gap-1.5"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Section sub-component ────────────────────────────────────────────────

type SectionProps = {
  section: Section;
  tasks: Task[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onStartSprint?: () => void;
  selected: Set<string>;
  onToggleSelect: (taskId: string, on: boolean) => void;
  registry: import("../../../shared/boards-types").TaskTypeConfig[];
  epics: import("../../../shared/boards-types").Epic[];
  activeDragTaskId: string | null;
};

function BacklogSection({
  section,
  tasks,
  collapsed,
  onToggleCollapsed,
  onStartSprint,
  selected,
  onToggleSelect,
  registry,
  epics,
  activeDragTaskId,
}: SectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section:${section.id}`,
    data: { type: "section", sectionId: section.id },
  });

  const totalPoints = tasks.reduce(
    (sum, t) => sum + (t.storyPoints ?? 0),
    0,
  );

  const statusBadge =
    section.sprint?.status === "active"
      ? "bg-green-500/20 text-green-400"
      : section.sprint?.status === "planning"
        ? "bg-blue-500/20 text-blue-400"
        : "bg-muted text-muted-foreground";

  return (
    <section className="border-b border-border last:border-b-0">
      <header className="flex items-center gap-2 px-3 py-2 bg-muted/20">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
        <span className="text-xs font-medium">{section.label}</span>
        <span className={`px-1.5 py-0.5 text-[9px] rounded-full ${statusBadge}`}>
          {tasks.length} · {totalPoints} pts
        </span>
        {section.sprint?.goal && (
          <span className="text-[11px] text-muted-foreground truncate hidden md:inline">
            {section.sprint.goal}
          </span>
        )}
        {onStartSprint && (
          <Button
            variant="outline"
            size="sm"
            onClick={onStartSprint}
            className="ml-auto"
          >
            Start sprint
          </Button>
        )}
      </header>

      {!collapsed && (
        <div
          ref={setNodeRef}
          className={`min-h-8 py-1 ${isOver ? "bg-muted/40" : ""}`}
        >
          <SortableContext
            id={section.id}
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => (
              <BacklogRow
                key={task.id}
                task={task}
                selected={selected.has(task.id)}
                onToggleSelect={(on) => onToggleSelect(task.id, on)}
                registry={registry}
                epics={epics}
                isPlaceholder={activeDragTaskId === task.id}
              />
            ))}
          </SortableContext>
          {tasks.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground/60 italic">
              {section.id === "unassigned"
                ? "No unscheduled tasks."
                : "No tasks in this sprint yet — drag tasks here, or add one below."}
            </div>
          )}
          <QuickCreateBacklogTask
            sprintId={section.sprint?.id}
          />
        </div>
      )}
    </section>
  );
}

// ─── Sort helpers ────────────────────────────────────────────────────────

function sortInPlace(
  list: Task[],
  key: SortKey,
  dir: SortDir,
  epics: import("../../../shared/boards-types").Epic[],
  sprints: import("../../../shared/boards-types").Sprint[],
): void {
  const sign = dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    switch (key) {
      case "title":
        return a.title.localeCompare(b.title) * sign;
      case "type":
        return a.type.localeCompare(b.type) * sign;
      case "priority":
        return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * sign;
      case "storyPoints":
        return ((a.storyPoints ?? -1) - (b.storyPoints ?? -1)) * sign;
      case "createdAt":
        return a.createdAt.localeCompare(b.createdAt) * sign;
      case "epic": {
        const ae = epics.find((e) => e.id === a.epicId)?.name ?? "";
        const be = epics.find((e) => e.id === b.epicId)?.name ?? "";
        return ae.localeCompare(be) * sign;
      }
      case "sprint": {
        const as = sprints.find((s) => s.id === a.sprintId)?.name ?? "";
        const bs = sprints.find((s) => s.id === b.sprintId)?.name ?? "";
        return as.localeCompare(bs) * sign;
      }
      default:
        return a.backlogOrder - b.backlogOrder;
    }
  });
}
