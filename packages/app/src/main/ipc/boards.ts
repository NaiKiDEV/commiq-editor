import { BrowserWindow, ipcMain } from "electron";
import type {
  Board,
  BoardsAction,
  Epic,
  Project,
  Sprint,
  Task,
  TaskTypeConfig,
} from "../../shared/boards-types";
import { getBoardsState } from "../boards/state";
import {
  startBoardsMcp,
  stopBoardsMcp,
  getBoardsMcpStatus,
} from "../boards/mcp-server";

export function registerBoardsIpc(): void {
  const state = getBoardsState();

  // ─── Queries ─────────────────────────────────────────────────────────────
  ipcMain.handle("boards:list-projects", () => state.listProjects());
  ipcMain.handle(
    "boards:get-project",
    (_e, projectId: string): Project | null => state.getProject(projectId),
  );
  ipcMain.handle(
    "boards:get-project-bundle",
    (_e, projectId: string) => state.getProjectBundle(projectId),
  );
  ipcMain.handle("boards:list-boards", (_e, projectId: string) =>
    state.listBoards(projectId),
  );
  ipcMain.handle(
    "boards:get-board",
    (_e, boardId: string): Board | null => state.getBoard(boardId),
  );
  ipcMain.handle("boards:list-tasks", (_e, boardId: string): Task[] =>
    state.listTasks(boardId),
  );
  ipcMain.handle(
    "boards:get-task",
    (_e, taskId: string): Task | null => state.getTask(taskId),
  );
  ipcMain.handle("boards:list-sprints", (_e, projectId: string): Sprint[] =>
    state.listSprints(projectId),
  );
  ipcMain.handle("boards:list-epics", (_e, projectId: string): Epic[] =>
    state.listEpics(projectId),
  );
  ipcMain.handle(
    "boards:task-type-registry",
    (): TaskTypeConfig[] => state.getTaskTypeRegistry(),
  );

  // Undo / Redo
  ipcMain.handle("boards:undo", (_e, boardId: string) => state.undo(boardId));
  ipcMain.handle("boards:redo", (_e, boardId: string) => state.redo(boardId));
  ipcMain.handle("boards:can-undo", (_e, boardId: string) =>
    state.canUndo(boardId),
  );
  ipcMain.handle("boards:can-redo", (_e, boardId: string) =>
    state.canRedo(boardId),
  );

  // ─── Mutations (single dispatch channel) ─────────────────────────────────
  ipcMain.handle("boards:dispatch", (_e, action: BoardsAction) =>
    state.dispatch(action),
  );

  // ─── MCP server lifecycle ────────────────────────────────────────────────
  ipcMain.handle("boards:start-mcp-server", (_e, port: number) =>
    startBoardsMcp(port),
  );
  ipcMain.handle("boards:stop-mcp-server", () => stopBoardsMcp());
  ipcMain.handle("boards:mcp-status", () => getBoardsMcpStatus());
}

export function stopBoardsMcpServer(): void {
  stopBoardsMcp().catch(() => {});
}

export function registerBoardsPush(mainWindow: BrowserWindow): void {
  const state = getBoardsState();
  const send = (channel: string, payload: unknown) => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
  };

  state.on("project-changed", (payload) =>
    send("boards:project-changed", payload),
  );
  state.on("board-changed", (payload) =>
    send("boards:board-changed", payload),
  );
  state.on("tasks-changed", (payload) =>
    send("boards:tasks-changed", payload),
  );
  state.on("sprints-changed", (payload) =>
    send("boards:sprints-changed", payload),
  );
  state.on("epics-changed", (payload) =>
    send("boards:epics-changed", payload),
  );
}
