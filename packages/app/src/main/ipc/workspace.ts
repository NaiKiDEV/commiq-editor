import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function getWorkspacesPath(): string {
  return path.join(app.getPath('userData'), 'workspaces.json');
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
    fs.writeFileSync(getWorkspacesPath(), JSON.stringify(state, null, 2));
  });
}
