import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type Server } from "http";
import { z } from "zod/v3";
import { getBoardsState } from "./state";
import type {
  Board,
  Epic,
  Project,
  Sprint,
  Task,
} from "../../shared/boards-types";

// ---------------------------------------------------------------------------
// Result helpers (mirrors the mock-server MCP convention)
// ---------------------------------------------------------------------------

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function ok(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

const taskTypeEnum = z.enum(["story", "task", "spike", "bug", "subtask"]);
const priorityEnum = z.enum(["critical", "high", "medium", "low"]);

/**
 * Lightweight task projection for list/overview tools. Omits the potentially
 * large `description` and full `comments` bodies so listing a big board doesn't
 * flood the caller's context — `hasDescription`/`commentCount` signal whether a
 * follow-up get_task is worthwhile.
 */
function summarizeTask(t: Task) {
  return {
    id: t.id,
    number: t.number,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status,
    columnId: t.columnId,
    boardId: t.boardId,
    assignee: t.assignee,
    sprintId: t.sprintId,
    epicId: t.epicId,
    labels: t.labels,
    storyPoints: t.storyPoints,
    dueDate: t.dueDate,
    order: t.order,
    blockedBy: t.blockedBy ?? [],
    hasDescription: Boolean(t.description && t.description.trim()),
    commentCount: t.comments?.length ?? 0,
    updatedAt: t.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// MCP server factory — a fresh server per session, all sharing the singleton
// BoardsStateManager so changes are immediately reflected in the UI.
// ---------------------------------------------------------------------------

function createConfiguredMcpServer(): McpServer {
  const mcp = new McpServer({
    name: "commiq-boards",
    version: "1.0.0",
  });
  const state = getBoardsState();

  // --- Usage guide ---

  mcp.tool(
    "get_usage_guide",
    "Get a usage guide for the boards (kanban) MCP — read this before creating content",
    {},
    async () => {
      const guide = `# Boards MCP Usage Guide

This MCP manages a kanban-style project tracker.

## Hierarchy
  Project → Board → Column → Task
  A Project also owns Sprints and Epics (project-scoped).

## Recommended workflow
1. list_projects — find an existing project, or create_project.
2. list_boards(projectId) — each new project starts empty; create_board.
3. get_board(boardId) — read the board's columns (each has an id) and tasks.
4. create_task(boardId, columnId, title, ...) — columnId must be one of the
   board's columns. Use get_board to discover valid column ids.
5. move_task(taskId, targetColumnId, newOrder) — move across columns; the
   task's status is kept in sync with the destination column name.

## Tasks
  - type: story | task | spike | bug | subtask (default: task)
  - priority: critical | high | medium | low (default: project default)
  - Attach to a sprint via sprintId, to an epic via epicId (update_task).
  - status mirrors the column name (lowercase) and updates automatically on move.

## Sprints
  - create_sprint → status "planning". start_sprint activates it (only one
    active sprint per project; others are auto-completed).
  - complete_sprint computes velocity and can send unfinished (non-"done")
    tasks to the backlog, keep them, or move them to another sprint.

## Blockers (task dependencies)
  - blockedBy lists the tasks that block a task — i.e. it depends on them.
    Blockers must be other tasks in the same project.
  - Mutate with add_blocker / remove_blocker / set_blockers. Self-references and
    cycles are rejected automatically.
  - A task is effectively blocked while any of its blockers is not yet "done".
  - get_blocker_graph(projectId) returns the whole dependency map (both
    directions, with each blocker's resolved state) for overview/visualisation.

## Reading large boards efficiently
  list_tasks, get_board and get_project return lightweight task *summaries* —
  no description or comment bodies, just hasDescription/commentCount flags.
  Fetch a single task's full detail (description + comments) with get_task(taskId)
  only when you actually need it. This keeps large boards from flooding context.

## IDs
  Every entity has a stable id. Tools that create return the new entity with its
  id — capture it to chain further operations.`;
      return ok(guide);
    },
  );

  // =========================================================================
  // PROJECT tools
  // =========================================================================

  mcp.tool(
    "list_projects",
    "List all projects with their ids, names and descriptions",
    {},
    async () => ok(state.listProjects()),
  );

  mcp.tool(
    "get_project",
    "Get a project bundle: the project record plus its boards, sprints, epics and task summaries (no description or comment bodies — use get_task for full detail)",
    { projectId: z.string() },
    async ({ projectId }) => {
      const bundle = state.getProjectBundle(projectId);
      if (!bundle) return err("Project not found");
      return ok({ ...bundle, tasks: bundle.tasks.map(summarizeTask) });
    },
  );

  mcp.tool(
    "create_project",
    "Create a new project. Returns the created project including its id.",
    {
      name: z.string(),
      description: z.string().optional(),
      icon: z.string().optional().describe("Lucide icon name, e.g. SquareKanban"),
      color: z.string().optional().describe("Hex color, e.g. #3b82f6"),
    },
    async (args) => {
      const project = state.dispatch({
        type: "CREATE_PROJECT",
        ...args,
      }) as Project | null;
      return project ? ok(project) : err("Failed to create project");
    },
  );

  mcp.tool(
    "update_project",
    "Update a project's name, description, icon or color",
    {
      projectId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
    },
    async ({ projectId, ...patch }) => {
      const project = state.dispatch({
        type: "UPDATE_PROJECT",
        projectId,
        patch,
      }) as Project | null;
      return project ? ok(project) : err("Project not found");
    },
  );

  mcp.tool(
    "delete_project",
    "Delete a project and all of its boards, tasks, sprints and epics",
    { projectId: z.string() },
    async ({ projectId }) => {
      const okDeleted = state.dispatch({
        type: "DELETE_PROJECT",
        projectId,
      }) as boolean;
      return okDeleted ? ok("Deleted") : err("Project not found");
    },
  );

  // =========================================================================
  // BOARD tools
  // =========================================================================

  mcp.tool(
    "list_boards",
    "List the boards in a project",
    { projectId: z.string() },
    async ({ projectId }) => ok(state.listBoards(projectId)),
  );

  mcp.tool(
    "get_board",
    "Get a board including its columns (each with an id) and task summaries (no description or comment bodies — use get_task for full detail)",
    { boardId: z.string() },
    async ({ boardId }) => {
      const board = state.getBoard(boardId);
      if (!board) return err("Board not found");
      return ok({ ...board, tasks: state.listTasks(boardId).map(summarizeTask) });
    },
  );

  mcp.tool(
    "create_board",
    "Create a board in a project. The board is seeded with the project's default columns.",
    { projectId: z.string(), name: z.string() },
    async ({ projectId, name }) => {
      const board = state.dispatch({
        type: "CREATE_BOARD",
        projectId,
        name,
      }) as Board | null;
      return board ? ok(board) : err("Project not found");
    },
  );

  mcp.tool(
    "update_board",
    "Rename a board",
    { boardId: z.string(), name: z.string() },
    async ({ boardId, name }) => {
      const board = state.dispatch({
        type: "UPDATE_BOARD",
        boardId,
        patch: { name },
      }) as Board | null;
      return board ? ok(board) : err("Board not found");
    },
  );

  mcp.tool(
    "delete_board",
    "Delete a board and its tasks",
    { boardId: z.string() },
    async ({ boardId }) => {
      const okDeleted = state.dispatch({
        type: "DELETE_BOARD",
        boardId,
      }) as boolean;
      return okDeleted ? ok("Deleted") : err("Board not found");
    },
  );

  // =========================================================================
  // COLUMN tools
  // =========================================================================

  mcp.tool(
    "create_column",
    "Add a column (swim lane) to a board",
    {
      boardId: z.string(),
      name: z.string(),
      color: z.string().optional().describe("Hex color, e.g. #64748b"),
      wipLimit: z.number().int().min(0).optional(),
    },
    async (args) => {
      const column = state.dispatch({ type: "CREATE_COLUMN", ...args });
      return column ? ok(column) : err("Board not found");
    },
  );

  mcp.tool(
    "update_column",
    "Update a column's name, color or WIP limit",
    {
      boardId: z.string(),
      columnId: z.string(),
      name: z.string().optional(),
      color: z.string().optional(),
      wipLimit: z.number().int().min(0).optional(),
    },
    async ({ boardId, columnId, ...patch }) => {
      const column = state.dispatch({
        type: "UPDATE_COLUMN",
        boardId,
        columnId,
        patch,
      });
      return column ? ok(column) : err("Board or column not found");
    },
  );

  mcp.tool(
    "delete_column",
    "Delete a column from a board. Tasks in that column are removed.",
    { boardId: z.string(), columnId: z.string() },
    async ({ boardId, columnId }) => {
      const okDeleted = state.dispatch({
        type: "DELETE_COLUMN",
        boardId,
        columnId,
      }) as boolean;
      return okDeleted ? ok("Deleted") : err("Board or column not found");
    },
  );

  mcp.tool(
    "reorder_column",
    "Set a column's order index within its board",
    {
      boardId: z.string(),
      columnId: z.string(),
      newOrder: z.number().int().min(0),
    },
    async ({ boardId, columnId, newOrder }) => {
      state.dispatch({ type: "REORDER_COLUMN", boardId, columnId, newOrder });
      const board = state.getBoard(boardId);
      return board ? ok(board.columns) : err("Board not found");
    },
  );

  // =========================================================================
  // TASK tools
  // =========================================================================

  mcp.tool(
    "list_tasks",
    "List a board's tasks as lightweight summaries (no description or comment bodies). Use get_task for a single task's full detail.",
    { boardId: z.string() },
    async ({ boardId }) => ok(state.listTasks(boardId).map(summarizeTask)),
  );

  mcp.tool(
    "get_task",
    "Get a single task by id with full detail, including its description and comments",
    { taskId: z.string() },
    async ({ taskId }) => {
      const task = state.getTask(taskId);
      return task ? ok(task) : err("Task not found");
    },
  );

  mcp.tool(
    "create_task",
    "Create a task in a board column. columnId must be one of the board's columns (see get_board). Returns the created task with its id and sequential number.",
    {
      boardId: z.string(),
      columnId: z.string(),
      title: z.string(),
      taskType: taskTypeEnum.optional(),
      priority: priorityEnum.optional(),
      description: z.string().optional(),
      sprintId: z.string().optional(),
    },
    async (args) => {
      const task = state.dispatch({ type: "CREATE_TASK", ...args }) as
        | Task
        | null;
      return task ? ok(task) : err("Board or column not found");
    },
  );

  mcp.tool(
    "update_task",
    "Update a task's fields. Use move_task to change column. epicId/sprintId of empty string detaches the task.",
    {
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: taskTypeEnum.optional(),
      priority: priorityEnum.optional(),
      status: z.string().optional(),
      assignee: z.string().optional(),
      labels: z.array(z.string()).optional(),
      storyPoints: z.number().optional(),
      dueDate: z.string().optional(),
      epicId: z.string().optional(),
      sprintId: z.string().optional(),
    },
    async ({ taskId, ...patch }) => {
      const task = state.dispatch({
        type: "UPDATE_TASK",
        taskId,
        patch,
      }) as Task | null;
      return task ? ok(task) : err("Task not found");
    },
  );

  mcp.tool(
    "delete_task",
    "Delete a task",
    { taskId: z.string() },
    async ({ taskId }) => {
      const okDeleted = state.dispatch({
        type: "DELETE_TASK",
        taskId,
      }) as boolean;
      return okDeleted ? ok("Deleted") : err("Task not found");
    },
  );

  mcp.tool(
    "move_task",
    "Move a task to a column and position within the same board. The task's status is synced to the destination column name.",
    {
      taskId: z.string(),
      targetColumnId: z.string(),
      newOrder: z.number().int().min(0),
    },
    async ({ taskId, targetColumnId, newOrder }) => {
      const task = state.dispatch({
        type: "MOVE_TASK",
        taskId,
        targetColumnId,
        newOrder,
      }) as Task | null;
      return task ? ok(task) : err("Task not found");
    },
  );

  mcp.tool(
    "move_task_to_board",
    "Move a task to a different board (optionally targeting a column; defaults to the first column)",
    {
      taskId: z.string(),
      targetBoardId: z.string(),
      targetColumnId: z.string().optional(),
    },
    async ({ taskId, targetBoardId, targetColumnId }) => {
      const task = state.dispatch({
        type: "MOVE_TASK_TO_BOARD",
        taskId,
        targetBoardId,
        targetColumnId,
      }) as Task | null;
      return task ? ok(task) : err("Task or target board not found");
    },
  );

  // --- Comment tools ---

  mcp.tool(
    "add_comment",
    "Add a comment to a task",
    { taskId: z.string(), author: z.string(), body: z.string() },
    async ({ taskId, author, body }) => {
      const task = state.dispatch({
        type: "ADD_COMMENT",
        taskId,
        author,
        body,
      }) as Task | null;
      return task ? ok(task) : err("Task not found");
    },
  );

  mcp.tool(
    "update_comment",
    "Edit the body of an existing comment on a task",
    { taskId: z.string(), commentId: z.string(), body: z.string() },
    async ({ taskId, commentId, body }) => {
      const okUpdated = state.dispatch({
        type: "UPDATE_COMMENT",
        taskId,
        commentId,
        body,
      }) as boolean;
      return okUpdated ? ok("Updated") : err("Task or comment not found");
    },
  );

  mcp.tool(
    "delete_comment",
    "Delete a comment from a task",
    { taskId: z.string(), commentId: z.string() },
    async ({ taskId, commentId }) => {
      const okDeleted = state.dispatch({
        type: "DELETE_COMMENT",
        taskId,
        commentId,
      }) as boolean;
      return okDeleted ? ok("Deleted") : err("Task or comment not found");
    },
  );

  // =========================================================================
  // BLOCKER tools (task dependencies)
  // =========================================================================

  mcp.tool(
    "set_blockers",
    "Replace a task's blocker list — the tasks that block it (it depends on them). blockerIds must be tasks in the same project. Self-references, duplicates and cycle-forming ids are dropped. Returns the updated task.",
    { taskId: z.string(), blockerIds: z.array(z.string()) },
    async ({ taskId, blockerIds }) => {
      const task = state.dispatch({
        type: "SET_TASK_BLOCKERS",
        taskId,
        blockerIds,
      }) as Task | null;
      return task ? ok(task) : err("Task not found");
    },
  );

  mcp.tool(
    "add_blocker",
    "Add a single blocker to a task (the task will depend on blockerId). Ignored if it would create a self-reference or dependency cycle.",
    { taskId: z.string(), blockerId: z.string() },
    async ({ taskId, blockerId }) => {
      const task = state.dispatch({
        type: "ADD_TASK_BLOCKER",
        taskId,
        blockerId,
      }) as Task | null;
      return task ? ok(task) : err("Task not found");
    },
  );

  mcp.tool(
    "remove_blocker",
    "Remove a single blocker from a task",
    { taskId: z.string(), blockerId: z.string() },
    async ({ taskId, blockerId }) => {
      const task = state.dispatch({
        type: "REMOVE_TASK_BLOCKER",
        taskId,
        blockerId,
      }) as Task | null;
      return task ? ok(task) : err("Task not found");
    },
  );

  mcp.tool(
    "get_blocker_graph",
    "Get the project's dependency graph: every task that has blockers and/or blocks others, with both directions resolved. Each entry is blocked (status not 'done') only while an unresolved blocker remains.",
    { projectId: z.string() },
    async ({ projectId }) => {
      const bundle = state.getProjectBundle(projectId);
      if (!bundle) return err("Project not found");
      const byId = new Map(bundle.tasks.map((t) => [t.id, t]));
      const blocks = new Map<string, string[]>();
      for (const t of bundle.tasks) {
        for (const b of t.blockedBy ?? []) {
          blocks.set(b, [...(blocks.get(b) ?? []), t.id]);
        }
      }
      const nodes = bundle.tasks
        .filter(
          (t) => (t.blockedBy?.length ?? 0) > 0 || (blocks.get(t.id)?.length ?? 0) > 0,
        )
        .map((t) => {
          const blockers = (t.blockedBy ?? []).map((id) => {
            const bt = byId.get(id);
            return {
              id,
              title: bt?.title ?? "(unknown)",
              status: bt?.status ?? null,
              resolved: bt ? bt.status.toLowerCase() === "done" : false,
            };
          });
          return {
            id: t.id,
            number: t.number,
            title: t.title,
            status: t.status,
            blockedBy: blockers,
            blocks: blocks.get(t.id) ?? [],
            isBlocked:
              t.status.toLowerCase() !== "done" &&
              blockers.some((b) => !b.resolved),
          };
        });
      return ok(nodes);
    },
  );

  // =========================================================================
  // SPRINT tools
  // =========================================================================

  mcp.tool(
    "list_sprints",
    "List the sprints in a project",
    { projectId: z.string() },
    async ({ projectId }) => ok(state.listSprints(projectId)),
  );

  mcp.tool(
    "create_sprint",
    "Create a sprint (status starts as 'planning'). Dates are ISO 8601 strings.",
    {
      projectId: z.string(),
      name: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      goal: z.string().optional(),
    },
    async (args) => {
      const sprint = state.dispatch({ type: "CREATE_SPRINT", ...args }) as
        | Sprint
        | null;
      return sprint ? ok(sprint) : err("Project not found");
    },
  );

  mcp.tool(
    "update_sprint",
    "Update a sprint's name, goal, dates or status",
    {
      sprintId: z.string(),
      name: z.string().optional(),
      goal: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.enum(["planning", "active", "completed"]).optional(),
    },
    async ({ sprintId, ...patch }) => {
      const sprint = state.dispatch({
        type: "UPDATE_SPRINT",
        sprintId,
        patch,
      }) as Sprint | null;
      return sprint ? ok(sprint) : err("Sprint not found");
    },
  );

  mcp.tool(
    "start_sprint",
    "Activate a sprint. Any other active sprint in the project is auto-completed.",
    { sprintId: z.string() },
    async ({ sprintId }) => {
      const sprint = state.dispatch({
        type: "START_SPRINT",
        sprintId,
      }) as Sprint | null;
      return sprint ? ok(sprint) : err("Sprint not found");
    },
  );

  mcp.tool(
    "complete_sprint",
    "Complete a sprint, computing its velocity. Choose what happens to unfinished (non-'done') tasks.",
    {
      sprintId: z.string(),
      unfinishedTasks: z
        .enum(["backlog", "keep"])
        .optional()
        .describe("Where unfinished tasks go. Default: keep."),
      moveToSprintId: z
        .string()
        .optional()
        .describe(
          "If set, unfinished tasks are reassigned to this sprint (overrides unfinishedTasks).",
        ),
    },
    async ({ sprintId, unfinishedTasks, moveToSprintId }) => {
      const resolution = moveToSprintId
        ? { moveToSprintId }
        : (unfinishedTasks ?? "keep");
      const sprint = state.dispatch({
        type: "COMPLETE_SPRINT",
        sprintId,
        unfinishedTasks: resolution,
      }) as Sprint | null;
      return sprint ? ok(sprint) : err("Sprint not found");
    },
  );

  // =========================================================================
  // EPIC tools
  // =========================================================================

  mcp.tool(
    "list_epics",
    "List the epics in a project",
    { projectId: z.string() },
    async ({ projectId }) => ok(state.listEpics(projectId)),
  );

  mcp.tool(
    "create_epic",
    "Create an epic in a project",
    {
      projectId: z.string(),
      name: z.string(),
      color: z.string().optional(),
      description: z.string().optional(),
      startDate: z.string().optional(),
      targetDate: z.string().optional(),
    },
    async (args) => {
      const epic = state.dispatch({ type: "CREATE_EPIC", ...args }) as
        | Epic
        | null;
      return epic ? ok(epic) : err("Project not found");
    },
  );

  mcp.tool(
    "update_epic",
    "Update an epic's fields",
    {
      epicId: z.string(),
      name: z.string().optional(),
      color: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["active", "completed", "archived"]).optional(),
      startDate: z.string().optional(),
      targetDate: z.string().optional(),
    },
    async ({ epicId, ...patch }) => {
      const epic = state.dispatch({
        type: "UPDATE_EPIC",
        epicId,
        patch,
      }) as Epic | null;
      return epic ? ok(epic) : err("Epic not found");
    },
  );

  mcp.tool(
    "delete_epic",
    "Delete an epic. Tasks linked to it are detached.",
    { epicId: z.string() },
    async ({ epicId }) => {
      const okDeleted = state.dispatch({
        type: "DELETE_EPIC",
        epicId,
      }) as boolean;
      return okDeleted ? ok("Deleted") : err("Epic not found");
    },
  );

  // =========================================================================
  // RESOURCES — read-only browseable views
  // =========================================================================

  mcp.resource(
    "all-projects",
    "boards://projects",
    { description: "List all projects with summary info" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(state.listProjects(), null, 2),
          mimeType: "application/json",
        },
      ],
    }),
  );

  mcp.resource(
    "project-bundle",
    new ResourceTemplate("boards://project/{projectId}", {
      list: async () => ({
        resources: state.listProjects().map((p) => ({
          uri: `boards://project/${p.id}`,
          name: p.name,
        })),
      }),
    }),
    async (uri, { projectId }) => {
      const bundle = state.getProjectBundle(projectId as string);
      return {
        contents: [
          {
            uri: uri.href,
            text: bundle
              ? JSON.stringify(
                  { ...bundle, tasks: bundle.tasks.map(summarizeTask) },
                  null,
                  2,
                )
              : "Project not found",
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  mcp.resource(
    "board-tasks",
    new ResourceTemplate("boards://board/{boardId}/tasks", {
      list: async () => {
        const resources: { uri: string; name: string }[] = [];
        for (const p of state.listProjects()) {
          for (const b of state.listBoards(p.id)) {
            resources.push({
              uri: `boards://board/${b.id}/tasks`,
              name: `${p.name} / ${b.name} — Tasks`,
            });
          }
        }
        return { resources };
      },
    }),
    async (uri, { boardId }) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(
            state.listTasks(boardId as string).map(summarizeTask),
            null,
            2,
          ),
          mimeType: "application/json",
        },
      ],
    }),
  );

  return mcp;
}

