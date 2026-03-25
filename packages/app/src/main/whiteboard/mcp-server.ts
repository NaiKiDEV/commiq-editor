import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { whiteboardState } from './state';
import { createServer, type Server } from 'http';
import { z } from 'zod';

let httpServer: Server | null = null;
let mcpServer: McpServer | null = null;

export async function startMcpServer(
  port: number,
): Promise<{ success: boolean; error?: string }> {
  if (httpServer) return { success: false, error: 'Server already running' };

  mcpServer = new McpServer({
    name: 'commiq-whiteboard',
    version: '1.0.0',
  });

  // --- Board tools ---

  mcpServer.tool(
    'list_boards',
    'List all whiteboard boards',
    {},
    async () => {
      const boards = whiteboardState.listBoards();
      return {
        content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'get_board',
    'Get full board state',
    { boardId: z.string() },
    async ({ boardId }) => {
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return {
          content: [{ type: 'text', text: 'Board not found' }],
          isError: true,
        };
      return {
        content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'create_board',
    'Create a new board',
    {
      name: z.string(),
      workspaceId: z.string().optional(),
    },
    async ({ name, workspaceId }) => {
      const board = whiteboardState.createBoard(name, workspaceId ?? null);
      return {
        content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'delete_board',
    'Delete a board',
    { boardId: z.string() },
    async ({ boardId }) => {
      const ok = whiteboardState.deleteBoard(boardId);
      return {
        content: [{ type: 'text', text: ok ? 'Deleted' : 'Board not found' }],
        isError: !ok,
      };
    },
  );

  // --- Sticky tools ---

  mcpServer.tool(
    'create_sticky',
    'Create a sticky note on a board',
    {
      boardId: z.string(),
      text: z.string().optional(),
      color: z
        .enum(['yellow', 'blue', 'green', 'pink', 'purple'])
        .optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      metadata: z.record(z.string()).optional(),
    },
    async ({ boardId, ...data }) => {
      const sticky = whiteboardState.createSticky(boardId, data);
      if (!sticky)
        return {
          content: [{ type: 'text', text: 'Board not found' }],
          isError: true,
        };
      return {
        content: [{ type: 'text', text: JSON.stringify(sticky, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'update_sticky',
    'Update a sticky note',
    {
      boardId: z.string(),
      stickyId: z.string(),
      text: z.string().optional(),
      color: z
        .enum(['yellow', 'blue', 'green', 'pink', 'purple'])
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
          content: [{ type: 'text', text: 'Board or sticky not found' }],
          isError: true,
        };
      return {
        content: [{ type: 'text', text: JSON.stringify(sticky, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'delete_sticky',
    'Delete a sticky and its connections',
    {
      boardId: z.string(),
      stickyId: z.string(),
    },
    async ({ boardId, stickyId }) => {
      const ok = whiteboardState.deleteSticky(boardId, stickyId);
      return {
        content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }],
        isError: !ok,
      };
    },
  );

  // --- Frame tools ---

  mcpServer.tool(
    'create_frame',
    'Create a frame to group stickies',
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
          content: [{ type: 'text', text: 'Board not found' }],
          isError: true,
        };
      return {
        content: [{ type: 'text', text: JSON.stringify(frame, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'update_frame',
    'Update a frame',
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
          content: [{ type: 'text', text: 'Not found' }],
          isError: true,
        };
      return {
        content: [{ type: 'text', text: JSON.stringify(frame, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'delete_frame',
    'Delete a frame (stickies are ungrouped)',
    {
      boardId: z.string(),
      frameId: z.string(),
    },
    async ({ boardId, frameId }) => {
      const ok = whiteboardState.deleteFrame(boardId, frameId);
      return {
        content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }],
        isError: !ok,
      };
    },
  );

  // --- Connection tools ---

  mcpServer.tool(
    'connect',
    'Create a directed connection between two stickies',
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
          content: [
            { type: 'text', text: 'Board or stickies not found' },
          ],
          isError: true,
        };
      return {
        content: [{ type: 'text', text: JSON.stringify(conn, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'update_connection',
    'Update a connection label',
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
          content: [{ type: 'text', text: 'Not found' }],
          isError: true,
        };
      return {
        content: [{ type: 'text', text: JSON.stringify(conn, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'disconnect',
    'Remove a connection',
    {
      boardId: z.string(),
      connectionId: z.string(),
    },
    async ({ boardId, connectionId }) => {
      const ok = whiteboardState.disconnect(boardId, connectionId);
      return {
        content: [
          { type: 'text', text: ok ? 'Disconnected' : 'Not found' },
        ],
        isError: !ok,
      };
    },
  );

  // --- Resources ---

  mcpServer.resource(
    'board-stickies',
    'board://{boardId}/stickies',
    async (uri) => {
      const url = new URL(typeof uri === 'string' ? uri : uri.href);
      const boardId = url.hostname;
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return { contents: [{ uri: url.href, text: 'Board not found' }] };
      return {
        contents: [
          {
            uri: url.href,
            text: JSON.stringify(board.stickies, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );

  mcpServer.resource(
    'board-frames',
    'board://{boardId}/frames',
    async (uri) => {
      const url = new URL(typeof uri === 'string' ? uri : uri.href);
      const boardId = url.hostname;
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return { contents: [{ uri: url.href, text: 'Board not found' }] };
      const framesWithStickies = board.frames.map((f) => ({
        ...f,
        stickyIds: board.stickies
          .filter((s) => s.frameId === f.id)
          .map((s) => s.id),
      }));
      return {
        contents: [
          {
            uri: url.href,
            text: JSON.stringify(framesWithStickies, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );

  mcpServer.resource(
    'board-connections',
    'board://{boardId}/connections',
    async (uri) => {
      const boardId = uri.hostname;
      const board = whiteboardState.getBoard(boardId);
      if (!board)
        return { contents: [{ uri: uri.href, text: 'Board not found' }] };
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(board.connections, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );

  // --- Start HTTP+SSE server ---

  const transports = new Map<string, SSEServerTransport>();

  return new Promise((resolve) => {
    httpServer = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);

      if (url.pathname === '/sse' && req.method === 'GET') {
        const transport = new SSEServerTransport('/messages', res);
        transports.set(transport.sessionId, transport);
        res.on('close', () => transports.delete(transport.sessionId));
        await mcpServer!.connect(transport);
      } else if (url.pathname === '/messages' && req.method === 'POST') {
        const sessionId = url.searchParams.get('sessionId');
        const transport = sessionId
          ? transports.get(sessionId)
          : undefined;
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.writeHead(404).end('Session not found');
        }
      } else {
        res.writeHead(404).end('Not found');
      }
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        httpServer = null;
        mcpServer = null;
        resolve({ success: false, error: `Port ${port} is already in use` });
      }
    });

    httpServer.listen(port, '127.0.0.1', () => {
      resolve({ success: true });
    });
  });
}

export async function stopMcpServer(): Promise<void> {
  if (!httpServer) return;
  return new Promise((resolve) => {
    httpServer!.close(() => {
      httpServer = null;
      mcpServer = null;
      resolve();
    });
  });
}

export function getMcpStatus(): { running: boolean; port: number | null } {
  if (!httpServer) return { running: false, port: null };
  const addr = httpServer.address();
  return {
    running: true,
    port: typeof addr === 'object' && addr ? addr.port : null,
  };
}
