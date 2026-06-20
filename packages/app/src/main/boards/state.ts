import { EventEmitter } from "events";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import {
  DEFAULT_BOARD_SETTINGS,
  DEFAULT_COLUMN_TEMPLATE,
  DEFAULT_TASK_TYPE_REGISTRY,
  type Board,
  type BoardColumn,
  type BoardSummary,
  type BoardsAction,
  type Epic,
  type Project,
  type ProjectBundle,
  type ProjectSummary,
  type Sprint,
  type Task,
  type TaskComment,
  type TaskPriority,
  type TaskType,
} from "../../shared/boards-types";

const SAVE_DEBOUNCE_MS = 1500;
const MAX_UNDO_STACK = 50;

/**
 * On-disk shape for `{projectId}/project.json` — index file holding
 * the project record plus sprint and epic lists.
 */
type ProjectIndexFile = {
  project: Project;
  sprints: Sprint[];
  epics: Epic[];
  taskCounter?: number;
};

/**
 * On-disk shape for `{projectId}/{boardId}.json` — board record plus its tasks.
 */
type BoardFile = {
  board: Board;
  tasks: Task[];
};

type ProjectBucket = {
  project: Project;
  boards: Map<string, Board>;
  /** boardId → tasks in that board. */
  tasks: Map<string, Task[]>;
  sprints: Sprint[];
  epics: Epic[];
  /** Monotonically increasing counter used to assign task.number. */
  taskCounter: number;
};

export class BoardsStateManager extends EventEmitter {
  private projects = new Map<string, ProjectBucket>();
  private storageDir: string;
  private projectSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private boardSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Undo stack per board — JSON snapshots of { board, tasks }. */
  private undoStacks = new Map<string, string[]>();
  private redoStacks = new Map<string, string[]>();

  constructor() {
    super();
    this.storageDir = path.join(app.getPath("userData"), "boards-data");
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.loadAll();
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  listProjects(): ProjectSummary[] {
    return Array.from(this.projects.values()).map(({ project }) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      icon: project.icon,
      color: project.color,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));
  }

  getProject(projectId: string): Project | null {
    return this.projects.get(projectId)?.project ?? null;
  }

  getProjectBundle(projectId: string): ProjectBundle | null {
    const bucket = this.projects.get(projectId);
    if (!bucket) return null;
    const tasks: Task[] = [];
    for (const list of bucket.tasks.values()) tasks.push(...list);
    return {
      project: bucket.project,
      boards: Array.from(bucket.boards.values()),
      tasks,
      sprints: [...bucket.sprints],
      epics: [...bucket.epics],
    };
  }

  listBoards(projectId: string): BoardSummary[] {
    const bucket = this.projects.get(projectId);
    if (!bucket) return [];
    return Array.from(bucket.boards.values()).map(
      ({ id, projectId, name, createdAt, updatedAt }) => ({
        id,
        projectId,
        name,
        createdAt,
        updatedAt,
      }),
    );
  }

  getBoard(boardId: string): Board | null {
    for (const bucket of this.projects.values()) {
      const board = bucket.boards.get(boardId);
      if (board) return board;
    }
    return null;
  }

  listTasks(boardId: string): Task[] {
    for (const bucket of this.projects.values()) {
      if (bucket.boards.has(boardId)) {
        return [...(bucket.tasks.get(boardId) ?? [])];
      }
    }
    return [];
  }

  getTask(taskId: string): Task | null {
    for (const bucket of this.projects.values()) {
      for (const list of bucket.tasks.values()) {
        const task = list.find((t) => t.id === taskId);
        if (task) return task;
      }
    }
    return null;
  }

  listSprints(projectId: string): Sprint[] {
    return [...(this.projects.get(projectId)?.sprints ?? [])];
  }

  listEpics(projectId: string): Epic[] {
    return [...(this.projects.get(projectId)?.epics ?? [])];
  }