// ---------------------------------------------------------------------------
// HTTP server lifecycle (same dual-transport pattern as whiteboard/mock-server)
// ---------------------------------------------------------------------------

let httpServer: Server | null = null;
const sessions = new Map<
  string,
  {
    transport: SSEServerTransport | StreamableHTTPServerTransport;
    server: McpServer;
  }
>();

export async function startBoardsMcp(
  port: number,
): Promise<{ success: boolean; error?: string }> {
  if (httpServer)
    return { success: false, error: "MCP server already running" };

  return new Promise((resolve) => {
    httpServer = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);

      // --- Streamable HTTP transport on /mcp ---
      if (url.pathname === "/mcp") {
        let parsedBody: unknown;
        if (req.method === "POST") {
          parsedBody = await new Promise<unknown>((r) => {
            let data = "";
            req.on("data", (chunk: Buffer) => {
              data += chunk.toString();
            });
            req.on("end", () => {
              try {
                r(JSON.parse(data));
              } catch {
                r(undefined);
              }
            });
          });
        }

        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        const existing = sessionId ? sessions.get(sessionId) : undefined;

        if (
          existing &&
          existing.transport instanceof StreamableHTTPServerTransport
        ) {
          await existing.transport.handleRequest(
            req as IncomingMessage & { auth?: undefined },
            res,
            parsedBody,
          );
        } else if (!sessionId && req.method === "POST") {
          const mcp = createConfiguredMcpServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          await mcp.connect(transport);
          await transport.handleRequest(
            req as IncomingMessage & { auth?: undefined },
            res,
            parsedBody,
          );
          if (transport.sessionId) {
            sessions.set(transport.sessionId, { transport, server: mcp });
            transport.onclose = () => {
              if (transport.sessionId) sessions.delete(transport.sessionId);
            };
          }
        } else if (req.method === "DELETE" && existing) {
          await existing.transport.close?.();
          if (sessionId) sessions.delete(sessionId);
          res.writeHead(200).end();
        } else {
          res.writeHead(400).end("Bad request");
        }
        return;
      }

      // --- Legacy SSE transport on /sse + /messages ---
      if (url.pathname === "/sse" && req.method === "GET") {
        const mcp = createConfiguredMcpServer();
        const transport = new SSEServerTransport("/messages", res);
        sessions.set(transport.sessionId, { transport, server: mcp });
        res.on("close", () => sessions.delete(transport.sessionId));
        await mcp.connect(transport);
      } else if (url.pathname === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId");
        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (session && session.transport instanceof SSEServerTransport) {
          await session.transport.handlePostMessage(req, res);
        } else {
          res.writeHead(404).end("Session not found");
        }
      } else {
        res.writeHead(404).end("Not found");
      }
    });

    httpServer.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE") {
        httpServer = null;
        resolve({ success: false, error: `Port ${port} is already in use` });
      }
    });

    httpServer.listen(port, "127.0.0.1", () => {
      resolve({ success: true });
    });
  });
}

export async function stopBoardsMcp(): Promise<void> {
  if (!httpServer) return;
  for (const { transport } of sessions.values()) {
    await transport.close().catch(() => {});
  }
  sessions.clear();
  return new Promise((resolve) => {
    httpServer!.close(() => {
      httpServer = null;
      resolve();
    });
  });
}

export function getBoardsMcpStatus(): {
  running: boolean;
  port: number | null;
} {
  if (!httpServer) return { running: false, port: null };
  const addr = httpServer.address();
  return {
    running: true,
    port: typeof addr === "object" && addr ? addr.port : null,
  };
}
