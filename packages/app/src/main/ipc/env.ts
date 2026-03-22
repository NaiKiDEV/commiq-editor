import { ipcMain } from 'electron';

export function registerEnvIpc(): void {
  ipcMain.handle('env:list', () => {
    return Object.entries(process.env)
      .map(([name, value]) => ({ name, value: value ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}
