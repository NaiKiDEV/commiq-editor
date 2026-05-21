// Boards Panel — shared types between main and renderer.
// Kanban-style project management: Projects contain Boards, Boards contain
// Columns (swim lanes) and Tasks. Tasks may optionally belong to Sprints and Epics.

// ─── Primitives ──────────────────────────────────────────────────────────────

export type TaskType = "story" | "task" | "spike" | "bug" | "subtask";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type EpicStatus = "active" | "completed" | "archived";

export type SprintStatus = "planning" | "active" | "completed";

export type CardDisplayDensity = "compact" | "normal" | "detailed";

/** Which view the user is on inside a project: kanban, backlog, epic management, or sprint management. */
export type ProjectViewTab = "board" | "backlog" | "epics" | "sprints";

/**
 * Config-as-data registry entry. Adding a new task type = appending one entry.
 * `icon` is a Lucide icon name string resolved at render time on the renderer.
 */
export type TaskTypeConfig = {
  key: TaskType;
  label: string;
  icon: string;
  color: string;
};

// ─── Entities ────────────────────────────────────────────────────────────────

export type BoardColumn = {
  id: string;
  name: string;
  color: string;
  order: number;
  wipLimit?: number;
};

export type BoardSettings = {
  cardDisplayDensity: CardDisplayDensity;
  visibleCardFields: string[];
};

export type Board = {
  id: string;
  projectId: string;
  name: string;
  columns: BoardColumn[];
  settings: BoardSettings;
  createdAt: string;
  updatedAt: string;
};

export type BoardSummary = Pick<
  Board,
  "id" | "projectId" | "name" | "createdAt" | "updatedAt"
>;

export type ProjectSettings = {
  defaultColumnTemplate: BoardColumn[];
  enabledTaskTypes: TaskType[];
  defaultPriority: TaskPriority;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummary = Pick<
  Project,
  "id" | "name" | "description" | "icon" | "color" | "createdAt" | "updatedAt"
>;

export type TaskComment = {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  /** Sequential per-project identifier starting at 1. */
  number?: number;
  boardId: string;
  projectId: string;
  columnId: string;
  epicId?: string;
  sprintId?: string;
  type: TaskType;
  title: string;
  description: string;
  /** Kept in sync with the column name (lowercase) whenever a task is moved. */
  status: string;
  priority: TaskPriority;
  /** Fractional index for ordering within a column on the kanban view. */
  order: number;
  /** Fractional index for ordering within a backlog section (unassigned or per-sprint). */
  backlogOrder: number;
  assignee?: string;
  labels: string[];
  storyPoints?: number;
  dueDate?: string;
  comments?: TaskComment[];
  createdAt: string;
  updatedAt: string;
};

export type Epic = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  description: string;
  status: EpicStatus;
  startDate?: string;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type SprintVelocity = {
  storyPointsCommitted: number;
  storyPointsCompleted: number;
  tasksByStatus: Record<string, number>;
};

export type Sprint = {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  velocity?: SprintVelocity;
  createdAt: string;
  updatedAt: string;
};

// ─── Defaults exposed to the renderer ────────────────────────────────────────

export const DEFAULT_COLUMN_TEMPLATE: Omit<BoardColumn, "id">[] = [
  { name: "To Do", color: "#64748b", order: 0 },
  { name: "In Progress", color: "#3b82f6", order: 1 },
  { name: "Done", color: "#10b981", order: 2 },
];

export const DEFAULT_TASK_TYPE_REGISTRY: TaskTypeConfig[] = [
  { key: "story", label: "Story", icon: "BookOpen", color: "#22c55e" },
  { key: "task", label: "Task", icon: "CheckSquare", color: "#3b82f6" },
  { key: "spike", label: "Spike", icon: "Zap", color: "#a855f7" },
  { key: "bug", label: "Bug", icon: "Bug", color: "#ef4444" },
  { key: "subtask", label: "Subtask", icon: "GitBranch", color: "#94a3b8" },
];

export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  cardDisplayDensity: "normal",
  visibleCardFields: ["priority", "type", "labels", "storyPoints", "assignee"],
};

// ─── Action payloads ─────────────────────────────────────────────────────────
// Single discriminated union dispatched through `boards:dispatch`.
// Mirrors the repo-tycoon pattern for consistency.

