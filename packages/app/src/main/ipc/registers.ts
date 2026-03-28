import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function getRegistersPath(): string {
  return path.join(app.getPath('userData'), 'registers.json');
}

function writeAtomic(filePath: string, data: string): void {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function registerRegistersIpc(): void {
  ipcMain.handle('registers:load', () => {
    try {
      const data = fs.readFileSync(getRegistersPath(), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  });

  ipcMain.handle('registers:save', (_event, registers: unknown) => {
    try {
      writeAtomic(getRegistersPath(), JSON.stringify(registers, null, 2));
    } catch (err) {
      console.error('[registers] save failed:', err);
    }
  });
}
