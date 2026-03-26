import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { whiteboardState } from "./state";
import type { StickyColor } from "../../shared/whiteboard-types";
import { createServer, type IncomingMessage, type Server } from "http";
import { z } from "zod/v3";

let httpServer: Server | null = null;
const sessions = new Map<
  string,
  {
    transport: SSEServerTransport | StreamableHTTPServerTransport;
    server: McpServer;
  }
>();

function createConfiguredMcpServer(): McpServer {
  const mcp = new McpServer({
    name: "commiq-whiteboard",
    version: "1.0.0",
  });

  // --- Helper: format color meanings ---

  function formatColorMeanings(
    colorMeanings?: Partial<Record<StickyColor, string>>,
  ): string {
    if (!colorMeanings) return "";
    const entries = Object.entries(colorMeanings).filter(([, v]) => v);
    if (entries.length === 0) return "";
    return (
      "\n\nColor meanings on this board:\n" +
      entries.map(([c, m]) => `  ${c} = ${m}`).join("\n")
    );
  }

  function formatConnectionGraph(
    board: ReturnType<typeof whiteboardState.getBoard>,
  ): string {
    if (!board || board.connections.length === 0) return "";
    const lines = board.connections.map((conn) => {
      const from = board.stickies.find((s) => s.id === conn.fromStickyId);
      const to = board.stickies.find((s) => s.id === conn.toStickyId);
      const fromText = from?.text
        ? `"${from.text}"`
        : `(sticky ${conn.fromStickyId})`;
      const toText = to?.text ? `"${to.text}"` : `(sticky ${conn.toStickyId})`;
      const labelPart = conn.label ? ` [${conn.label}]` : "";
      return `  ${fromText} → ${toText}${labelPart}`;
    });
    return "\n\nConnection graph:\n" + lines.join("\n");
  }

  // --- Board tools ---

  mcp.tool("list_boards", "List all whiteboard boards", {}, async () => {
    const boards = whiteboardState.listBoards();
    return {
      content: [{ type: "text", text: JSON.stringify(boards, null, 2) }],
    };
  });

  mcp.tool(
    "get_board",
    "Get full board state",
    { boardId: z.string() },
    async ({ boardId }) => {
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return {
          content: [{ type: "text", text: "Board not found" }],
          isError: true,
        };
      const meanings = formatColorMeanings(board.colorMeanings);
      const graph = formatConnectionGraph(board);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(board, null, 2) + meanings + graph,
          },
        ],
      };
    },
  );

  mcp.tool(
    "create_board",
    "Create a new board",
    {
      name: z.string(),
      workspaceId: z.string().optional(),
    },
    async ({ name, workspaceId }) => {
      const board = whiteboardState.createBoard(name, workspaceId ?? null);
      return {
        content: [{ type: "text", text: JSON.stringify(board, null, 2) }],
      };
    },
  );

  mcp.tool(
    "delete_board",
    "Delete a board",
    { boardId: z.string() },
    async ({ boardId }) => {
      const ok = whiteboardState.deleteBoard(boardId);
      return {
        content: [{ type: "text", text: ok ? "Deleted" : "Board not found" }],
        isError: !ok,
      };
    },
  );

  // --- Sticky tools ---

  mcp.tool(
    "create_sticky",
    "Create a sticky note on a board",
    {
      boardId: z.string(),
      text: z.string().optional(),
      color: z
        .enum(["yellow", "blue", "green", "pink", "purple", "orange", "red"])
        .optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      metadata: z.record(z.string()).optional(),
    },
    async ({ boardId, ...data }) => {
      const sticky = whiteboardState.createSticky(boardId, data);
      if (!sticky)
        return {
          content: [{ type: "text", text: "Board not found" }],
          isError: true,
        };
      const board = whiteboardState.getBoard(boardId);
      const meanings = formatColorMeanings(board?.colorMeanings);
      return {
        content: [
          { type: "text", text: JSON.stringify(sticky, null, 2) + meanings },
        ],
      };
    },
  );

  mcp.tool(
    "update_sticky",
    "Update a sticky note",
    {
      boardId: z.string(),
      stickyId: z.string(),
      text: z.string().optional(),
      color: z
        .enum(["yellow", "blue", "green", "pink", "purple", "orange", "red"])
        .optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      metadata: z.record(z.string()).optional(),
    },
    async ({ boardId, stickyId, ...patch }) => {
      const sticky = whiteboardState.updateSticky(boardId, stickyId, patch);
      if (!sticky)
        return {
          content: [{ type: "text", text: "Board or sticky not found" }],
          isError: true,
        };
      const board = whiteboardState.getBoard(boardId);
      const meanings = formatColorMeanings(board?.colorMeanings);
      return {
        content: [
          { type: "text", text: JSON.stringify(sticky, null, 2) + meanings },
        ],
      };
    },
  );

  mcp.tool(
    "delete_sticky",
    "Delete a sticky and its connections",
    {
      boardId: z.string(),
      stickyId: z.string(),
    },
    async ({ boardId, stickyId }) => {
      const ok = whiteboardState.deleteSticky(boardId, stickyId);
      return {
        content: [{ type: "text", text: ok ? "Deleted" : "Not found" }],
        isError: !ok,
      };
    },
  );

  // --- Color meaning tools ---

  mcp.tool(
    "get_color_meanings",
    "Get semantic color meanings for a board",
    { boardId: z.string() },
    async ({ boardId }) => {
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return {
          content: [{ type: "text", text: "Board not found" }],
          isError: true,
        };
      const meanings = board.colorMeanings ?? {};
      return {
        content: [{ type: "text", text: JSON.stringify(meanings, null, 2) }],
      };
    },
  );

  mcp.tool(
    "set_color_meaning",
    "Set the semantic meaning for a sticky color on a board",
    {
      boardId: z.string(),
      color: z.enum([
        "yellow",
        "blue",
        "green",
        "pink",
        "purple",
        "orange",
        "red",
      ]),
      meaning: z.string(),
    },
    async ({ boardId, color, meaning }) => {
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return {
          content: [{ type: "text", text: "Board not found" }],
          isError: true,
        };
      const colorMeanings = {
        ...(board.colorMeanings ?? {}),
        [color]: meaning,
      };
      whiteboardState.updateBoard(boardId, { colorMeanings });
      return {
        content: [
          { type: "text", text: JSON.stringify(colorMeanings, null, 2) },
        ],
      };
    },
  );

  mcp.tool(
    "clear_color_meaning",
    "Remove the semantic meaning for a sticky color on a board",
    {
      boardId: z.string(),
      color: z.enum([
        "yellow",
        "blue",
        "green",
        "pink",
        "purple",
        "orange",
        "red",
      ]),
    },
    async ({ boardId, color }) => {
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return {
          content: [{ type: "text", text: "Board not found" }],
          isError: true,
        };
      const colorMeanings = { ...(board.colorMeanings ?? {}) };
      delete colorMeanings[color as StickyColor];
      whiteboardState.updateBoard(boardId, { colorMeanings });
      return {
        content: [
          { type: "text", text: JSON.stringify(colorMeanings, null, 2) },
        ],
      };
    },
  );

  // --- Frame tools ---

  mcp.tool(
    "create_frame",
    "Create a frame to group stickies",
    {
      boardId: z.string(),
      label: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      color: z.string().optional(),
    },
    async ({ boardId, ...data }) => {
      const frame = whiteboardState.createFrame(boardId, data);
      if (!frame)
        return {
          content: [{ type: "text", text: "Board not found" }],
          isError: true,
        };
      return {
        content: [{ type: "text", text: JSON.stringify(frame, null, 2) }],
      };
    },
  );

  mcp.tool(
    "update_frame",
    "Update a frame",
    {
      boardId: z.string(),
      frameId: z.string(),
      label: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      color: z.string().optional(),
    },
    async ({ boardId, frameId, ...patch }) => {
      const frame = whiteboardState.updateFrame(boardId, frameId, patch);
      if (!frame)
        return {
          content: [{ type: "text", text: "Not found" }],
          isError: true,
        };
      return {
        content: [{ type: "text", text: JSON.stringify(frame, null, 2) }],
      };
    },
  );

  mcp.tool(
    "delete_frame",
    "Delete a frame (stickies are ungrouped)",
    {
      boardId: z.string(),
      frameId: z.string(),
    },
    async ({ boardId, frameId }) => {
      const ok = whiteboardState.deleteFrame(boardId, frameId);
      return {
        content: [{ type: "text", text: ok ? "Deleted" : "Not found" }],
        isError: !ok,
      };
    },
  );

  // --- Connection tools ---

  mcp.tool(
    "connect",
    "Create a directed connection between two stickies",
    {
      boardId: z.string(),
      fromStickyId: z.string(),
      toStickyId: z.string(),
      label: z.string().optional(),
    },
    async ({ boardId, fromStickyId, toStickyId, label }) => {
      const conn = whiteboardState.connect(
        boardId,
        fromStickyId,
        toStickyId,
        label,
      );
      if (!conn)
        return {
          content: [{ type: "text", text: "Board or stickies not found" }],
          isError: true,
        };
      return {
        content: [{ type: "text", text: JSON.stringify(conn, null, 2) }],
      };
    },
  );

  mcp.tool(
    "update_connection",
    "Update a connection label",
    {
      boardId: z.string(),
      connectionId: z.string(),
      label: z.string().optional(),
    },
    async ({ boardId, connectionId, label }) => {
      const conn = whiteboardState.updateConnection(boardId, connectionId, {
        label,
      });
      if (!conn)
        return {
          content: [{ type: "text", text: "Not found" }],
          isError: true,
        };
      return {
        content: [{ type: "text", text: JSON.stringify(conn, null, 2) }],
      };
    },
  );

  mcp.tool(
    "disconnect",
    "Remove a connection",
    {
      boardId: z.string(),
      connectionId: z.string(),
    },
    async ({ boardId, connectionId }) => {
      const ok = whiteboardState.disconnect(boardId, connectionId);
      return {
        content: [{ type: "text", text: ok ? "Disconnected" : "Not found" }],
        isError: !ok,
      };
    },
  );

  // --- Resources ---

  mcp.resource(
    "all-boards",
    "boards://list",
    {
      description:
        "List all whiteboard boards with their IDs, names, and content summaries",
    },
    async (uri) => {
      const boards = whiteboardState.listBoards();
      const details = boards.map((b) => {
        const full = whiteboardState.getBoard(b.id);
        return {
          id: b.id,
          name: b.name,
          stickies: full?.stickies.length ?? 0,
          frames: full?.frames.length ?? 0,
          connections: full?.connections.length ?? 0,
          colorMeanings: full?.colorMeanings ?? {},
          resourceUris: {
            stickies: `board://${b.id}/stickies`,
            frames: `board://${b.id}/frames`,
            connections: `board://${b.id}/connections`,
            colorMeanings: `board://${b.id}/color-meanings`,
          },
        };
      });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(details, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  mcp.resource(
    "board-color-meanings",
    new ResourceTemplate("board://{boardId}/color-meanings", {
      list: async () =>
        whiteboardState.listBoards().map((b) => ({
          uri: `board://${b.id}/color-meanings`,
          name: `${b.name} - Color Meanings`,
        })),
    }),
    async (uri, { boardId }) => {
      const board = whiteboardState.getBoard(boardId as string);
      if (!board)
        return { contents: [{ uri: uri.href, text: "Board not found" }] };
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              { boardId: board.id, colorMeanings: board.colorMeanings ?? {} },
              null,
              2,
            ),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  mcp.resource(
    "board-stickies",
    new ResourceTemplate("board://{boardId}/stickies", {
      list: async () =>
        whiteboardState.listBoards().map((b) => ({
          uri: `board://${b.id}/stickies`,
          name: `${b.name} - Stickies`,
        })),
    }),
    async (uri, { boardId }) => {
      const board = whiteboardState.getBoard(boardId as string);
      if (!board)
        return { contents: [{ uri: uri.href, text: "Board not found" }] };
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(board.stickies, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  mcp.resource(
    "board-frames",
    new ResourceTemplate("board://{boardId}/frames", {
      list: async () =>
        whiteboardState.listBoards().map((b) => ({
          uri: `board://${b.id}/frames`,
          name: `${b.name} - Frames`,
        })),
    }),
    async (uri, { boardId }) => {
      const board = whiteboardState.getBoard(boardId as string);
      if (!board)
        return { contents: [{ uri: uri.href, text: "Board not found" }] };
      const framesWithStickies = board.frames.map((f) => ({
        ...f,
        stickyIds: board.stickies
          .filter((s) => s.frameId === f.id)
          .map((s) => s.id),
      }));
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(framesWithStickies, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  mcp.resource(
    "board-connections",
    new ResourceTemplate("board://{boardId}/connections", {
      list: async () =>
        whiteboardState.listBoards().map((b) => ({
          uri: `board://${b.id}/connections`,
          name: `${b.name} - Connections`,
        })),
    }),
    async (uri, { boardId }) => {
      const board = whiteboardState.getBoard(boardId as string);
      if (!board)
        return { contents: [{ uri: uri.href, text: "Board not found" }] };
      const enriched = board.connections.map((conn) => {
        const from = board.stickies.find((s) => s.id === conn.fromStickyId);
        const to = board.stickies.find((s) => s.id === conn.toStickyId);
        return {
          ...conn,
          fromStickyText: from?.text ?? null,
          toStickyText: to?.text ?? null,
        };
      });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(enriched, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  return mcp;
}

export async function startMcpServer(
  port: number,
): Promise<{ success: boolean; error?: string }> {
  if (httpServer) return { success: false, error: "Server already running" };

  return new Promise((resolve) => {
    httpServer = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);

      // --- Streamable HTTP transport on /mcp ---
      if (url.pathname === "/mcp") {
        // Parse body for POST requests
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

        // Check for existing session
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
          // New session — create per-session McpServer + transport
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

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        httpServer = null;
        resolve({ success: false, error: `Port ${port} is already in use` });
      }
    });

    httpServer.listen(port, "127.0.0.1", () => {
      resolve({ success: true });
    });
  });
}

export async function stopMcpServer(): Promise<void> {
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

export function getMcpStatus(): { running: boolean; port: number | null } {
  if (!httpServer) return { running: false, port: null };
  const addr = httpServer.address();
  return {
    running: true,
    port: typeof addr === "object" && addr ? addr.port : null,
  };
}
