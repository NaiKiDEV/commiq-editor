import { useEffect, useState } from "react";
import { Plus, Play, Trash2, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Separator } from "../ui/separator";
import { useBoardsContext } from "./BoardsContext";
import { SprintSummary } from "./SprintSummary";
import type { Sprint } from "../../../shared/boards-types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCompleteSprint: (sprint: Sprint) => void;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const inDaysIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function SprintManageModal({ open, onClose, onCompleteSprint }: Props) {
  const { sprints, activeProject, dispatch, tasks } = useBoardsContext();

  if (!activeProject) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden flex flex-col max-h-[80vh] gap-0">
        <DialogHeader className="px-4 pt-3 pb-2 border-b border-border">
          <DialogTitle>Sprints · {activeProject.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          <CreateSprintForm
            projectId={activeProject.id}
            dispatch={dispatch}
          />

          <Separator />

          {sprints.length === 0 ? (
            <p className="text-xs text-muted-foreground/70 py-6 text-center">
              No sprints yet. Create one above.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sprints
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((sprint) => (
                  <SprintRow
                    key={sprint.id}
                    sprint={sprint}
                    taskCount={
                      tasks.filter((t) => t.sprintId === sprint.id).length
                    }
                    onStart={() =>
                      void dispatch({ type: "START_SPRINT", sprintId: sprint.id })
                    }
                    onComplete={() => onCompleteSprint(sprint)}
                    onDelete={() =>
                      void dispatch({
                        type: "UPDATE_SPRINT",
                        sprintId: sprint.id,
                        patch: { status: "completed" },
                      })
                    }
                    onPatch={(patch) =>
                      void dispatch({
                        type: "UPDATE_SPRINT",
                        sprintId: sprint.id,
                        patch,
                      })
                    }
                  />
                ))}
            </ul>
          )}
        </div>

        <DialogFooter className="m-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSprintForm({
  projectId,
  dispatch,
}: {
  projectId: string;
  dispatch: ReturnType<typeof useBoardsContext>["dispatch"];
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(inDaysIso(14));

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || !startDate || !endDate) return;
    await dispatch({
      type: "CREATE_SPRINT",
      projectId,
      name: trimmed,
      goal: goal.trim() || undefined,
      startDate,
      endDate,
    });
    setName("");
    setGoal("");
    setStartDate(todayIso());
    setEndDate(inDaysIso(14));
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-md border border-border bg-muted/30">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        New sprint
      </span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sprint name (e.g. Sprint 24)"
        className="h-7 text-xs"
      />
      <Textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={2}
        placeholder="Sprint goal (optional)"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Start</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">End</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>
      <Button
        onClick={() => void submit()}
        disabled={!name.trim() || !startDate || !endDate}
        size="sm"
        className="self-start gap-1.5"
      >
        <Plus className="size-3.5" />
        Create sprint
      </Button>
    </div>
  );
}

function SprintRow({
  sprint,
  taskCount,
  onStart,
  onComplete,
  onDelete,
  onPatch,
}: {
  sprint: Sprint;
  taskCount: number;
  onStart: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<Sprint>) => void;
}) {
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [start, setStart] = useState(sprint.startDate.slice(0, 10));
  const [end, setEnd] = useState(sprint.endDate.slice(0, 10));

  useEffect(() => {
    setName(sprint.name);
    setGoal(sprint.goal ?? "");
    setStart(sprint.startDate.slice(0, 10));
    setEnd(sprint.endDate.slice(0, 10));
  }, [sprint.id, sprint.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusClass =
    sprint.status === "active"
      ? "bg-green-500/20 text-green-400 border-green-500/30"
      : sprint.status === "completed"
        ? "bg-slate-500/20 text-slate-400 border-slate-500/30"
        : "bg-blue-500/20 text-blue-400 border-blue-500/30";

  return (
    <li className="flex flex-col gap-2 p-3 rounded-md border border-border bg-card/40">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== sprint.name && onPatch({ name: name.trim() })}
          className="h-7 text-xs flex-1"
        />
        <span
          className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded-full border ${statusClass}`}
        >
          {sprint.status}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {taskCount} tasks
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            onPatch({ startDate: e.target.value });
          }}
          className="h-7 text-xs"
        />
        <Input
          type="date"
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
            onPatch({ endDate: e.target.value });
          }}
          className="h-7 text-xs"
        />
      </div>

      <Textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onBlur={() => goal !== (sprint.goal ?? "") && onPatch({ goal })}
        rows={2}
        placeholder="Sprint goal"
      />

      {sprint.status === "completed" && sprint.velocity && (
        <SprintSummary velocity={sprint.velocity} />
      )}

      <div className="flex gap-1">
        {sprint.status === "planning" && (
          <Button size="sm" onClick={onStart} className="gap-1.5">
            <Play className="size-3.5" />
            Start sprint
          </Button>
        )}
        {sprint.status === "active" && (
          <Button size="sm" onClick={onComplete} className="gap-1.5">
            <CheckCircle2 className="size-3.5" />
            Complete sprint
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive gap-1.5 ml-auto"
          title="Archive sprint (status: completed)"
        >
          <Trash2 className="size-3.5" />
          Archive
        </Button>
      </div>
    </li>
  );
}