  getTaskTypeRegistry() {
    return DEFAULT_TASK_TYPE_REGISTRY;
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────────

  /**
   * Apply a mutation. Returns the affected entity (or boolean for deletes) so
   * callers that need the result — notably the MCP server, which chains
   * operations by id — can use it. The renderer ignores the return value.
   */
  dispatch(action: BoardsAction): unknown {
    switch (action.type) {
      case "CREATE_PROJECT":
        return this.createProject(action);
      case "UPDATE_PROJECT":
        return this.updateProject(action.projectId, action.patch);
      case "DELETE_PROJECT":
        return this.deleteProject(action.projectId);
      case "CREATE_BOARD":
        return this.createBoard(action.projectId, action.name);
      case "UPDATE_BOARD":
        return this.updateBoard(action.boardId, action.patch);
      case "DELETE_BOARD":
        return this.deleteBoard(action.boardId);
      case "CREATE_COLUMN":
        return this.createColumn(action);
      case "UPDATE_COLUMN":
        return this.updateColumn(action.boardId, action.columnId, action.patch);
      case "DELETE_COLUMN":
        return this.deleteColumn(action.boardId, action.columnId);
      case "REORDER_COLUMN":
        return this.reorderColumn(
          action.boardId,
          action.columnId,
          action.newOrder,
        );
      case "CREATE_TASK":
        return this.createTask(action);
      case "UPDATE_TASK":
        return this.updateTask(action.taskId, action.patch);
      case "DELETE_TASK":
        return this.deleteTask(action.taskId);
      case "MOVE_TASK":
        return this.moveTask(
          action.taskId,
          action.targetColumnId,
          action.newOrder,
        );
      case "MOVE_TASK_TO_BOARD":
        return this.moveTaskToBoard(
          action.taskId,
          action.targetBoardId,
          action.targetColumnId,
        );
      case "ADD_COMMENT":
        return this.addComment(action.taskId, action.author, action.body);
      case "DELETE_COMMENT":
        return this.deleteComment(action.taskId, action.commentId);
      case "UPDATE_COMMENT":
        return this.updateComment(
          action.taskId,
          action.commentId,
          action.body,
        );
      case "CREATE_SPRINT":
        return this.createSprint(action);
      case "UPDATE_SPRINT":
        return this.updateSprint(action.sprintId, action.patch);
      case "START_SPRINT":
        return this.startSprint(action.sprintId);
      case "COMPLETE_SPRINT":
        return this.completeSprint(
          action.sprintId,
          action.unfinishedTasks ?? "keep",
        );
      case "CREATE_EPIC":
        return this.createEpic(action);
      case "UPDATE_EPIC":
        return this.updateEpic(action.epicId, action.patch);
      case "DELETE_EPIC":
        return this.deleteEpic(action.epicId);
    }
  }

  // ─── Projects ──────────────────────────────────────────────────────────────

  private createProject(opts: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
  }): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: opts.name,
      description: opts.description ?? "",
      icon: opts.icon ?? "SquareKanban",
      color: opts.color ?? "#3b82f6",
      settings: {
        defaultColumnTemplate: DEFAULT_COLUMN_TEMPLATE.map((c) => ({
          ...c,
          id: randomUUID(),
        })),
        enabledTaskTypes: DEFAULT_TASK_TYPE_REGISTRY.map((t) => t.key),
        defaultPriority: "medium",
      },
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(project.id, {
      project,
      boards: new Map(),
      tasks: new Map(),
      sprints: [],
      epics: [],
      taskCounter: 0,
    });
    this.ensureProjectDir(project.id);
    this.scheduleProjectSave(project.id);
    this.emit("project-changed", { project });
    return project;
  }

  private updateProject(
    projectId: string,
    patch: Partial<
      Pick<Project, "name" | "description" | "icon" | "color" | "settings">
    >,
  ): Project | null {
    const bucket = this.projects.get(projectId);
    if (!bucket) return null;
    Object.assign(bucket.project, patch, {
      updatedAt: new Date().toISOString(),
    });
    this.scheduleProjectSave(projectId);
    this.emit("project-changed", { project: bucket.project });
    return bucket.project;
  }

  private deleteProject(projectId: string): boolean {
    const bucket = this.projects.get(projectId);
    if (!bucket) return false;
    this.projects.delete(projectId);
    const dir = this.projectDir(projectId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    const timer = this.projectSaveTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.projectSaveTimers.delete(projectId);
    }
    for (const boardId of bucket.boards.keys()) {
      const t = this.boardSaveTimers.get(boardId);
      if (t) {
        clearTimeout(t);
        this.boardSaveTimers.delete(boardId);
      }
      this.undoStacks.delete(boardId);
      this.redoStacks.delete(boardId);
    }
    this.emit("project-changed", { deleted: projectId });
    return true;
  }

  // ─── Boards ────────────────────────────────────────────────────────────────

  private createBoard(projectId: string, name: string): Board | null {
    const bucket = this.projects.get(projectId);
    if (!bucket) return null;
    const now = new Date().toISOString();
    const columns: BoardColumn[] = bucket.project.settings.defaultColumnTemplate.map(
      (c) => ({ ...c, id: randomUUID() }),
    );
    const board: Board = {
      id: randomUUID(),
      projectId,
      name,
      columns,
      settings: { ...DEFAULT_BOARD_SETTINGS },
      createdAt: now,
      updatedAt: now,
    };
    bucket.boards.set(board.id, board);
    bucket.tasks.set(board.id, []);
    this.scheduleBoardSave(board.id);
    this.emit("board-changed", { board });
    return board;
  }

  private updateBoard(
    boardId: string,
    patch: Partial<Pick<Board, "name" | "settings">>,
  ): Board | null {
    const bucket = this.findBucketByBoard(boardId);
    if (!bucket) return null;
    const board = bucket.boards.get(boardId);
    if (!board) return null;
    this.pushUndo(boardId);
    Object.assign(board, patch, { updatedAt: new Date().toISOString() });
    this.scheduleBoardSave(boardId);
    this.emit("board-changed", { board });
    return board;
  }

  private deleteBoard(boardId: string): boolean {
    const bucket = this.findBucketByBoard(boardId);
    if (!bucket) return false;
    if (!bucket.boards.delete(boardId)) return false;
    bucket.tasks.delete(boardId);
    const file = this.boardFilePath(bucket.project.id, boardId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const timer = this.boardSaveTimers.get(boardId);
    if (timer) {
      clearTimeout(timer);
      this.boardSaveTimers.delete(boardId);
    }
    this.undoStacks.delete(boardId);
    this.redoStacks.delete(boardId);
    this.emit("board-changed", { deleted: boardId });
    return true;
  }

  // ─── Columns ───────────────────────────────────────────────────────────────

  private createColumn(opts: {
    boardId: string;
    name: string;
    color?: string;
    wipLimit?: number;
  }): BoardColumn | null {
    const bucket = this.findBucketByBoard(opts.boardId);
    const board = bucket?.boards.get(opts.boardId);
    if (!bucket || !board) return null;
    this.pushUndo(opts.boardId);
    const maxOrder = board.columns.reduce(
      (acc, c) => Math.max(acc, c.order),
      -1,
    );
    const column: BoardColumn = {
      id: randomUUID(),
      name: opts.name,
      color: opts.color ?? "#64748b",
      order: maxOrder + 1,
      wipLimit: opts.wipLimit,
    };
    board.columns.push(column);
    board.updatedAt = new Date().toISOString();
    this.scheduleBoardSave(opts.boardId);
    this.emit("board-changed", { board });
    return column;
  }

  private updateColumn(
    boardId: string,
    columnId: string,
    patch: Partial<Pick<BoardColumn, "name" | "color" | "wipLimit">>,
  ): BoardColumn | null {
    const bucket = this.findBucketByBoard(boardId);
    const board = bucket?.boards.get(boardId);
    if (!bucket || !board) return null;
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) return null;
    this.pushUndo(boardId);
    Object.assign(column, patch);
    board.updatedAt = new Date().toISOString();
    this.scheduleBoardSave(boardId);
    this.emit("board-changed", { board });
    return column;
  }

  private deleteColumn(boardId: string, columnId: string): boolean {
    const bucket = this.findBucketByBoard(boardId);
    const board = bucket?.boards.get(boardId);
    if (!bucket || !board) return false;
    const idx = board.columns.findIndex((c) => c.id === columnId);
    if (idx === -1) return false;
    this.pushUndo(boardId);
    board.columns.splice(idx, 1);
    // Drop tasks in that column.
    const tasks = bucket.tasks.get(boardId) ?? [];
    const remaining = tasks.filter((t) => t.columnId !== columnId);
    bucket.tasks.set(boardId, remaining);
    board.updatedAt = new Date().toISOString();
    this.scheduleBoardSave(boardId);
    this.emit("board-changed", { board });
    this.emit("tasks-changed", { boardId, tasks: remaining });
    return true;
  }

  private reorderColumn(
    boardId: string,
    columnId: string,
    newOrder: number,
  ): void {
    const bucket = this.findBucketByBoard(boardId);
    const board = bucket?.boards.get(boardId);
    if (!bucket || !board) return;
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) return;
    this.pushUndo(boardId);
    column.order = newOrder;
    board.updatedAt = new Date().toISOString();
    this.scheduleBoardSave(boardId);
    this.emit("board-changed", { board });
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  private createTask(opts: {
    boardId: string;
    columnId: string;
    title: string;
    taskType?: TaskType;
    priority?: TaskPriority;
    description?: string;
    sprintId?: string;
  }): Task | null {
    const bucket = this.findBucketByBoard(opts.boardId);
    const board = bucket?.boards.get(opts.boardId);
    if (!bucket || !board) return null;
    this.pushUndo(opts.boardId);
    const tasks = bucket.tasks.get(opts.boardId) ?? [];
    const colTasks = tasks.filter((t) => t.columnId === opts.columnId);
    const nextOrder = colTasks.length
      ? Math.max(...colTasks.map((t) => t.order)) + 1
      : 0;
    // Backlog order is project-scoped — find max across all boards' tasks.
    const allProjectTasks: Task[] = [];
    for (const list of bucket.tasks.values()) allProjectTasks.push(...list);
    const nextBacklogOrder = allProjectTasks.length
      ? Math.max(...allProjectTasks.map((t) => t.backlogOrder ?? 0)) + 1
      : 0;
    const now = new Date().toISOString();
    const startingColumn = board.columns.find((c) => c.id === opts.columnId);
    const task: Task = {
      id: randomUUID(),
      number: ++bucket.taskCounter,
      boardId: opts.boardId,
      projectId: bucket.project.id,
      columnId: opts.columnId,
      type: opts.taskType ?? "task",
      title: opts.title,
      description: opts.description ?? "",
      status: startingColumn?.name.toLowerCase() ?? "open",
      priority: opts.priority ?? bucket.project.settings.defaultPriority,
      order: nextOrder,
      backlogOrder: nextBacklogOrder,
      labels: [],
      sprintId: opts.sprintId,
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(task);
    bucket.tasks.set(opts.boardId, tasks);
    board.updatedAt = now;
    this.scheduleBoardSave(opts.boardId);
    this.scheduleProjectSave(bucket.project.id);
    this.emit("tasks-changed", { boardId: opts.boardId, tasks });
    return task;
  }

  private updateTask(
    taskId: string,
    patch: Partial<Task>,
  ): Task | null {
    const located = this.locateTask(taskId);
    if (!located) return null;
    const { bucket, boardId, task } = located;
    this.pushUndo(boardId);
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    const board = bucket.boards.get(boardId);
    if (board) board.updatedAt = task.updatedAt;
    this.scheduleBoardSave(boardId);
    const tasks = bucket.tasks.get(boardId) ?? [];
    this.emit("tasks-changed", { boardId, tasks });
    return task;
  }

  private deleteTask(taskId: string): boolean {
    const located = this.locateTask(taskId);
    if (!located) return false;
    const { bucket, boardId } = located;
    this.pushUndo(boardId);
    const tasks = (bucket.tasks.get(boardId) ?? []).filter(
      (t) => t.id !== taskId,
    );
    bucket.tasks.set(boardId, tasks);
    const board = bucket.boards.get(boardId);
    if (board) board.updatedAt = new Date().toISOString();
    this.scheduleBoardSave(boardId);
    this.emit("tasks-changed", { boardId, tasks });
    return true;
  }

  private moveTask(
    taskId: string,
    targetColumnId: string,
    newOrder: number,
  ): Task | null {
    const located = this.locateTask(taskId);
    if (!located) return null;
    const { bucket, boardId, task } = located;
    const board = bucket.boards.get(boardId);
    this.pushUndo(boardId);
    task.columnId = targetColumnId;
    task.order = newOrder;
    // Keep status in sync with the column name so sprint velocity counts correctly.
    if (board) {
      const col = board.columns.find((c) => c.id === targetColumnId);
      if (col) task.status = col.name.toLowerCase();
      board.updatedAt = new Date().toISOString();
    }
    task.updatedAt = new Date().toISOString();
    this.scheduleBoardSave(boardId);
    const tasks = bucket.tasks.get(boardId) ?? [];
    this.emit("tasks-changed", { boardId, tasks });
    return task;
  }

  private moveTaskToBoard(
    taskId: string,
    targetBoardId: string,
    targetColumnId?: string,
  ): Task | null {
    const located = this.locateTask(taskId);
    if (!located) return null;
    const { bucket: sourceBucket, boardId: sourceBoardId, task } = located;

    const targetBucket = this.findBucketByBoard(targetBoardId);
    const targetBoard = targetBucket?.boards.get(targetBoardId);
    if (!targetBucket || !targetBoard) return null;

    // Determine target column (first sorted column if not specified).
    const sortedCols = [...targetBoard.columns].sort(
      (a, b) => a.order - b.order,
    );
    const targetCol = targetColumnId
      ? targetBoard.columns.find((c) => c.id === targetColumnId)
      : sortedCols[0];
    if (!targetCol) return null;

    // Remove from source board.
    this.pushUndo(sourceBoardId);
    const sourceTasks = (sourceBucket.tasks.get(sourceBoardId) ?? []).filter(
      (t) => t.id !== taskId,
    );
    sourceBucket.tasks.set(sourceBoardId, sourceTasks);

    // Compute order in target column.
    const targetTasks = targetBucket.tasks.get(targetBoardId) ?? [];
    const colTasks = targetTasks.filter((t) => t.columnId === targetCol.id);
    const nextOrder = colTasks.length
      ? Math.max(...colTasks.map((t) => t.order)) + 1
      : 0;

    // Update task properties.
    task.boardId = targetBoardId;
    task.projectId = targetBucket.project.id;
    task.columnId = targetCol.id;
    task.order = nextOrder;
    task.status = targetCol.name.toLowerCase();
    task.updatedAt = new Date().toISOString();

    targetTasks.push(task);
    targetBucket.tasks.set(targetBoardId, targetTasks);

    this.scheduleBoardSave(sourceBoardId);
    this.scheduleBoardSave(targetBoardId);
    this.emit("tasks-changed", { boardId: sourceBoardId, tasks: sourceTasks });
    this.emit("tasks-changed", { boardId: targetBoardId, tasks: targetTasks });
    return task;
  }

  private addComment(
    taskId: string,
    author: string,
    body: string,
  ): Task | null {
    const located = this.locateTask(taskId);
    if (!located) return null;
    const { bucket, boardId, task } = located;
    const now = new Date().toISOString();
    const comment: TaskComment = {
      id: randomUUID(),
      taskId,
      author: author.trim() || "Anonymous",
      body,
      createdAt: now,
      updatedAt: now,
    };
    task.comments = [...(task.comments ?? []), comment];
    task.updatedAt = now;
    this.scheduleBoardSave(boardId);
    const tasks = bucket.tasks.get(boardId) ?? [];
    this.emit("tasks-changed", { boardId, tasks });
    return task;
  }

  private deleteComment(taskId: string, commentId: string): boolean {
    const located = this.locateTask(taskId);
    if (!located) return false;
    const { bucket, boardId, task } = located;
    task.comments = (task.comments ?? []).filter((c) => c.id !== commentId);
    task.updatedAt = new Date().toISOString();
    this.scheduleBoardSave(boardId);
    const tasks = bucket.tasks.get(boardId) ?? [];
    this.emit("tasks-changed", { boardId, tasks });
    return true;
  }

  private updateComment(
    taskId: string,
    commentId: string,
    body: string,
  ): boolean {
    const located = this.locateTask(taskId);
    if (!located) return false;
    const { bucket, boardId, task } = located;
    const comment = (task.comments ?? []).find((c) => c.id === commentId);
    if (!comment) return false;
    comment.body = body;
    comment.updatedAt = new Date().toISOString();
    task.updatedAt = comment.updatedAt;
    this.scheduleBoardSave(boardId);
    const tasks = bucket.tasks.get(boardId) ?? [];
    this.emit("tasks-changed", { boardId, tasks });
    return true;
  }

  // ─── Sprints ───────────────────────────────────────────────────────────────

  private createSprint(opts: {
    projectId: string;
    name: string;
    startDate: string;
    endDate: string;
    goal?: string;
  }): Sprint | null {
    const bucket = this.projects.get(opts.projectId);
    if (!bucket) return null;
    const now = new Date().toISOString();
    const sprint: Sprint = {
      id: randomUUID(),
      projectId: opts.projectId,
      name: opts.name,
      goal: opts.goal,
      startDate: opts.startDate,
      endDate: opts.endDate,
      status: "planning",
      createdAt: now,
      updatedAt: now,
    };
    bucket.sprints.push(sprint);
    this.scheduleProjectSave(opts.projectId);
    this.emit("sprints-changed", {
      projectId: opts.projectId,
      sprints: bucket.sprints,
    });
    return sprint;
  }

  private updateSprint(
    sprintId: string,
    patch: Partial<Sprint>,
  ): Sprint | null {
    for (const bucket of this.projects.values()) {
      const sprint = bucket.sprints.find((s) => s.id === sprintId);
      if (!sprint) continue;
      Object.assign(sprint, patch, { updatedAt: new Date().toISOString() });
      this.scheduleProjectSave(bucket.project.id);
      this.emit("sprints-changed", {
        projectId: bucket.project.id,
        sprints: bucket.sprints,
      });
      return sprint;
    }
    return null;
  }

  private startSprint(sprintId: string): Sprint | null {
    for (const bucket of this.projects.values()) {
      const sprint = bucket.sprints.find((s) => s.id === sprintId);
      if (!sprint) continue;
      // Only one active sprint per project — complete others.
      for (const s of bucket.sprints) {
        if (s.id !== sprintId && s.status === "active") s.status = "completed";
      }
      sprint.status = "active";
      sprint.updatedAt = new Date().toISOString();
      this.scheduleProjectSave(bucket.project.id);
      this.emit("sprints-changed", {
        projectId: bucket.project.id,
        sprints: bucket.sprints,
      });
      return sprint;
    }
    return null;
  }

  private completeSprint(
    sprintId: string,
    unfinishedTasks: "backlog" | "keep" | { moveToSprintId: string },
  ): Sprint | null {
    for (const bucket of this.projects.values()) {
      const sprint = bucket.sprints.find((s) => s.id === sprintId);
      if (!sprint) continue;

      // Collect all tasks in this sprint across every board in the project.
      const inSprint: { boardId: string; task: Task }[] = [];
      for (const [boardId, tasks] of bucket.tasks) {
        for (const task of tasks) {
          if (task.sprintId === sprintId) inSprint.push({ boardId, task });
        }
      }

      const isDone = (t: Task) => t.status.toLowerCase() === "done";

      const totalCommitted = inSprint.reduce(
        (sum, { task }) => sum + (task.storyPoints ?? 0),
        0,
      );
      const totalCompleted = inSprint.reduce(
        (sum, { task }) =>
          sum + (isDone(task) ? (task.storyPoints ?? 0) : 0),
        0,
      );
      const tasksByStatus: Record<string, number> = {};
      for (const { task } of inSprint) {
        const key = task.status || "open";
        tasksByStatus[key] = (tasksByStatus[key] ?? 0) + 1;
      }

      // Apply resolution to unfinished tasks.
      const affectedBoards = new Set<string>();
      const now = new Date().toISOString();
      if (unfinishedTasks !== "keep") {
        for (const { boardId, task } of inSprint) {
          if (isDone(task)) continue;
          if (unfinishedTasks === "backlog") {
            task.sprintId = undefined;
          } else {
            task.sprintId = unfinishedTasks.moveToSprintId;
          }
          task.updatedAt = now;
          affectedBoards.add(boardId);
        }
      }

      sprint.status = "completed";
      sprint.velocity = {
        storyPointsCommitted: totalCommitted,
        storyPointsCompleted: totalCompleted,
        tasksByStatus,
      };
      sprint.updatedAt = now;

      this.scheduleProjectSave(bucket.project.id);
      for (const boardId of affectedBoards) {
        this.scheduleBoardSave(boardId);
        this.emit("tasks-changed", {
          boardId,
          tasks: bucket.tasks.get(boardId) ?? [],
        });
      }
      this.emit("sprints-changed", {
        projectId: bucket.project.id,
        sprints: bucket.sprints,
      });
      return sprint;
    }
    return null;
  }

  // ─── Epics ─────────────────────────────────────────────────────────────────

  private createEpic(opts: {
    projectId: string;
    name: string;
    color?: string;
    description?: string;
    startDate?: string;
    targetDate?: string;
  }): Epic | null {
    const bucket = this.projects.get(opts.projectId);
    if (!bucket) return null;
    const now = new Date().toISOString();
    const epic: Epic = {
      id: randomUUID(),
      projectId: opts.projectId,
      name: opts.name,
      color: opts.color ?? "#a855f7",
      description: opts.description ?? "",
      status: "active",
      startDate: opts.startDate,
      targetDate: opts.targetDate,
      createdAt: now,
      updatedAt: now,
    };
    bucket.epics.push(epic);
    this.scheduleProjectSave(opts.projectId);
    this.emit("epics-changed", {
      projectId: opts.projectId,
      epics: bucket.epics,
    });
    return epic;
  }

  private updateEpic(epicId: string, patch: Partial<Epic>): Epic | null {
    for (const bucket of this.projects.values()) {
      const epic = bucket.epics.find((e) => e.id === epicId);
      if (!epic) continue;
      Object.assign(epic, patch, { updatedAt: new Date().toISOString() });
      this.scheduleProjectSave(bucket.project.id);
      this.emit("epics-changed", {
        projectId: bucket.project.id,
        epics: bucket.epics,
      });
      return epic;
    }
    return null;
  }

  private deleteEpic(epicId: string): boolean {
    for (const bucket of this.projects.values()) {
      const idx = bucket.epics.findIndex((e) => e.id === epicId);
      if (idx === -1) continue;
      bucket.epics.splice(idx, 1);
      // Clear epicId on any tasks linked to it.
      for (const [boardId, tasks] of bucket.tasks) {
        let mutated = false;
        for (const t of tasks) {
          if (t.epicId === epicId) {
            t.epicId = undefined;
            mutated = true;
          }
        }
        if (mutated) {
          this.scheduleBoardSave(boardId);
          this.emit("tasks-changed", { boardId, tasks });
        }
      }
      this.scheduleProjectSave(bucket.project.id);
      this.emit("epics-changed", {
        projectId: bucket.project.id,
        epics: bucket.epics,
      });
      return true;
    }
    return false;
  }

  // ─── Undo / Redo ───────────────────────────────────────────────────────────

  private pushUndo(boardId: string): void {
    const snapshot = this.snapshotBoard(boardId);
    if (!snapshot) return;
    const stack = this.undoStacks.get(boardId) ?? [];
    stack.push(snapshot);
    if (stack.length > MAX_UNDO_STACK) stack.shift();
    this.undoStacks.set(boardId, stack);
    this.redoStacks.set(boardId, []);
  }

  private snapshotBoard(boardId: string): string | null {
    const bucket = this.findBucketByBoard(boardId);
    const board = bucket?.boards.get(boardId);
    if (!bucket || !board) return null;
    return JSON.stringify({
      board,
      tasks: bucket.tasks.get(boardId) ?? [],
    });
  }

  undo(boardId: string): boolean {
    const undoStack = this.undoStacks.get(boardId);
    if (!undoStack || !undoStack.length) return false;
    const current = this.snapshotBoard(boardId);
    if (current) {
      const redo = this.redoStacks.get(boardId) ?? [];
      redo.push(current);
      this.redoStacks.set(boardId, redo);
    }
    this.applySnapshot(boardId, undoStack.pop()!);
    return true;
  }

  redo(boardId: string): boolean {
    const redoStack = this.redoStacks.get(boardId);
    if (!redoStack || !redoStack.length) return false;
    const current = this.snapshotBoard(boardId);
    if (current) {
      const undo = this.undoStacks.get(boardId) ?? [];
      undo.push(current);
      this.undoStacks.set(boardId, undo);
    }
    this.applySnapshot(boardId, redoStack.pop()!);
    return true;
  }

  canUndo(boardId: string): boolean {
    return (this.undoStacks.get(boardId)?.length ?? 0) > 0;
  }

  canRedo(boardId: string): boolean {
    return (this.redoStacks.get(boardId)?.length ?? 0) > 0;
  }

  private applySnapshot(boardId: string, snapshot: string): void {
    const { board, tasks } = JSON.parse(snapshot) as BoardFile;
    const bucket = this.findBucketByBoard(boardId);
    if (!bucket) return;
    bucket.boards.set(boardId, board);
    bucket.tasks.set(boardId, tasks);
    this.scheduleBoardSave(boardId);
    this.emit("board-changed", { board });
    this.emit("tasks-changed", { boardId, tasks });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private findBucketByBoard(boardId: string): ProjectBucket | null {
    for (const bucket of this.projects.values()) {
      if (bucket.boards.has(boardId)) return bucket;
    }
    return null;
  }

  private locateTask(
    taskId: string,
  ): { bucket: ProjectBucket; boardId: string; task: Task } | null {
    for (const bucket of this.projects.values()) {
      for (const [boardId, tasks] of bucket.tasks) {
        const task = tasks.find((t) => t.id === taskId);
        if (task) return { bucket, boardId, task };
      }
    }
    return null;
  }

  private projectDir(projectId: string): string {
    return path.join(this.storageDir, projectId);
  }

  private projectIndexPath(projectId: string): string {
    return path.join(this.projectDir(projectId), "project.json");
  }

  private boardFilePath(projectId: string, boardId: string): string {
    return path.join(this.projectDir(projectId), `${boardId}.json`);
  }

  private ensureProjectDir(projectId: string): void {
    const dir = this.projectDir(projectId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private scheduleProjectSave(projectId: string): void {
    const existing = this.projectSaveTimers.get(projectId);
    if (existing) clearTimeout(existing);
    this.projectSaveTimers.set(
      projectId,
      setTimeout(() => {
        this.saveProjectSync(projectId);
        this.projectSaveTimers.delete(projectId);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  private scheduleBoardSave(boardId: string): void {
    const existing = this.boardSaveTimers.get(boardId);
    if (existing) clearTimeout(existing);
    this.boardSaveTimers.set(
      boardId,
      setTimeout(() => {
        this.saveBoardSync(boardId);
        this.boardSaveTimers.delete(boardId);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  private saveProjectSync(projectId: string): void {
    const bucket = this.projects.get(projectId);
    if (!bucket) return;
    this.ensureProjectDir(projectId);
    const file: ProjectIndexFile = {
      project: bucket.project,
      sprints: bucket.sprints,
      epics: bucket.epics,
      taskCounter: bucket.taskCounter,
    };
    fs.writeFileSync(
      this.projectIndexPath(projectId),
      JSON.stringify(file, null, 2),
      "utf-8",
    );
  }

  private saveBoardSync(boardId: string): void {
    const bucket = this.findBucketByBoard(boardId);
    const board = bucket?.boards.get(boardId);
    if (!bucket || !board) return;
    this.ensureProjectDir(bucket.project.id);
    const file: BoardFile = {
      board,
      tasks: bucket.tasks.get(boardId) ?? [],
    };
    fs.writeFileSync(
      this.boardFilePath(bucket.project.id, boardId),
      JSON.stringify(file, null, 2),
      "utf-8",
    );
  }

  private loadAll(): void {
    if (!fs.existsSync(this.storageDir)) return;
    for (const entry of fs.readdirSync(this.storageDir, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const projectId = entry.name;
      const indexPath = this.projectIndexPath(projectId);
      if (!fs.existsSync(indexPath)) continue;
      try {
        const indexRaw = fs.readFileSync(indexPath, "utf-8");
        const index = JSON.parse(indexRaw) as ProjectIndexFile;
        const bucket: ProjectBucket = {
          project: index.project,
          boards: new Map(),
          tasks: new Map(),
          sprints: index.sprints ?? [],
          epics: index.epics ?? [],
          taskCounter: index.taskCounter ?? 0,
        };
        const dir = this.projectDir(projectId);
        for (const fileEntry of fs.readdirSync(dir)) {
          if (fileEntry === "project.json" || !fileEntry.endsWith(".json"))
            continue;
          try {
            const raw = fs.readFileSync(path.join(dir, fileEntry), "utf-8");
            const data = JSON.parse(raw) as BoardFile;
            bucket.boards.set(data.board.id, data.board);
            const tasks = (data.tasks ?? []).map((t, i) => ({
              ...t,
              backlogOrder: t.backlogOrder ?? i,
              labels: t.labels ?? [],
            }));
            bucket.tasks.set(data.board.id, tasks);
          } catch {
            /* corrupted board file — skip */
          }
        }
        this.projects.set(projectId, bucket);

        // Backfill sequential task numbers for any tasks saved without one.
        const allBucketTasks: Task[] = [];
        for (const list of bucket.tasks.values()) allBucketTasks.push(...list);
        const existingMax = allBucketTasks.reduce(
          (m, t) => Math.max(m, t.number ?? 0),
          0,
        );
        let taskCounter = Math.max(bucket.taskCounter, existingMax);
        const unnumbered = allBucketTasks
          .filter((t) => !t.number)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        for (const task of unnumbered) {
          task.number = ++taskCounter;
        }
        bucket.taskCounter = taskCounter;
        if (unnumbered.length > 0) {
          this.scheduleProjectSave(projectId);
          for (const boardId of bucket.boards.keys()) {
            this.scheduleBoardSave(boardId);
          }
        }
      } catch {
        /* corrupted project index — skip */
      }
    }
  }

  flushAll(): void {
    for (const [projectId, timer] of this.projectSaveTimers) {
      clearTimeout(timer);
      this.saveProjectSync(projectId);
    }
    this.projectSaveTimers.clear();
    for (const [boardId, timer] of this.boardSaveTimers) {
      clearTimeout(timer);
      this.saveBoardSync(boardId);
    }
    this.boardSaveTimers.clear();
  }
}

let instance: BoardsStateManager | null = null;

export function getBoardsState(): BoardsStateManager {
  if (!instance) instance = new BoardsStateManager();
  return instance;
}
