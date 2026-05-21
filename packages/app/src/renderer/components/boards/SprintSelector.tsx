import { useState } from "react";
import { CalendarDays, Eye, EyeOff, Settings2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { useBoardsContext } from "./BoardsContext";
import { CompleteSprintDialog } from "./CompleteSprintDialog";
import type { Sprint } from "../../../shared/boards-types";

export function SprintSelector() {
  const {
    sprints,
    activeSprint,
    showAllTasksInBoard,
    setShowAllTasksInBoard,
    setActiveTab,
    dispatch,
  } = useBoardsContext();

  const [completeTarget, setCompleteTarget] = useState<Sprint | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const planning = sprints.filter((s) => s.status === "planning");

  const close = () => setPopoverOpen(false);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          render={<Button variant="outline" size="sm" className="gap-1.5" />}
        >
          <CalendarDays className="size-3.5" />
          {activeSprint ? (
            <span className="truncate max-w-[10rem]">{activeSprint.name}</span>
          ) : (
            <span className="text-muted-foreground">No active sprint</span>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="w-72 p-2 flex flex-col gap-1"
        >
          <SectionLabel>Active sprint</SectionLabel>
          {activeSprint ? (
            <div className="px-2 py-1.5 text-xs flex flex-col gap-0.5">
              <span className="font-medium">{activeSprint.name}</span>
              {activeSprint.goal && (
                <span className="text-muted-foreground truncate">
                  {activeSprint.goal}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {fmt(activeSprint.startDate)} → {fmt(activeSprint.endDate)}
              </span>
            </div>
          ) : (
            <div className="px-2 py-1.5 text-xs text-muted-foreground/70">
              No sprint is currently active.
            </div>
          )}

          {activeSprint && (
            <>
              <MenuButton
                onClick={() => {
                  close();
                  setCompleteTarget(activeSprint);
                }}
              >
                Complete sprint…
              </MenuButton>
              <MenuButton
                onClick={() => {
                  setShowAllTasksInBoard(!showAllTasksInBoard);
                  close();
                }}
              >
                {showAllTasksInBoard ? (
                  <>
                    <EyeOff className="size-3.5" />
                    Filter board to sprint
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    Show all tasks on board
                  </>
                )}
              </MenuButton>
            </>
          )}

          {planning.length > 0 && (
            <>
              <Divider />
              <SectionLabel>Start a planning sprint</SectionLabel>
              {planning.map((s) => (
                <MenuButton
                  key={s.id}
                  onClick={() => {
                    void dispatch({ type: "START_SPRINT", sprintId: s.id });
                    close();
                  }}
                >
                  <span className="truncate">{s.name}</span>
                </MenuButton>
              ))}
            </>
          )}

          <Divider />
          <MenuButton
            onClick={() => {
              close();
              setActiveTab("sprints");
            }}
          >
            <Settings2 className="size-3.5" />
            Manage sprints…
          </MenuButton>
        </PopoverContent>
      </Popover>

      {completeTarget && (
        <CompleteSprintDialog
          open={completeTarget !== null}
          onClose={() => setCompleteTarget(null)}
          sprint={completeTarget}
        />
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="h-px bg-border -mx-2 my-1" />;
}

function MenuButton({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-xs hover:bg-muted ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
