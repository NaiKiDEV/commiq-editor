import { ipcMain } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import si from 'systeminformation';

const execAsync = promisify(exec);

export function registerProcessesIpc(): void {
  ipcMain.handle('process:list', async () => {
    const data = await si.processes();
    return data.list.map((p) => ({
      pid: p.pid,
      name: p.name,
      status: p.state ?? '',
      user: p.user ?? '',
      cpuPercent: Math.round(p.cpu * 10) / 10,
      memoryMB: Math.round((p.memRss / 1024) * 10) / 10,
      virtualMB: Math.round((p.memVsz / 1024) * 10) / 10,
      started: p.started ?? '',
      command: [p.command, p.params].filter(Boolean).join(' '),
    }));
  });

  ipcMain.handle('process:kill', async (_e, pid: number) => {
    try {
      const cmd = process.platform === 'win32'
        ? `taskkill /PID ${pid} /F`
        : `kill -9 ${pid}`;
      await execAsync(cmd);
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  });
}
