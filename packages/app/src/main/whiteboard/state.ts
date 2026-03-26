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
  StickyColor,
} from "../../shared/whiteboard-types";

const SAVE_DEBOUNCE_MS = 1500;
const VIEWPORT_SAVE_DEBOUNCE_MS = 3000;

export class WhiteboardStateManager extends EventEmitter {
  private boards = new Map<string, Board>();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private viewportSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private storageDir: string;

  constructor() {
    super();
    this.storageDir = path.join(app.getPath("userData"), "whiteboard");
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.loadAll();
  }

  // --- Board CRUD ---

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

  // --- Sticky CRUD ---

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
    board.stickies.splice(idx, 1);
    board.connections = board.connections.filter(
      (c) => c.fromStickyId !== stickyId && c.toStickyId !== stickyId,
    );
    board.updatedAt = new Date().toISOString();
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return true;
  }

  // --- Frame CRUD ---

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
    board.frames.splice(idx, 1);
    for (const sticky of board.stickies) {
      if (sticky.frameId === frameId) sticky.frameId = null;
    }
    board.updatedAt = new Date().toISOString();
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return true;
  }

  // --- Connection CRUD ---

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
    board.connections.splice(idx, 1);
    board.updatedAt = new Date().toISOString();
    this.scheduleSave(boardId);
    this.emit("board-changed", board);
    return true;
  }

  // --- Auto-positioning ---

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

  // --- Persistence ---

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
        this.boards.set(board.id, board);
      } catch {
        // Skip corrupted files
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
