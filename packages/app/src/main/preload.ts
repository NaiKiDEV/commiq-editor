import { contextBridge, ipcRenderer } from "electron";

type Bounds = { x: number; y: number; width: number; height: number };
type NavigationInfo = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

const electronAPI = {
  platform: process.platform,

  openExternal: (url: string) =>
    ipcRenderer.invoke("app:openExternal", url) as Promise<void>,

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
          tags: string[];
          createdAt: string;
          updatedAt: string;
        }>
      >,

    create: (title: string) =>
      ipcRenderer.invoke("notes:create", title) as Promise<{
        id: string;
        title: string;
        content: string;
        tags: string[];
        createdAt: string;
        updatedAt: string;
      }>,

    update: (
      id: string,
      data: { title?: string; content?: string; tags?: string[] },
    ) =>
      ipcRenderer.invoke("notes:update", id, data) as Promise<{
        id: string;
        title: string;
        content: string;
        tags: string[];
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
          mode: "parallel" | "sequential";
          commands: Array<{
            id: string;
            name: string;
            command: string;
            type: "terminal" | "browser";
            signal?: string;
          }>;
        }>
      >,

    save: (
      workflow: {
        id: string;
        name: string;
        scope: "workspace" | "global";
        mode: "parallel" | "sequential";
        commands: Array<{
          id: string;
          name: string;
          command: string;
          type: "terminal" | "browser";
          signal?: string;
        }>;
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
    createText: (boardId: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke("whiteboard:create-text", boardId, data),
    updateText: (
      boardId: string,
      textId: string,
      patch: Record<string, unknown>,
    ) => ipcRenderer.invoke("whiteboard:update-text", boardId, textId, patch),
    deleteText: (boardId: string, textId: string) =>
      ipcRenderer.invoke("whiteboard:delete-text", boardId, textId),
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
    undo: (boardId: string) => ipcRenderer.invoke("whiteboard:undo", boardId),
    redo: (boardId: string) => ipcRenderer.invoke("whiteboard:redo", boardId),
    canUndo: (boardId: string) =>
      ipcRenderer.invoke("whiteboard:can-undo", boardId) as Promise<boolean>,
    canRedo: (boardId: string) =>
      ipcRenderer.invoke("whiteboard:can-redo", boardId) as Promise<boolean>,
  },

  registers: {
    load: () => ipcRenderer.invoke("registers:load") as Promise<unknown[]>,
    save: (registers: unknown[]) =>
      ipcRenderer.invoke("registers:save", registers) as Promise<void>,
  },

  ws: {
    profilesList: () =>
      ipcRenderer.invoke("ws:profiles:list") as Promise<
        Array<{
          id: string;
          name: string;
          url: string;
          headers: { key: string; value: string; enabled: boolean }[];
          subprotocol: string;
          autoReconnect: boolean;
          reconnectDelay: number;
        }>
      >,

    profilesSave: (profile: {
      id: string;
      name: string;
      url: string;
      headers: { key: string; value: string; enabled: boolean }[];
      subprotocol: string;
      autoReconnect: boolean;
      reconnectDelay: number;
    }) =>
      ipcRenderer.invoke("ws:profiles:save", profile) as Promise<
        typeof profile
      >,

    profilesDelete: (id: string) =>
      ipcRenderer.invoke("ws:profiles:delete", id) as Promise<void>,

    templatesList: () =>
      ipcRenderer.invoke("ws:templates:list") as Promise<
        Array<{ id: string; name: string; payload: string }>
      >,

    templatesSave: (tpl: { id: string; name: string; payload: string }) =>
      ipcRenderer.invoke("ws:templates:save", tpl) as Promise<typeof tpl>,

    templatesDelete: (id: string) =>
      ipcRenderer.invoke("ws:templates:delete", id) as Promise<void>,

    connect: (
      connId: string,
      profile: {
        id: string;
        name: string;
        url: string;
        headers: { key: string; value: string; enabled: boolean }[];
        subprotocol: string;
        autoReconnect: boolean;
        reconnectDelay: number;
      },
    ) => ipcRenderer.invoke("ws:connect", connId, profile) as Promise<void>,

    disconnect: (connId: string) =>
      ipcRenderer.invoke("ws:disconnect", connId) as Promise<void>,

    send: (connId: string, payload: string) =>
      ipcRenderer.invoke("ws:send", connId, payload) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    ping: (connId: string) =>
      ipcRenderer.invoke("ws:ping", connId) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    onStatus: (
      connId: string,
      callback: (event: {
        status: string;
        at?: number;
        code?: number;
        reason?: string;
        error?: string;
      }) => void,
    ) => {
      const channel = `ws:${connId}:status`;
      const listener = (
        _e: Electron.IpcRendererEvent,
        event: {
          status: string;
          at?: number;
          code?: number;
          reason?: string;
          error?: string;
        },
      ) => callback(event);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onMessage: (
      connId: string,
      callback: (msg: {
        id: string;
        direction: "sent" | "received";
        payload: string;
        binary: boolean;
        byteLen: number;
        timestamp: number;
      }) => void,
    ) => {
      const channel = `ws:${connId}:message`;
      const listener = (
        _e: Electron.IpcRendererEvent,
        msg: {
          id: string;
          direction: "sent" | "received";
          payload: string;
          binary: boolean;
          byteLen: number;
          timestamp: number;
        },
      ) => callback(msg);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onFrame: (
      connId: string,
      callback: (frame: {
        type: "ping" | "pong";
        latency?: number | null;
        timestamp: number;
      }) => void,
    ) => {
      const channel = `ws:${connId}:frame`;
      const listener = (
        _e: Electron.IpcRendererEvent,
        frame: {
          type: "ping" | "pong";
          latency?: number | null;
          timestamp: number;
        },
      ) => callback(frame);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },

  db: {
    profilesList: () =>
      ipcRenderer.invoke("db:profiles:list") as Promise<
        Array<{
          id: string;
          name: string;
          driver: "sqlite" | "postgresql" | "mysql";
          host: string;
          port: number;
          database: string;
          username: string;
          password: string;
        }>
      >,

    profilesSave: (profile: {
      id: string;
      name: string;
      driver: "sqlite" | "postgresql" | "mysql";
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    }) =>
      ipcRenderer.invoke("db:profiles:save", profile) as Promise<
        typeof profile
      >,

    profilesDelete: (id: string) =>
      ipcRenderer.invoke("db:profiles:delete", id) as Promise<void>,

    connect: (profile: {
      id: string;
      name: string;
      driver: "sqlite" | "postgresql" | "mysql";
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    }) =>
      ipcRenderer.invoke("db:connect", profile) as Promise<
        { success: true } | { error: string }
      >,

    disconnect: (profileId: string) =>
      ipcRenderer.invoke("db:disconnect", profileId) as Promise<void>,

    test: (profile: {
      id: string;
      name: string;
      driver: "sqlite" | "postgresql" | "mysql";
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    }) =>
      ipcRenderer.invoke("db:test", profile) as Promise<
        { success: true; duration: number } | { error: string }
      >,

    query: (profileId: string, sql: string) =>
      ipcRenderer.invoke("db:query", profileId, sql) as Promise<
        | {
            columns: string[];
            rows: Record<string, unknown>[];
            rowCount: number;
            affectedRows: number;
            duration: number;
          }
        | { error: string }
      >,

    schema: (profileId: string) =>
      ipcRenderer.invoke("db:schema", profileId) as Promise<
        | Array<{
            name: string;
            schema: string;
            columns: Array<{
              name: string;
              type: string;
              nullable: boolean;
              primaryKey: boolean;
              defaultValue: string | null;
            }>;
            indexes: Array<{
              name: string;
              unique: boolean;
              columns: string[];
            }>;
            foreignKeys: Array<{
              columns: string[];
              referencedSchema: string;
              referencedTable: string;
              referencedColumns: string[];
            }>;
          }>
        | { error: string }
      >,

    historyList: (connectionId?: string) =>
      ipcRenderer.invoke("db:history:list", connectionId) as Promise<
        Array<{
          id: string;
          connectionId: string;
          query: string;
          timestamp: number;
        }>
      >,

    historyClear: () => ipcRenderer.invoke("db:history:clear") as Promise<void>,
  },

  docker: {
    check: () =>
      ipcRenderer.invoke("docker:check") as Promise<{
        available: boolean;
        reason?: string;
      }>,

    listContainers: () =>
      ipcRenderer.invoke("docker:containers:list") as Promise<
        unknown[] | { error: string }
      >,

    startContainer: (id: string) =>
      ipcRenderer.invoke("docker:container:start", id) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    stopContainer: (id: string) =>
      ipcRenderer.invoke("docker:container:stop", id) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    restartContainer: (id: string) =>
      ipcRenderer.invoke("docker:container:restart", id) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    removeContainer: (id: string, force: boolean) =>
      ipcRenderer.invoke("docker:container:remove", id, force) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    logsStart: (containerId: string, streamId: string) =>
      ipcRenderer.invoke(
        "docker:logs:start",
        containerId,
        streamId,
      ) as Promise<{ success?: boolean; error?: string }>,

    logsStop: (streamId: string) =>
      ipcRenderer.invoke("docker:logs:stop", streamId) as Promise<void>,

    onLogChunk: (
      streamId: string,
      callback: (chunk: { text: string }) => void,
    ) => {
      const channel = `docker:logs:${streamId}`;
      const listener = (
        _e: Electron.IpcRendererEvent,
        chunk: { text: string },
      ) => callback(chunk);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    listImages: () =>
      ipcRenderer.invoke("docker:images:list") as Promise<
        unknown[] | { error: string }
      >,

    removeImage: (id: string) =>
      ipcRenderer.invoke("docker:image:remove", id) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    pruneImages: () =>
      ipcRenderer.invoke("docker:image:prune") as Promise<{
        success?: boolean;
        output?: string;
        error?: string;
      }>,

    listCompose: () =>
      ipcRenderer.invoke("docker:compose:list") as Promise<
        unknown[] | { error: string }
      >,

    composeUp: (projectName: string, configFile: string) =>
      ipcRenderer.invoke(
        "docker:compose:up",
        projectName,
        configFile,
      ) as Promise<{ success?: boolean; error?: string }>,

    composeDown: (projectName: string, configFile: string) =>
      ipcRenderer.invoke(
        "docker:compose:down",
        projectName,
        configFile,
      ) as Promise<{ success?: boolean; error?: string }>,

    composeRestart: (projectName: string, configFile: string) =>
      ipcRenderer.invoke(
        "docker:compose:restart",
        projectName,
        configFile,
      ) as Promise<{ success?: boolean; error?: string }>,

    listVolumes: () =>
      ipcRenderer.invoke("docker:volumes:list") as Promise<
        unknown[] | { error: string }
      >,

    removeVolume: (name: string) =>
      ipcRenderer.invoke("docker:volume:remove", name) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    pruneVolumes: () =>
      ipcRenderer.invoke("docker:volume:prune") as Promise<{
        success?: boolean;
        output?: string;
        error?: string;
      }>,

    listNetworks: () =>
      ipcRenderer.invoke("docker:networks:list") as Promise<
        unknown[] | { error: string }
      >,

    removeNetwork: (id: string) =>
      ipcRenderer.invoke("docker:network:remove", id) as Promise<{
        success?: boolean;
        error?: string;
      }>,

    inspectContainer: (id: string) =>
      ipcRenderer.invoke("docker:container:inspect", id) as Promise<
        unknown | { error: string }
      >,

    inspectVolume: (name: string) =>
      ipcRenderer.invoke("docker:volume:inspect", name) as Promise<
        unknown | { error: string }
      >,

    imageHistory: (id: string) =>
      ipcRenderer.invoke("docker:image:history", id) as Promise<
        unknown[] | { error: string }
      >,

    execStart: (containerId: string, execId: string, shell: string) =>
      ipcRenderer.invoke(
        "docker:exec:start",
        containerId,
        execId,
        shell,
      ) as Promise<{ success?: boolean; error?: string }>,

    execStop: (execId: string) =>
      ipcRenderer.invoke("docker:exec:stop", execId) as Promise<void>,

    execWrite: (execId: string, data: string) =>
      ipcRenderer.send("docker:exec:write", execId, data),

    execResize: (execId: string, cols: number, rows: number) =>
      ipcRenderer.send("docker:exec:resize", execId, cols, rows),

    onExecData: (execId: string, callback: (data: string) => void) => {
      const channel = `docker:exec:data:${execId}`;
      const listener = (_e: Electron.IpcRendererEvent, data: string) =>
        callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onExecExit: (execId: string, callback: (code: number) => void) => {
      const channel = `docker:exec:exit:${execId}`;
      const listener = (_e: Electron.IpcRendererEvent, code: number) =>
        callback(code);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    filesList: (containerId: string, path: string) =>
      ipcRenderer.invoke("docker:files:list", containerId, path) as Promise<{
        output?: string;
        error?: string;
      }>,

    filesRead: (containerId: string, path: string) =>
      ipcRenderer.invoke("docker:files:read", containerId, path) as Promise<{
        content?: string;
        error?: string;
      }>,
  },

  ssl: {
    inspect: (host: string, port: number) =>
      ipcRenderer.invoke("ssl:inspect", host, port) as Promise<
        | Array<{
            subject: Record<string, string>;
            issuer: Record<string, string>;
            sans: string[];
            notBefore: string;
            notAfter: string;
            serialNumber: string;
            fingerprint: string;
            signatureAlgorithm: string;
            publicKeyAlgorithm: string;
            keyBits: number;
            isCA: boolean;
            pem: string;
          }>
        | { error: string }
      >,

    decodePem: (pem: string) =>
      ipcRenderer.invoke("ssl:decode-pem", pem) as Promise<
        | Array<{
            subject: Record<string, string>;
            issuer: Record<string, string>;
            sans: string[];
            notBefore: string;
            notAfter: string;
            serialNumber: string;
            fingerprint: string;
            signatureAlgorithm: string;
            publicKeyAlgorithm: string;
            keyBits: number;
            isCA: boolean;
            pem: string;
          }>
        | { error: string }
      >,

    generateSelfSigned: (opts: {
      commonName: string;
      sans: string[];
      days: number;
      keyAlgorithm: "rsa" | "ec";
    }) =>
      ipcRenderer.invoke("ssl:generate-self-signed", opts) as Promise<
        { cert: string; key: string } | { error: string }
      >,
  },

  k8s: {
    reloadConfig: () =>
      ipcRenderer.invoke("k8s:config:reload") as Promise<void>,

    contexts: () =>
      ipcRenderer.invoke("k8s:contexts") as Promise<
        | {
            contexts: Array<{
              name: string;
              cluster: string;
              namespace: string | null;
            }>;
            currentContext: string;
          }
        | { error: string }
      >,

    namespaces: (context: string) =>
      ipcRenderer.invoke("k8s:namespaces", context) as Promise<string[]>,

    list: (context: string, kind: string, namespace?: string) =>
      ipcRenderer.invoke("k8s:list", context, kind, namespace) as Promise<
        unknown[] | { error: string }
      >,

    watchStart: (
      context: string,
      kind: string,
      watchId: string,
      namespace?: string,
    ) =>
      ipcRenderer.invoke(
        "k8s:watch:start",
        context,
        kind,
        watchId,
        namespace,
      ) as Promise<void>,

    watchStop: (watchId: string) =>
      ipcRenderer.invoke("k8s:watch:stop", watchId) as Promise<void>,

    onWatchEvent: (
      watchId: string,
      callback: (event: { type: string; resource: unknown }) => void,
    ) => {
      const channel = `k8s:watch:${watchId}`;
      const listener = (
        _e: Electron.IpcRendererEvent,
        evt: { type: string; resource: unknown },
      ) => callback(evt);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    logsStart: (
      context: string,
      namespace: string,
      pod: string,
      container: string,
      streamId: string,
    ) =>
      ipcRenderer.invoke(
        "k8s:logs:start",
        context,
        namespace,
        pod,
        container,
        streamId,
      ) as Promise<void>,

    logsStop: (streamId: string) =>
      ipcRenderer.invoke("k8s:logs:stop", streamId) as Promise<void>,

    onLogChunk: (
      streamId: string,
      callback: (chunk: { text: string }) => void,
    ) => {
      const channel = `k8s:logs:${streamId}`;
      const listener = (
        _e: Electron.IpcRendererEvent,
        chunk: { text: string },
      ) => callback(chunk);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    deletePod: (context: string, namespace: string, name: string) =>
      ipcRenderer.invoke(
        "k8s:pod:delete",
        context,
        namespace,
        name,
      ) as Promise<{ success?: boolean; error?: string }>,

    getPodContainers: (context: string, namespace: string, name: string) =>
      ipcRenderer.invoke(
        "k8s:pod:containers",
        context,
        namespace,
        name,
      ) as Promise<string[]>,

    execStart: (
      context: string,
      namespace: string,
      pod: string,
      container: string,
      execId: string,
      command?: string[],
    ) =>
      ipcRenderer.invoke(
        "k8s:exec:start",
        context,
        namespace,
        pod,
        container,
        execId,
        command,
      ) as Promise<{ success?: boolean; error?: string }>,

    execStop: (execId: string) =>
      ipcRenderer.invoke("k8s:exec:stop", execId) as Promise<void>,

    execWrite: (execId: string, data: string) =>
      ipcRenderer.send(`k8s:exec:write:${execId}`, data),

    execResize: (execId: string, cols: number, rows: number) =>
      ipcRenderer.send(`k8s:exec:resize:${execId}`, cols, rows),

    onExecData: (execId: string, callback: (data: string) => void) => {
      const channel = `k8s:exec:data:${execId}`;
      const listener = (_e: Electron.IpcRendererEvent, data: string) =>
        callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onExecExit: (execId: string, callback: (code: number) => void) => {
      const channel = `k8s:exec:exit:${execId}`;
      const listener = (_e: Electron.IpcRendererEvent, code: number) =>
        callback(code);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
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

  mockServer: {
    configsList: () =>
      ipcRenderer.invoke("mock-server:configs:list") as Promise<
        Array<{
          id: string;
          name: string;
          port: number;
          corsOrigin: string;
          proxyBaseUrl: string;
          routes: Array<{
            id: string;
            method: string;
            path: string;
            name: string;
            enabled: boolean;
            status: number;
            headers: { key: string; value: string; enabled: boolean }[];
            body: string;
            delay: number;
            rules: Array<{
              condition: {
                bodyContains?: string;
                headerMatch?: { key: string; value: string };
                queryMatch?: { key: string; value: string };
              };
              status: number;
              headers: { key: string; value: string; enabled: boolean }[];
              body: string;
              delay: number;
            }>;
          }>;
          wsEndpoints: Array<{
            id: string;
            path: string;
            name: string;
            enabled: boolean;
          }>;
        }>
      >,

    configsSave: (config: {
      id: string;
      name: string;
      port: number;
      corsOrigin: string;
      proxyBaseUrl: string;
      routes: Array<{
        id: string;
        method: string;
        path: string;
        name: string;
        enabled: boolean;
        status: number;
        headers: { key: string; value: string; enabled: boolean }[];
        body: string;
        delay: number;
        rules: Array<{
          condition: {
            bodyContains?: string;
            headerMatch?: { key: string; value: string };
            queryMatch?: { key: string; value: string };
          };
          status: number;
          headers: { key: string; value: string; enabled: boolean }[];
          body: string;
          delay: number;
        }>;
      }>;
      wsEndpoints: Array<{
        id: string;
        path: string;
        name: string;
        enabled: boolean;
      }>;
    }) =>
      ipcRenderer.invoke("mock-server:configs:save", config) as Promise<
        typeof config
      >,

    configsDelete: (configId: string) =>
      ipcRenderer.invoke(
        "mock-server:configs:delete",
        configId,
      ) as Promise<void>,

    start: (configId: string) =>
      ipcRenderer.invoke("mock-server:start", configId) as Promise<{
        configId: string;
        status: string;
        error?: string;
        requestCount: number;
        recentRequests: Array<{
          id: string;
          timestamp: number;
          method: string;
          path: string;
          query: Record<string, string>;
          headers: Record<string, string>;
          body: string;
          matchedRouteId: string | null;
          matchedRuleIndex: number | null;
          responseStatus: number;
          responseBody: string;
          duration: number;
        }>;
        wsClients: Array<{
          id: string;
          endpointId: string;
          connectedAt: number;
          remoteAddress: string;
        }>;
        wsMessages: Array<{
          id: string;
          endpointId: string;
          clientId: string;
          direction: "received" | "sent" | "broadcast";
          payload: string;
          timestamp: number;
        }>;
      }>,

    stop: (configId: string) =>
      ipcRenderer.invoke("mock-server:stop", configId) as Promise<{
        configId: string;
        status: string;
        requestCount: number;
        recentRequests: unknown[];
        wsClients: unknown[];
        wsMessages: unknown[];
      }>,

    getState: (configId: string) =>
      ipcRenderer.invoke("mock-server:state", configId) as Promise<{
        configId: string;
        status: string;
        error?: string;
        requestCount: number;
        recentRequests: Array<{
          id: string;
          timestamp: number;
          method: string;
          path: string;
          query: Record<string, string>;
          headers: Record<string, string>;
          body: string;
          matchedRouteId: string | null;
          matchedRuleIndex: number | null;
          responseStatus: number;
          responseBody: string;
          duration: number;
        }>;
        wsClients: Array<{
          id: string;
          endpointId: string;
          connectedAt: number;
          remoteAddress: string;
        }>;
        wsMessages: Array<{
          id: string;
          endpointId: string;
          clientId: string;
          direction: "received" | "sent" | "broadcast";
          payload: string;
          timestamp: number;
        }>;
      }>,

    clearLog: (configId: string) =>
      ipcRenderer.invoke("mock-server:clear-log", configId) as Promise<void>,

    onStateChanged: (
      callback: (state: {
        configId: string;
        status: string;
        error?: string;
        requestCount: number;
        recentRequests: Array<{
          id: string;
          timestamp: number;
          method: string;
          path: string;
          query: Record<string, string>;
          headers: Record<string, string>;
          body: string;
          matchedRouteId: string | null;
          matchedRuleIndex: number | null;
          responseStatus: number;
          responseBody: string;
          duration: number;
        }>;
        wsClients: Array<{
          id: string;
          endpointId: string;
          connectedAt: number;
          remoteAddress: string;
        }>;
        wsMessages: Array<{
          id: string;
          endpointId: string;
          clientId: string;
          direction: "received" | "sent" | "broadcast";
          payload: string;
          timestamp: number;
        }>;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: Parameters<typeof callback>[0],
      ) => callback(state);
      ipcRenderer.on("mock-server:state-changed", listener);
      return () =>
        ipcRenderer.removeListener("mock-server:state-changed", listener);
    },

    wsSend: (configId: string, clientId: string, payload: string) =>
      ipcRenderer.invoke(
        "mock-server:ws:send",
        configId,
        clientId,
        payload,
      ) as Promise<{ success?: boolean; error?: string }>,

    wsBroadcast: (configId: string, endpointId: string, payload: string) =>
      ipcRenderer.invoke(
        "mock-server:ws:broadcast",
        configId,
        endpointId,
        payload,
      ) as Promise<{ sent?: number; error?: string }>,

    wsDisconnectClient: (configId: string, clientId: string) =>
      ipcRenderer.invoke(
        "mock-server:ws:disconnect-client",
        configId,
        clientId,
      ) as Promise<void>,

    clearWsLog: (configId: string) =>
      ipcRenderer.invoke("mock-server:clear-ws-log", configId) as Promise<void>,

    exportConfig: (configId: string) =>
      ipcRenderer.invoke("mock-server:export", configId) as Promise<{
        success?: boolean;
        canceled?: boolean;
        path?: string;
        error?: string;
      }>,

    importConfig: () =>
      ipcRenderer.invoke("mock-server:import") as Promise<{
        success?: boolean;
        canceled?: boolean;
        config?: unknown;
        error?: string;
      }>,

    startMcpServer: (port: number) =>
      ipcRenderer.invoke("mock-server:start-mcp", port) as Promise<{
        success: boolean;
        error?: string;
      }>,

    stopMcpServer: () =>
      ipcRenderer.invoke("mock-server:stop-mcp") as Promise<{
        success: boolean;
      }>,

    getMcpStatus: () =>
      ipcRenderer.invoke("mock-server:mcp-status") as Promise<{
        running: boolean;
        port: number | null;
      }>,
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
