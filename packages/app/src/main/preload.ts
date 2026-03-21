import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
