import { contextBridge, ipcRenderer } from "electron";

type Bounds = { x: number; y: number; width: number; height: number };
type NavigationInfo = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

const electronAPI = {
  platform: process.platform,

  onShortcut: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) =>
      callback(action);
    ipcRenderer.on("app:shortcut", listener);
    return () => {
      ipcRenderer.removeListener("app:shortcut", listener);
    };
  },

  terminal: {
    getShells: () =>
      ipcRenderer.invoke("terminal:getShells") as Promise<string[]>,

    spawn: (sessionId: string, cwd?: string, shell?: string) =>
      ipcRenderer.invoke("terminal:spawn", sessionId, cwd, shell) as Promise<{
        pid: number;
      }>,

    write: (sessionId: string, data: string) =>
      ipcRenderer.send("terminal:write", sessionId, data),

    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send("terminal:resize", sessionId, cols, rows),

    kill: (sessionId: string) => ipcRenderer.invoke("terminal:kill", sessionId),

    onData: (sessionId: string, callback: (data: string) => void) => {
      const channel = `terminal:data:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, data: string) =>
        callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onExit: (sessionId: string, callback: (exitCode: number) => void) => {
      const channel = `terminal:exit:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, exitCode: number) =>
        callback(exitCode);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },

  notes: {
    list: () =>
      ipcRenderer.invoke("notes:list") as Promise<
        Array<{
          id: string;
          title: string;
          content: string;
          createdAt: string;
          updatedAt: string;
        }>
      >,

    create: (title: string) =>
      ipcRenderer.invoke("notes:create", title) as Promise<{
        id: string;
        title: string;
        content: string;
        createdAt: string;
        updatedAt: string;
      }>,

    update: (id: string, data: { title?: string; content?: string }) =>
      ipcRenderer.invoke("notes:update", id, data) as Promise<{
        id: string;
        title: string;
        content: string;
        createdAt: string;
        updatedAt: string;
      } | null>,

    delete: (id: string) =>
      ipcRenderer.invoke("notes:delete", id) as Promise<void>,
  },

  workspace: {
    load: () => ipcRenderer.invoke("workspace:load") as Promise<unknown>,

    save: (state: unknown) =>
      ipcRenderer.invoke("workspace:save", state) as Promise<void>,

    /** Synchronous save — blocks until the main process finishes writing. Use only in beforeunload. */
    saveSync: (state: unknown) =>
      ipcRenderer.sendSync("workspace:saveSync", state) as void,
  },

  workflow: {
    list: (workspaceId: string) =>
      ipcRenderer.invoke("workflow:list", workspaceId) as Promise<
        Array<{
          id: string;
          name: string;
          scope: "workspace" | "global";
          commands: Array<{ id: string; name: string; command: string }>;
        }>
      >,

    save: (
      workflow: {
        id: string;
        name: string;
        scope: "workspace" | "global";
        commands: Array<{ id: string; name: string; command: string }>;
      },
      workspaceId: string,
    ) =>
      ipcRenderer.invoke(
        "workflow:save",
        workflow,
        workspaceId,
      ) as Promise<void>,

    delete: (id: string, scope: "workspace" | "global", workspaceId: string) =>
      ipcRenderer.invoke(
        "workflow:delete",
        id,
        scope,
        workspaceId,
      ) as Promise<void>,
  },

  process: {
    list: () => ipcRenderer.invoke("process:list") as Promise<unknown[]>,

    kill: (pid: number) =>
      ipcRenderer.invoke("process:kill", pid) as Promise<{
        success: boolean;
        error?: string;
      }>,
  },

  ports: {
    list: () => ipcRenderer.invoke("ports:list") as Promise<unknown[]>,

    kill: (pid: number) =>
      ipcRenderer.invoke("ports:kill", pid) as Promise<{
        success: boolean;
        error?: string;
      }>,
  },

  env: {
    list: () =>
      ipcRenderer.invoke("env:list") as Promise<
        Array<{ name: string; value: string }>
      >,
  },

  settings: {
    load: () =>
      ipcRenderer.invoke("settings:load") as Promise<{
        terminal: {
          fontFamily: string;
          fontSize: number;
          cursorStyle: "block" | "underline" | "bar";
          scrollback: number;
        };
        browser: { defaultUrl: string };
        whiteboard: { mcpPort: number };
      }>,
    save: (s: {
      terminal: {
        fontFamily: string;
        fontSize: number;
        cursorStyle: "block" | "underline" | "bar";
        scrollback: number;
      };
      browser: { defaultUrl: string };
      whiteboard: { mcpPort: number };
    }) => ipcRenderer.invoke("settings:save", s) as Promise<void>,
  },

  timer: {
    list: () => ipcRenderer.invoke("timer:list") as Promise<unknown[]>,

    save: (timer: unknown) =>
      ipcRenderer.invoke("timer:save", timer) as Promise<void>,

    delete: (id: string) =>
      ipcRenderer.invoke("timer:delete", id) as Promise<void>,
  },

  http: {
    collectionsList: (workspaceId: string) =>
      ipcRenderer.invoke("http:collections:list", workspaceId) as Promise<
        Array<{
          id: string;
          name: string;
          scope: "workspace" | "global";
          workspaceId: string | null;
        }>
      >,

    collectionsCreate: (
      workspaceId: string,
      name: string,
      scope: "workspace" | "global",
    ) =>
      ipcRenderer.invoke(
        "http:collections:create",
        workspaceId,
        name,
        scope,
      ) as Promise<{
        id: string;
        name: string;
        scope: "workspace" | "global";
        workspaceId: string | null;
      }>,

    collectionsDelete: (id: string) =>
      ipcRenderer.invoke("http:collections:delete", id) as Promise<void>,

    requestsList: (workspaceId: string) =>
      ipcRenderer.invoke("http:requests:list", workspaceId) as Promise<
        Array<{
          id: string;
          collectionId: string | null;
          workspaceId: string | null;
          name: string;
          method: string;
          url: string;
          headers: { key: string; value: string; enabled: boolean }[];
          body: { type: "none" | "json" | "text"; content: string };
        }>
      >,

    requestsSave: (request: {
      id: string;
      collectionId: string | null;
      workspaceId: string | null;
      name: string;
      method: string;
      url: string;
      headers: { key: string; value: string; enabled: boolean }[];
      body: { type: "none" | "json" | "text"; content: string };
    }) =>
      ipcRenderer.invoke("http:requests:save", request) as Promise<
        typeof request
      >,

    requestsDelete: (id: string) =>
      ipcRenderer.invoke("http:requests:delete", id) as Promise<void>,

    request: (request: {
      id: string;
      collectionId: string | null;
      workspaceId: string | null;
      name: string;
      method: string;
      url: string;
      headers: { key: string; value: string; enabled: boolean }[];
      body: { type: "none" | "json" | "text"; content: string };
    }) =>
      ipcRenderer.invoke("http:request", request) as Promise<
        | {
            status: number;
            statusText: string;
            headers: Record<string, string>;
            body: string;
            timing: { start: number; end: number; duration: number };
          }
        | { error: string }
        | { cancelled: true }
      >,

    requestCancel: (requestId: string) =>
      ipcRenderer.invoke("http:request:cancel", requestId) as Promise<void>,

    importPostman: (workspaceId: string, json: string) =>
      ipcRenderer.invoke("http:import-postman", workspaceId, json) as Promise<{
        imported: number;
        skipped: number;
      }>,
  },

  whiteboard: {
    listBoards: () => ipcRenderer.invoke("whiteboard:list-boards"),
    getBoard: (boardId: string) =>
      ipcRenderer.invoke("whiteboard:get-board", boardId),
    createBoard: (name: string, workspaceId: string | null) =>
      ipcRenderer.invoke("whiteboard:create-board", name, workspaceId),
    deleteBoard: (boardId: string) =>
      ipcRenderer.invoke("whiteboard:delete-board", boardId),
    importBoard: (data: Record<string, unknown>) =>
      ipcRenderer.invoke("whiteboard:import-board", data),
    updateBoard: (boardId: string, patch: Record<string, unknown>) =>
      ipcRenderer.invoke("whiteboard:update-board", boardId, patch),
    createSticky: (boardId: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke("whiteboard:create-sticky", boardId, data),
    updateSticky: (
      boardId: string,
      stickyId: string,
      patch: Record<string, unknown>,
    ) =>
      ipcRenderer.invoke("whiteboard:update-sticky", boardId, stickyId, patch),
    deleteSticky: (boardId: string, stickyId: string) =>
      ipcRenderer.invoke("whiteboard:delete-sticky", boardId, stickyId),
    createFrame: (boardId: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke("whiteboard:create-frame", boardId, data),
    updateFrame: (
      boardId: string,
      frameId: string,
      patch: Record<string, unknown>,
    ) => ipcRenderer.invoke("whiteboard:update-frame", boardId, frameId, patch),
    deleteFrame: (boardId: string, frameId: string) =>
      ipcRenderer.invoke("whiteboard:delete-frame", boardId, frameId),
    connect: (
      boardId: string,
      fromStickyId: string,
      toStickyId: string,
      label?: string,
    ) =>
      ipcRenderer.invoke(
        "whiteboard:connect",
        boardId,
        fromStickyId,
        toStickyId,
        label,
      ),
    updateConnection: (
      boardId: string,
      connectionId: string,
      patch: Record<string, unknown>,
    ) =>
      ipcRenderer.invoke(
        "whiteboard:update-connection",
        boardId,
        connectionId,
        patch,
      ),
    disconnect: (boardId: string, connectionId: string) =>
      ipcRenderer.invoke("whiteboard:disconnect", boardId, connectionId),
    onBoardChanged: (callback: (board: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, board: unknown) =>
        callback(board);
      ipcRenderer.on("whiteboard:board-changed", listener);
      return () =>
        ipcRenderer.removeListener("whiteboard:board-changed", listener);
    },
    onBoardDeleted: (callback: (boardId: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, boardId: string) =>
        callback(boardId);
      ipcRenderer.on("whiteboard:board-deleted", listener);
      return () =>
        ipcRenderer.removeListener("whiteboard:board-deleted", listener);
    },
    startMcpServer: (port: number) =>
      ipcRenderer.invoke("whiteboard:start-mcp-server", port),
    stopMcpServer: () => ipcRenderer.invoke("whiteboard:stop-mcp-server"),
    getMcpStatus: () => ipcRenderer.invoke("whiteboard:mcp-status"),
  },

  registers: {
    load: () => ipcRenderer.invoke('registers:load') as Promise<unknown[]>,
    save: (registers: unknown[]) =>
      ipcRenderer.invoke('registers:save', registers) as Promise<void>,
  },

  browser: {
    create: (sessionId: string, url: string) =>
      ipcRenderer.invoke("browser:create", sessionId, url) as Promise<{
        id: string;
      }>,

    destroy: (sessionId: string) =>
      ipcRenderer.invoke("browser:destroy", sessionId),

    navigate: (sessionId: string, url: string) =>
      ipcRenderer.send("browser:navigate", sessionId, url),

    back: (sessionId: string) => ipcRenderer.send("browser:back", sessionId),

    forward: (sessionId: string) =>
      ipcRenderer.send("browser:forward", sessionId),

    reload: (sessionId: string) =>
      ipcRenderer.send("browser:reload", sessionId),

    setBounds: (sessionId: string, bounds: Bounds) =>
      ipcRenderer.send("browser:setBounds", sessionId, bounds),

    show: (sessionId: string) => ipcRenderer.send("browser:show", sessionId),

    hide: (sessionId: string) => ipcRenderer.send("browser:hide", sessionId),

    hideAll: () => ipcRenderer.send("browser:hideAll"),

    showSession: (sessionId: string) =>
      ipcRenderer.send("browser:showSession", sessionId),

    onTitleChanged: (sessionId: string, callback: (title: string) => void) => {
      const channel = `browser:title:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, title: string) =>
        callback(title);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onNavigated: (
      sessionId: string,
      callback: (info: NavigationInfo) => void,
    ) => {
      const channel = `browser:navigated:${sessionId}`;
      const listener = (
        _event: Electron.IpcRendererEvent,
        info: NavigationInfo,
      ) => callback(info);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onLoading: (sessionId: string, callback: (loading: boolean) => void) => {
      const channel = `browser:loading:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, loading: boolean) =>
        callback(loading);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
