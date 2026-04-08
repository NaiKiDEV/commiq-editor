import { EventEmitter } from "events";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type {
  Board,
  BoardSummary,
  Sticky,
  Frame,
  Connection,
  TextNode,
  StickyColor,
} from "../../shared/whiteboard-types";

const SAVE_DEBOUNCE_MS = 1500;
const VIEWPORT_SAVE_DEBOUNCE_MS = 3000;
const MAX_UNDO_STACK = 50;

export class WhiteboardStateManager extends EventEmitter {
  private boards = new Map<string, Board>();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private viewportSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private storageDir: string;
  /** Undo stack per board — stores deep copies of board state */
  private undoStacks = new Map<string, string[]>();
  /** Redo stack per board */
  private redoStacks = new Map<string, string[]>();

  constructor() {
    super();
    this.storageDir = path.join(app.getPath("userData"), "whiteboard");
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.loadAll();
  }

  listBoards(): BoardSummary[] {
    return Array.from(this.boards.values()).map(
      ({ id, name, workspaceId, createdAt, updatedAt }) => ({
        id,
        name,
        workspaceId,
        createdAt,
        updatedAt,
      }),
    );
  }

  getBoard(boardId: string): Board | null {
    return this.boards.get(boardId) ?? null;
  }

  createBoard(name: string, workspaceId: string | null): Board {
    const now = new Date().toISOString();
    const board: Board = {
      id: randomUUID(),
      name,
      workspaceId,
      stickies: [],
      frames: [],
      connections: [],
      texts: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    };
    this.boards.set(board.id, board);
    this.scheduleSave(board.id);
    this.emit("board-changed", board);
    return board;
  }

  deleteBoard(boardId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;
    this.boards.delete(boardId);
    const filePath = this.boardFilePath(boardId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    this.emit("board-deleted", boardId);
    return true;
  }

  importBoard(data: Board): Board {
    const now = new Date().toISOString();
    const board: Board = {
      ...data,
      id: randomUUID(),
      texts: data.texts ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.boards.set(board.id, board);
    this.scheduleSave(board.id);
    this.emit("board-changed", board);
    return board;
  }

  updateBoard(
    boardId: string,
    patch: {
      name?: string;
      viewport?: { x: number; y: number; zoom: number };
      colorMeanings?: Partial<Record<StickyColor, string>>;
    },
  ): Board | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    const isViewportOnly =
      patch.viewport !== undefined &&
      patch.name === undefined &&
      patch.colorMeanings === undefined;
    if (patch.name !== undefined) board.name = patch.name;
    if (patch.viewport !== undefined) board.viewport = patch.viewport;
    if (patch.colorMeanings !== undefined)
      board.colorMeanings = patch.colorMeanings;
    if (isViewportOnly) {
      this.scheduleViewportSave(boardId);
    } else {
      board.updatedAt = new Date().toISOString();
      this.scheduleSave(boardId);
    }
    this.emit("board-changed", board);
    return board;
  }

  createSticky(
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
  ): Sticky | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    this.pushUndo(boardId);
    const now = new Date().toISOString();
    const sticky: Sticky = {
      id: randomUUID(),
      x: data.x ?? this.autoPositionX(board),
      y: data.y ?? this.autoPositionY(board),
      width: data.width ?? 200,
      height: data.height ?? 150,
      text: data.text ?? "",
      color: data.color ?? "yellow",
      frameId: null,
      metadata: data.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    // Auto-detect frame containment
    const centerX = sticky.x + sticky.width / 2;
    const centerY = sticky.y + sticky.height / 2;
    for (const frame of board.frames) {
      if (
        centerX >= frame.x &&
        centerX <= frame.x + frame.width &&
        centerY >= frame.y &&
        centerY <= frame.y + frame.height
      ) {
        sticky.frameId = frame.id;
        break;
      }
    }

    board.stickies.push(sticky);
    board.updatedAt = now;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return sticky;
  }

  updateSticky(
    boardId: string,
    stickyId: string,
    patch: Partial<
      Pick<
        Sticky,
        | "x"
        | "y"
        | "width"
        | "height"
        | "text"
        | "color"
        | "frameId"
        | "metadata"
      >
    >,
  ): Sticky | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    const sticky = board.stickies.find((s) => s.id === stickyId);
    if (!sticky) return null;
    this.pushUndo(boardId);
    Object.assign(sticky, patch, { updatedAt: new Date().toISOString() });
    board.updatedAt = sticky.updatedAt;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return sticky;
  }

