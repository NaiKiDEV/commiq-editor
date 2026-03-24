import { ipcMain, type WebContents } from 'electron';
import * as pty from 'node-pty';
import os from 'node:os';
import fs from 'node:fs';

const sessions = new Map<string, pty.IPty>();

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function getAvailableShells(): string[] {
  if (process.platform === 'win32') {
    const candidates = [
      { name: 'PowerShell 7', path: 'pwsh.exe' },
      { name: 'PowerShell 5', path: 'powershell.exe' },
      { name: 'Command Prompt', path: 'cmd.exe' },
    ];
    // Check for Git Bash
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    for (const p of gitBashPaths) {
      if (fs.existsSync(p)) candidates.push({ name: 'Git Bash', path: p });
    }
    // Check for WSL
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    if (fs.existsSync(wslPath)) candidates.push({ name: 'WSL', path: wslPath });
    return candidates.map((c) => c.path);
  }

  // macOS / Linux: read /etc/shells
  try {
    const lines = fs.readFileSync('/etc/shells', 'utf-8').split('\n');
    return lines
      .map((l) => l.trim())
      .filter((l) => l.startsWith('/') && fs.existsSync(l));
  } catch {
    return [getDefaultShell()];
  }
}

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:getShells', () => getAvailableShells());

  ipcMain.handle('terminal:spawn', (event, sessionId: string, cwd?: string, shell?: string) => {
    const resolvedShell = shell || getDefaultShell();
    const ptyProcess = pty.spawn(resolvedShell, [], {
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
