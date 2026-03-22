import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type WorkflowCommand = {
  id: string;
  name: string;
  command: string;
};

export type Workflow = {
  id: string;
  name: string;
  scope: 'workspace' | 'global';
  commands: WorkflowCommand[];
};

function getWorkflowDir(scope: 'workspace' | 'global', workspaceId: string): string {
  const base = path.join(app.getPath('userData'), 'workflows');
  return scope === 'global'
    ? path.join(base, 'global')
    : path.join(base, workspaceId);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readWorkflowsFromDir(dir: string, scope: 'workspace' | 'global'): Workflow[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.reduce<Workflow[]>((acc, file) => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      acc.push({ ...data, scope });
    } catch { /* skip corrupt files */ }
    return acc;
  }, []);
}

export function registerWorkflowIpc(): void {
  ipcMain.handle('workflow:list', (_event, workspaceId: string) => {
    const globalDir = getWorkflowDir('global', workspaceId);
    const wsDir = getWorkflowDir('workspace', workspaceId);
    return [
      ...readWorkflowsFromDir(globalDir, 'global'),
      ...readWorkflowsFromDir(wsDir, 'workspace'),
    ];
  });

  ipcMain.handle('workflow:save', (_event, workflow: Workflow, workspaceId: string) => {
    const dir = getWorkflowDir(workflow.scope, workspaceId);
    ensureDir(dir);
    const filePath = path.join(dir, `${workflow.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
  });

  ipcMain.handle('workflow:delete', (_event, id: string, scope: 'workspace' | 'global', workspaceId: string) => {
    const dir = getWorkflowDir(scope, workspaceId);
    const filePath = path.join(dir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}