  deleteSticky(boardId: string, stickyId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;
    const idx = board.stickies.findIndex((s) => s.id === stickyId);
    if (idx === -1) return false;
    this.pushUndo(boardId);
    board.stickies.splice(idx, 1);
    board.connections = board.connections.filter(
      (c) => c.fromStickyId !== stickyId && c.toStickyId !== stickyId,
    );
    board.updatedAt = new Date().toISOString();
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return true;
  }

  createFrame(
    boardId: string,
    data: {
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
      color?: string;
    },
  ): Frame | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    this.pushUndo(boardId);
    const now = new Date().toISOString();
    const frame: Frame = {
      id: randomUUID(),
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      label: data.label,
      color: data.color ?? "#e2e8f0",
      createdAt: now,
      updatedAt: now,
    };
    board.frames.push(frame);
    board.updatedAt = now;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return frame;
  }

  updateFrame(
    boardId: string,
    frameId: string,
    patch: Partial<
      Pick<Frame, "x" | "y" | "width" | "height" | "label" | "color">
    >,
  ): Frame | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    const frame = board.frames.find((f) => f.id === frameId);
    if (!frame) return null;
    this.pushUndo(boardId);
    Object.assign(frame, patch, { updatedAt: new Date().toISOString() });
    board.updatedAt = frame.updatedAt;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return frame;
  }

  deleteFrame(boardId: string, frameId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;
    const idx = board.frames.findIndex((f) => f.id === frameId);
    if (idx === -1) return false;
    this.pushUndo(boardId);
    board.frames.splice(idx, 1);
    for (const sticky of board.stickies) {
      if (sticky.frameId === frameId) sticky.frameId = null;
    }
    board.updatedAt = new Date().toISOString();
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return true;
  }

  connect(
    boardId: string,
    fromStickyId: string,
    toStickyId: string,
    label?: string,
  ): Connection | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    if (
      !board.stickies.some((s) => s.id === fromStickyId) ||
      !board.stickies.some((s) => s.id === toStickyId)
    )
      return null;
    this.pushUndo(boardId);
    const now = new Date().toISOString();
    const connection: Connection = {
      id: randomUUID(),
      fromStickyId,
      toStickyId,
      label: label ?? null,
      createdAt: now,
      updatedAt: now,
    };
    board.connections.push(connection);
    board.updatedAt = now;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return connection;
  }

  updateConnection(
    boardId: string,
    connectionId: string,
    patch: { label?: string },
  ): Connection | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    const connection = board.connections.find((c) => c.id === connectionId);
    if (!connection) return null;
    this.pushUndo(boardId);
    if (patch.label !== undefined) connection.label = patch.label;
    connection.updatedAt = new Date().toISOString();
    board.updatedAt = connection.updatedAt;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return connection;
  }

  disconnect(boardId: string, connectionId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;
    const idx = board.connections.findIndex((c) => c.id === connectionId);
    if (idx === -1) return false;
    this.pushUndo(boardId);
    board.connections.splice(idx, 1);
    board.updatedAt = new Date().toISOString();
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return true;
  }

  private pushUndo(boardId: string): void {
    const board = this.boards.get(boardId);
    if (!board) return;
    // viewport excluded — undo shouldn't change viewport
    const snapshot = JSON.stringify({
      stickies: board.stickies,
      frames: board.frames,
      connections: board.connections,
      colorMeanings: board.colorMeanings,
      texts: board.texts,
    });
    let stack = this.undoStacks.get(boardId);
    if (!stack) {
      stack = [];
      this.undoStacks.set(boardId, stack);
    }
    stack.push(snapshot);
    if (stack.length > MAX_UNDO_STACK) stack.shift();
    this.redoStacks.set(boardId, []);
  }

  undo(boardId: string): Board | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    const undoStack = this.undoStacks.get(boardId);
    if (!undoStack || undoStack.length === 0) return null;

    const currentSnapshot = JSON.stringify({
      stickies: board.stickies,
      frames: board.frames,
      connections: board.connections,
      colorMeanings: board.colorMeanings,
    });
    let redoStack = this.redoStacks.get(boardId);
    if (!redoStack) {
      redoStack = [];
      this.redoStacks.set(boardId, redoStack);
    }
    redoStack.push(currentSnapshot);

    const snapshot = undoStack.pop()!;
    const state = JSON.parse(snapshot);
    board.stickies = state.stickies;
    board.frames = state.frames;
    board.connections = state.connections;
    board.colorMeanings = state.colorMeanings;
    board.texts = state.texts ?? [];
    board.updatedAt = new Date().toISOString();

    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return board;
  }

  redo(boardId: string): Board | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    const redoStack = this.redoStacks.get(boardId);
    if (!redoStack || redoStack.length === 0) return null;

    const currentSnapshot = JSON.stringify({
      stickies: board.stickies,
      frames: board.frames,
      connections: board.connections,
      colorMeanings: board.colorMeanings,
    });
    let undoStack = this.undoStacks.get(boardId);
    if (!undoStack) {
      undoStack = [];
      this.undoStacks.set(boardId, undoStack);
    }
    undoStack.push(currentSnapshot);

    const snapshot = redoStack.pop()!;
    const state = JSON.parse(snapshot);
    board.stickies = state.stickies;
    board.frames = state.frames;
    board.connections = state.connections;
    board.colorMeanings = state.colorMeanings;
    board.texts = state.texts ?? [];
    board.updatedAt = new Date().toISOString();

    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return board;
  }

  canUndo(boardId: string): boolean {
    return (this.undoStacks.get(boardId)?.length ?? 0) > 0;
  }

  canRedo(boardId: string): boolean {
    return (this.redoStacks.get(boardId)?.length ?? 0) > 0;
  }

  createText(
    boardId: string,
    data: {
      text?: string;
      x?: number;
      y?: number;
      width?: number;
      fontSize?: number;
      bold?: boolean;
      italic?: boolean;
      color?: string;
    },
  ): TextNode | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    this.pushUndo(boardId);
    const now = new Date().toISOString();
    const node: TextNode = {
      id: randomUUID(),
      x: data.x ?? board.viewport.x + 400,
      y: data.y ?? board.viewport.y + 200,
      width: data.width ?? 300,
      text: data.text ?? "",
      fontSize: data.fontSize ?? 16,
      bold: data.bold ?? false,
      italic: data.italic ?? false,
      color: data.color ?? "#ffffff",
      createdAt: now,
      updatedAt: now,
    };
    board.texts.push(node);
    board.updatedAt = now;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return node;
  }

  updateText(
    boardId: string,
    textId: string,
    patch: Partial<
      Pick<
        TextNode,
        "x" | "y" | "width" | "text" | "fontSize" | "bold" | "italic" | "color"
      >
    >,
  ): TextNode | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    const node = board.texts.find((t) => t.id === textId);
    if (!node) return null;
    this.pushUndo(boardId);
    Object.assign(node, patch, { updatedAt: new Date().toISOString() });
    board.updatedAt = node.updatedAt;
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return node;
  }

  deleteText(boardId: string, textId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;
    const idx = board.texts.findIndex((t) => t.id === textId);
    if (idx === -1) return false;
    this.pushUndo(boardId);
    board.texts.splice(idx, 1);
    board.updatedAt = new Date().toISOString();
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return true;
  }

  private autoPositionX(board: Board): number {
    const cx = board.viewport.x + 400;
    const cols = board.stickies.length % 5;
    return cx + cols * 220;
  }

  private autoPositionY(board: Board): number {
    const cy = board.viewport.y + 200;
    const rows = Math.floor(board.stickies.length / 5);
    return cy + rows * 170;
  }

  private boardFilePath(boardId: string): string {
    return path.join(this.storageDir, `${boardId}.json`);
  }

  private scheduleSave(boardId: string): void {
    const existing = this.saveTimers.get(boardId);
    if (existing) clearTimeout(existing);
    this.saveTimers.set(
      boardId,
      setTimeout(() => {
        this.saveBoardSync(boardId);
        this.saveTimers.delete(boardId);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  private scheduleViewportSave(boardId: string): void {
    const existing = this.viewportSaveTimers.get(boardId);
    if (existing) clearTimeout(existing);
    this.viewportSaveTimers.set(
      boardId,
      setTimeout(() => {
        this.saveBoardSync(boardId);
        this.viewportSaveTimers.delete(boardId);
      }, VIEWPORT_SAVE_DEBOUNCE_MS),
    );
  }

  private saveBoardSync(boardId: string): void {
    const board = this.boards.get(boardId);
    if (!board) return;
    fs.writeFileSync(
      this.boardFilePath(boardId),
      JSON.stringify(board, null, 2),
      "utf-8",
    );
  }

  private loadAll(): void {
    if (!fs.existsSync(this.storageDir)) return;
    for (const file of fs.readdirSync(this.storageDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = fs.readFileSync(path.join(this.storageDir, file), "utf-8");
        const board: Board = JSON.parse(raw);
        if (!board.texts) board.texts = [];
        this.boards.set(board.id, board);
      } catch {
        /* corrupted file */
      }
    }
  }

  flushAll(): void {
    for (const [boardId, timer] of this.saveTimers) {
      clearTimeout(timer);
      this.saveBoardSync(boardId);
    }
    this.saveTimers.clear();
    for (const [boardId, timer] of this.viewportSaveTimers) {
      clearTimeout(timer);
      this.saveBoardSync(boardId);
    }
    this.viewportSaveTimers.clear();
  }
}

export const whiteboardState = new WhiteboardStateManager();
