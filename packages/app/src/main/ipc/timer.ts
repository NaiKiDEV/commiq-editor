import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function getTimerDir(): string {
  return path.join(app.getPath('userData'), 'timers');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function registerTimerIpc(): void {
  ipcMain.handle('timer:list', () => {
    const dir = getTimerDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    return files.reduce<unknown[]>((acc, file) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        acc.push(data);
      } catch { /* skip corrupt files */ }
      return acc;
    }, []);
  });

  ipcMain.handle('timer:save', (_event, timer: { id: string; [key: string]: unknown }) => {
    const dir = getTimerDir();
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, `${timer.id}.json`), JSON.stringify(timer, null, 2));
  });

  ipcMain.handle('timer:delete', (_event, id: string) => {
    const filePath = path.join(getTimerDir(), `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}
