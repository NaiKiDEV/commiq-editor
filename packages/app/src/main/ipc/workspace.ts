import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function getWorkspacesPath(): string {
  return path.join(app.getPath('userData'), 'workspaces.json');
}

/** Atomic write: write to temp file then rename so a crash never corrupts the existing file. */
function writeAtomic(filePath: string, data: string): void {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:load', () => {
    try {
      const data = fs.readFileSync(getWorkspacesPath(), 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  });

  ipcMain.handle('workspace:save', (_event, state: unknown) => {
    try {
      writeAtomic(getWorkspacesPath(), JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('[workspace] save failed:', err);
    }
  });

  // Synchronous save used by the renderer's beforeunload handler to guarantee
  // the file is written before the window is destroyed.
  ipcMain.on('workspace:saveSync', (event, state: unknown) => {
    try {
      writeAtomic(getWorkspacesPath(), JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('[workspace] saveSync failed:', err);
    }
    event.returnValue = null;
  });
}
