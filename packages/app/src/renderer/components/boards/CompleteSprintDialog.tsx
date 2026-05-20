import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useBoardsContext } from "./BoardsContext";
import type { Sprint } from "../../../shared/boards-types";

type Resolution =
  | { kind: "backlog" }
  | { kind: "keep" }
  | { kind: "moveToSprint"; sprintId: string };

type Props = {
  open: boolean;
  onClose: () => void;
  sprint: Sprint;
};

export function CompleteSprintDialog({ open, onClose, sprint }: Props) {
  const { tasks, sprints, dispatch } = useBoardsContext();

  const sprintTasks = useMemo(
    () => tasks.filter((t) => t.sprintId === sprint.id),
    [tasks, sprint.id],
  );

  const doneTasks = sprintTasks.filter(
    (t) => t.status.toLowerCase() === "done",
  );
  const unfinishedTasks = sprintTasks.filter(
    (t) => t.status.toLowerCase() !== "done",
  );

  const committed = sprintTasks.reduce(
    (sum, t) => sum + (t.storyPoints ?? 0),
    0,
  );
  const completed = doneTasks.reduce(
    (sum, t) => sum + (t.storyPoints ?? 0),
    0,
  );

  const otherSprints = sprints.filter(
    (s) => s.id !== sprint.id && s.status !== "completed",
  );

  const [resolution, setResolution] = useState<Resolution>(
    unfinishedTasks.length === 0
      ? { kind: "keep" }
      : { kind: "backlog" },
  );

  const confirm = async () => {
    let unfinishedTasksPayload:
      | "backlog"
      | "keep"
      | { moveToSprintId: string };
    if (resolution.kind === "moveToSprint") {
      unfinishedTasksPayload = { moveToSprintId: resolution.sprintId };
    } else {
      unfinishedTasksPayload = resolution.kind;
    }
    await dispatch({
      type: "COMPLETE_SPRINT",
      sprintId: sprint.id,
      unfinishedTasks: unfinishedTasksPayload,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="px-4 pt-3 pb-2 border-b border-border">
          <DialogTitle>Complete {sprint.name}?</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm px-4 py-3">
          {/* Progress summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Committed" value={`${committed}`} suffix="pts" />
            <Stat
              label="Completed"
              value={`${completed}`}
              suffix="pts"
              accent="text-green-400"
            />
            <Stat
              label="Tasks done"
              value={`${doneTasks.length} / ${sprintTasks.length}`}
            />
          </div>

          {unfinishedTasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {unfinishedTasks.length} unfinished task
                {unfinishedTasks.length === 1 ? "" : "s"} — where should
                they go?
              </span>
              <div className="flex flex-col gap-1">
                <ResolutionOption
                  active={resolution.kind === "backlog"}
                  onClick={() => setResolution({ kind: "backlog" })}
                  title="Move to backlog"
                  description="Clear the sprint assignment — tasks become unscheduled."
                />
                <ResolutionOption
                  active={resolution.kind === "keep"}
                  onClick={() => setResolution({ kind: "keep" })}
                  title="Keep in this sprint"
                  description="Leave them attached to the now-completed sprint for historical reference."
                />
                {otherSprints.length > 0 && (
                  <div
                    className={`flex flex-col gap-1.5 p-2 rounded-md border ${
                      resolution.kind === "moveToSprint"
                        ? "border-foreground bg-muted/50"
                        : "border-border/60 hover:bg-muted/30"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setResolution({
                          kind: "moveToSprint",
                          sprintId: otherSprints[0].id,
                        })
                      }
                      className="text-xs font-medium text-left"
                    >
                      Move to another sprint
                    </button>
                    {resolution.kind === "moveToSprint" && (
                      <select
                        value={resolution.sprintId}
                        onChange={(e) =>
                          setResolution({
                            kind: "moveToSprint",
                            sprintId: e.target.value,
                          })
                        }
                        className="h-7 text-xs rounded-md border border-input bg-background px-2"
                      >
                        {otherSprints.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.status})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="m-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()}>Complete sprint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-2 rounded-md bg-muted/40">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`text-lg font-semibold ${accent ?? ""}`}>
        {value}
        {suffix && (
          <span className="text-xs text-muted-foreground ml-0.5">{suffix}</span>
        )}
      </span>
    </div>
  );
}

function ResolutionOption({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-2 rounded-md border transition-colors ${
        active
          ? "border-foreground bg-muted/50"
          : "border-border/60 hover:bg-muted/30"
      }`}
    >
      <div className="text-xs font-medium">{title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {description}
      </div>
    </button>
  );
}