export type BoardsAction =
  // Projects
  | {
      type: "CREATE_PROJECT";
      name: string;
      description?: string;
      icon?: string;
      color?: string;
    }
  | {
      type: "UPDATE_PROJECT";
      projectId: string;
      patch: Partial<
        Pick<Project, "name" | "description" | "icon" | "color" | "settings">
      >;
    }
  | { type: "DELETE_PROJECT"; projectId: string }
  // Boards
  | { type: "CREATE_BOARD"; projectId: string; name: string }
  | {
      type: "UPDATE_BOARD";
      boardId: string;
      patch: Partial<Pick<Board, "name" | "settings">>;
    }
  | { type: "DELETE_BOARD"; boardId: string }
  // Columns
  | {
      type: "CREATE_COLUMN";
      boardId: string;
      name: string;
      color?: string;
      wipLimit?: number;
    }
  | {
      type: "UPDATE_COLUMN";
      boardId: string;
      columnId: string;
      patch: Partial<Pick<BoardColumn, "name" | "color" | "wipLimit">>;
    }
  | { type: "DELETE_COLUMN"; boardId: string; columnId: string }
  | {
      type: "REORDER_COLUMN";
      boardId: string;
      columnId: string;
      newOrder: number;
    }
  // Tasks
  | {
      type: "CREATE_TASK";
      boardId: string;
      columnId: string;
      title: string;
      taskType?: TaskType;
      priority?: TaskPriority;
      description?: string;
      /** Pre-attach the new task to a sprint (e.g. quick-create while a sprint filter is active). */
      sprintId?: string;
    }
  | {
      type: "UPDATE_TASK";
      taskId: string;
      patch: Partial<
        Pick<
          Task,
          | "title"
          | "description"
          | "type"
          | "priority"
          | "status"
          | "assignee"
          | "labels"
          | "storyPoints"
          | "dueDate"
          | "epicId"
          | "sprintId"
          | "backlogOrder"
        >
      >;
    }
  | { type: "DELETE_TASK"; taskId: string }
  | {
      type: "MOVE_TASK";
      taskId: string;
      targetColumnId: string;
      newOrder: number;
    }
  | {
      type: "MOVE_TASK_TO_BOARD";
      taskId: string;
      targetBoardId: string;
      /** Defaults to the first column of the target board. */
      targetColumnId?: string;
    }
  | { type: "ADD_COMMENT"; taskId: string; author: string; body: string }
  | { type: "DELETE_COMMENT"; taskId: string; commentId: string }
  | { type: "UPDATE_COMMENT"; taskId: string; commentId: string; body: string }
  // Sprints
  | {
      type: "CREATE_SPRINT";
      projectId: string;
      name: string;
      startDate: string;
      endDate: string;
      goal?: string;
    }
  | {
      type: "UPDATE_SPRINT";
      sprintId: string;
      patch: Partial<
        Pick<Sprint, "name" | "goal" | "startDate" | "endDate" | "status">
      >;
    }
  | { type: "START_SPRINT"; sprintId: string }
  | {
      type: "COMPLETE_SPRINT";
      sprintId: string;
      /**
       * Where to send tasks in the sprint that aren't "done" yet.
       * - `"backlog"`: clear `sprintId` so they fall back into the backlog.
       * - `{ moveToSprintId }`: reassign their `sprintId` to another sprint.
       * - omitted/`"keep"`: leave them attached to the now-completed sprint.
       */
      unfinishedTasks?: "backlog" | "keep" | { moveToSprintId: string };
    }
  // Epics
  | {
      type: "CREATE_EPIC";
      projectId: string;
      name: string;
      color?: string;
      description?: string;
      startDate?: string;
      targetDate?: string;
    }
  | {
      type: "UPDATE_EPIC";
      epicId: string;
      patch: Partial<
        Pick<
          Epic,
          | "name"
          | "color"
          | "description"
          | "status"
          | "startDate"
          | "targetDate"
        >
      >;
    }
  | { type: "DELETE_EPIC"; epicId: string };

export type BoardsActionType = BoardsAction["type"];

// ─── Event payloads pushed from main to renderer ─────────────────────────────

export type BoardsEvent =
  | {
      channel: "boards:project-changed";
      payload: { project: Project } | { deleted: string };
    }
  | {
      channel: "boards:board-changed";
      payload: { board: Board } | { deleted: string };
    }
  | {
      channel: "boards:tasks-changed";
      payload: { boardId: string; tasks: Task[] };
    }
  | {
      channel: "boards:sprints-changed";
      payload: { projectId: string; sprints: Sprint[] };
    }
  | {
      channel: "boards:epics-changed";
      payload: { projectId: string; epics: Epic[] };
    };

export type ProjectBundle = {
  project: Project;
  boards: Board[];
  tasks: Task[];
  sprints: Sprint[];
  epics: Epic[];
};
