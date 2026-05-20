import { SquareKanban } from "lucide-react";
import { BoardsProvider, useBoardsContext } from "./boards/BoardsContext";
import { ProjectHeader } from "./boards/ProjectHeader";
import { BoardView } from "./boards/BoardView";

export function BoardsPanel({ panelId: _panelId }: { panelId: string }) {
  return (
    <BoardsProvider>
      <BoardsShell />
    </BoardsProvider>
  );
}

function BoardsShell() {
  const { loading, activeProjectId, projects } = useBoardsContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground text-sm">
        Loading boards…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm relative">
      <ProjectHeader />
      {activeProjectId ? (
        <BoardView />
      ) : (
        <main className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <SquareKanban className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm">
              {projects.length === 0
                ? "Create your first project from the picker above"
                : "Select a project from the picker above"}
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
