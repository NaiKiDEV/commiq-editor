import { ipcMain, BrowserWindow } from 'electron';
import { whiteboardState } from '../whiteboard/state';
import type { StickyColor } from '../../shared/whiteboard-types';
import {
  startMcpServer,
  stopMcpServer,
  getMcpStatus,
} from '../whiteboard/mcp-server';

export function registerWhiteboardIpc(): void {
  // Board CRUD
  ipcMain.handle('whiteboard:list-boards', () =>
    whiteboardState.listBoards(),
  );
  ipcMain.handle('whiteboard:get-board', (_e, boardId: string) =>
    whiteboardState.getBoard(boardId),
  );
  ipcMain.handle(
    'whiteboard:create-board',
    (_e, name: string, workspaceId: string | null) =>
      whiteboardState.createBoard(name, workspaceId),
  );
  ipcMain.handle('whiteboard:delete-board', (_e, boardId: string) =>
    whiteboardState.deleteBoard(boardId),
  );
  ipcMain.handle(
    'whiteboard:update-board',
    (
      _e,
      boardId: string,
      patch: {
        name?: string;
        viewport?: { x: number; y: number; zoom: number };
      },
    ) => whiteboardState.updateBoard(boardId, patch),
  );

  // Sticky CRUD
  ipcMain.handle(
    'whiteboard:create-sticky',
    (
      _e,
      boardId: string,
      data: {
        text?: string;
        color?: StickyColor;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        metadata?: Record<string, string>;
      },
    ) => whiteboardState.createSticky(boardId, data),
  );
  ipcMain.handle(
    'whiteboard:update-sticky',
    (
      _e,
      boardId: string,
      stickyId: string,
      patch: Record<string, unknown>,
    ) => whiteboardState.updateSticky(boardId, stickyId, patch),
  );
  ipcMain.handle(
    'whiteboard:delete-sticky',
    (_e, boardId: string, stickyId: string) =>
      whiteboardState.deleteSticky(boardId, stickyId),
  );

  // Frame CRUD
  ipcMain.handle(
    'whiteboard:create-frame',
    (
      _e,
      boardId: string,
      data: {
        label: string;
        x: number;
        y: number;
        width: number;
        height: number;
        color?: string;
      },
    ) => whiteboardState.createFrame(boardId, data),
  );
  ipcMain.handle(
    'whiteboard:update-frame',
    (
      _e,
      boardId: string,
      frameId: string,
      patch: Record<string, unknown>,
    ) => whiteboardState.updateFrame(boardId, frameId, patch),
  );
  ipcMain.handle(
    'whiteboard:delete-frame',
    (_e, boardId: string, frameId: string) =>
      whiteboardState.deleteFrame(boardId, frameId),
  );

  // Connection CRUD
  ipcMain.handle(
    'whiteboard:connect',
    (
      _e,
      boardId: string,
      fromStickyId: string,
      toStickyId: string,
      label?: string,
    ) => whiteboardState.connect(boardId, fromStickyId, toStickyId, label),
  );
  ipcMain.handle(
    'whiteboard:update-connection',
    (
      _e,
      boardId: string,
      connectionId: string,
      patch: { label?: string },
    ) => whiteboardState.updateConnection(boardId, connectionId, patch),
  );
  ipcMain.handle(
    'whiteboard:disconnect',
    (_e, boardId: string, connectionId: string) =>
      whiteboardState.disconnect(boardId, connectionId),
  );

  // MCP server
  ipcMain.handle('whiteboard:start-mcp-server', (_e, port: number) =>
    startMcpServer(port),
  );
  ipcMain.handle('whiteboard:stop-mcp-server', () => stopMcpServer());
  ipcMain.handle('whiteboard:mcp-status', () => getMcpStatus());
}

export function registerWhiteboardPush(mainWindow: BrowserWindow): void {
  whiteboardState.on('board-changed', (board) => {
    mainWindow.webContents.send('whiteboard:board-changed', board);
  });
  whiteboardState.on('board-deleted', (boardId) => {
    mainWindow.webContents.send('whiteboard:board-deleted', boardId);
  });
}
