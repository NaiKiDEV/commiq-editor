import { useMemo } from "react";
import { ArrowRight, Ban, CircleCheck, ListChecks } from "lucide-react";
import { useBoardsContext } from "./BoardsContext";
import { resolveIcon } from "./shared";
import { cn } from "@/lib/utils";
import type { Task } from "../../../shared/boards-types";

const isDone = (status: string) => status.toLowerCase() === "done";

export function BlockersView() {
  const { tasks, taskTypeRegistry, boards, openTaskDetail } = useBoardsContext();

  const byId = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  // Reverse edges: blockerId → tasks that it blocks.
  const blocks = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of tasks) {
      for (const b of t.blockedBy ?? []) {
        m.set(b, [...(m.get(b) ?? []), t.id]);
      }
    }
    return m;
  }, [tasks]);

  const blockedTasks = useMemo(
    () =>
      tasks
        .filter((t) => (t.blockedBy?.length ?? 0) > 0)
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [tasks],
  );

  const blockedCount = blockedTasks.filter(
    (t) =>
      !isDone(t.status) &&
      (t.blockedBy ?? []).some((id) => {
        const bt = byId.get(id);
        return bt ? !isDone(bt.status) : false;
      }),
  ).length;

  const boardName = (boardId: string) =>
    boards.find((b) => b.id === boardId)?.name ?? "—";

  if (blockedTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2 max-w-sm px-6">
          <ListChecks className="size-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm">No blocked tasks in this project.</p>
          <p className="text-xs text-muted-foreground/70">
            Open any task and use “Blocked by” to record a dependency. It will
            show up here as a map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Summary bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 border-b border-border bg-background/95 backdrop-blur text-xs">
        <span className="inline-flex items-center gap-1.5 text-amber-500">
          <Ban className="size-3.5" />
          {blockedCount} blocked
        </span>
        <span className="inline-flex items-center gap-1.5 text-emerald-500">
          <CircleCheck className="size-3.5" />
          {blockedTasks.length - blockedCount} ready
        </span>
        <span className="text-muted-foreground/70">
          {blockedTasks.length} task{blockedTasks.length === 1 ? "" : "s"} with
          dependencies
        </span>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {blockedTasks.map((task) => {
          const blockers = (task.blockedBy ?? [])
            .map((id) => byId.get(id))
            .filter((t): t is Task => Boolean(t));
          const unresolved = blockers.filter((b) => !isDone(b.status));
          const ready = isDone(task.status) || unresolved.length === 0;
          const typeConfig = taskTypeRegistry.find((t) => t.key === task.type);
          const TypeIcon = resolveIcon(typeConfig?.icon ?? "CheckSquare");
          const downstream = blocks.get(task.id)?.length ?? 0;

          return (
            <div
              key={task.id}
              className={cn(
                "rounded-lg border bg-card px-3 py-2.5",
                ready ? "border-border" : "border-amber-500/40",
              )}
            >
              {/* Blocked task header */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="shrink-0"
                  style={{ color: typeConfig?.color ?? "currentColor" }}
                  title={typeConfig?.label ?? task.type}
                >
                  <TypeIcon className="size-3.5" />
                </span>
                {task.number !== undefined && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    #{task.number}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openTaskDetail(task.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
                  title={task.title}
                >
                  {task.title}
                </button>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {boardName(task.boardId)} · {task.status}
                </span>
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                    ready
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-amber-500/15 text-amber-500",
                  )}
                >
                  {ready ? (
                    <>
                      <CircleCheck className="size-2.5" />
                      Ready
                    </>
                  ) : (
                    <>
                      <Ban className="size-2.5" />
                      Blocked
                    </>
                  )}
                </span>
              </div>

              {/* Dependency edges */}
              <div className="mt-2 flex flex-col gap-1 pl-1">
                {blockers.map((b) => {
                  const done = isDone(b.status);
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 text-xs min-w-0"
                    >
                      <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          done ? "bg-emerald-500" : "bg-amber-500",
                        )}
                      />
                      {b.number !== undefined && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          #{b.number}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openTaskDetail(b.id)}
                        className={cn(
                          "min-w-0 flex-1 truncate text-left hover:underline",
                          done
                            ? "text-muted-foreground line-through"
                            : "text-foreground/90",
                        )}
                        title={b.title}
                      >
                        {b.title}
                      </button>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {b.status}
                      </span>
                    </div>
                  );
                })}
              </div>

              {downstream > 0 && (
                <p className="mt-1.5 pl-1 text-[10px] text-muted-foreground/70">
                  Blocks {downstream} other task{downstream === 1 ? "" : "s"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
