import { contextBridge, ipcRenderer } from 'electron';

type Bounds = { x: number; y: number; width: number; height: number };
type NavigationInfo = { url: string; canGoBack: boolean; canGoForward: boolean };

const electronAPI = {
  onShortcut: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('app:shortcut', listener);
    return () => { ipcRenderer.removeListener('app:shortcut', listener); };
  },

  terminal: {
    spawn: (sessionId: string, cwd?: string) =>
      ipcRenderer.invoke('terminal:spawn', sessionId, cwd) as Promise<{ pid: number }>,

    write: (sessionId: string, data: string) =>
      ipcRenderer.send('terminal:write', sessionId, data),

    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send('terminal:resize', sessionId, cols, rows),

    kill: (sessionId: string) =>
      ipcRenderer.invoke('terminal:kill', sessionId),

    onData: (sessionId: string, callback: (data: string) => void) => {
      const channel = `terminal:data:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onExit: (sessionId: string, callback: (exitCode: number) => void) => {
      const channel = `terminal:exit:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, exitCode: number) => callback(exitCode);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },

  notes: {
    list: () =>
      ipcRenderer.invoke('notes:list') as Promise<Array<{ id: string; title: string; content: string; createdAt: string; updatedAt: string }>>,

    create: (title: string) =>
      ipcRenderer.invoke('notes:create', title) as Promise<{ id: string; title: string; content: string; createdAt: string; updatedAt: string }>,

    update: (id: string, data: { title?: string; content?: string }) =>
      ipcRenderer.invoke('notes:update', id, data) as Promise<{ id: string; title: string; content: string; createdAt: string; updatedAt: string } | null>,

    delete: (id: string) =>
      ipcRenderer.invoke('notes:delete', id) as Promise<void>,
  },

  browser: {
    create: (sessionId: string, url: string) =>
      ipcRenderer.invoke('browser:create', sessionId, url) as Promise<{ id: string }>,

    destroy: (sessionId: string) =>
      ipcRenderer.invoke('browser:destroy', sessionId),

    navigate: (sessionId: string, url: string) =>
      ipcRenderer.send('browser:navigate', sessionId, url),

    back: (sessionId: string) =>
      ipcRenderer.send('browser:back', sessionId),

    forward: (sessionId: string) =>
      ipcRenderer.send('browser:forward', sessionId),

    reload: (sessionId: string) =>
      ipcRenderer.send('browser:reload', sessionId),

    setBounds: (sessionId: string, bounds: Bounds) =>
      ipcRenderer.send('browser:setBounds', sessionId, bounds),

    show: (sessionId: string) =>
      ipcRenderer.send('browser:show', sessionId),

    hide: (sessionId: string) =>
      ipcRenderer.send('browser:hide', sessionId),

    hideAll: () =>
      ipcRenderer.send('browser:hideAll'),

    showSession: (sessionId: string) =>
      ipcRenderer.send('browser:showSession', sessionId),

    onTitleChanged: (sessionId: string, callback: (title: string) => void) => {
      const channel = `browser:title:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, title: string) => callback(title);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onNavigated: (sessionId: string, callback: (info: NavigationInfo) => void) => {
      const channel = `browser:navigated:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, info: NavigationInfo) => callback(info);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },

    onLoading: (sessionId: string, callback: (loading: boolean) => void) => {
      const channel = `browser:loading:${sessionId}`;
      const listener = (_event: Electron.IpcRendererEvent, loading: boolean) => callback(loading);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
