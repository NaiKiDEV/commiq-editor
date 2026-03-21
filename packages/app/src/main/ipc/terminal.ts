import { ipcMain, type WebContents } from 'electron';
import * as pty from 'node-pty';
import os from 'node:os';

const sessions = new Map<string, pty.IPty>();

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:spawn', (event, sessionId: string, cwd?: string) => {
    const shell = getDefaultShell();
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: process.env as Record<string, string>,
    });

    sessions.set(sessionId, ptyProcess);

    const sender = event.sender;

    ptyProcess.onData((data) => {
      if (!sender.isDestroyed()) {
        sender.send(`terminal:data:${sessionId}`, data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      sessions.delete(sessionId);
      if (!sender.isDestroyed()) {
        sender.send(`terminal:exit:${sessionId}`, exitCode);
      }
    });

    return { pid: ptyProcess.pid };
  });

  ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => {
    sessions.get(sessionId)?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    sessions.get(sessionId)?.resize(cols, rows);
  });

  ipcMain.handle('terminal:kill', (_event, sessionId: string) => {
    const proc = sessions.get(sessionId);
    if (proc) {
      proc.kill();
      sessions.delete(sessionId);
    }
  });
}

export function killAllSessions(): void {
  for (const [id, proc] of sessions) {
    proc.kill();
    sessions.delete(id);
  }
}
