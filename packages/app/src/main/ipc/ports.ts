import { ipcMain } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type PortEntry = {
  protocol: 'TCP' | 'UDP';
  localPort: number;
  localAddress: string;
  state: string;
  pid: number;
  processName: string;
};

async function listPortsWindows(): Promise<PortEntry[]> {
  const [netstatOut, tasklistOut] = await Promise.all([
    execAsync('netstat -ano').then((r) => r.stdout),
    execAsync('tasklist /FO CSV /NH').then((r) => r.stdout),
  ]);

  const pidToName = new Map<number, string>();
  for (const line of tasklistOut.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(',');
    if (parts.length < 2) continue;
    const name = parts[0].replace(/^"|"$/g, '');
    const pid = parseInt(parts[1].replace(/^"|"$/g, ''), 10);
    if (!isNaN(pid)) pidToName.set(pid, name);
  }

  const entries: PortEntry[] = [];
  for (const line of netstatOut.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const proto = parts[0]?.toUpperCase();
    if (proto !== 'TCP' && proto !== 'UDP') continue;

    const localAddr = parts[1] ?? '';
    const lastColon = localAddr.lastIndexOf(':');
    if (lastColon === -1) continue;
    const localPort = parseInt(localAddr.slice(lastColon + 1), 10);
    const localAddress = localAddr.slice(0, lastColon).replace(/^\[|\]$/g, '');
    if (isNaN(localPort)) continue;

    let state = '';
    let pid = 0;
    if (proto === 'TCP') {
      state = parts[3] ?? '';
      pid = parseInt(parts[4] ?? '', 10);
    } else {
      // UDP: no state column — PID is at index 3
      pid = parseInt(parts[3] ?? '', 10);
    }
    if (isNaN(pid) || pid === 0) continue;

    entries.push({
      protocol: proto,
      localPort,
      localAddress,
      state,
      pid,
      processName: pidToName.get(pid) ?? String(pid),
    });
  }

  return entries.sort((a, b) => a.localPort - b.localPort);
}

async function listPortsUnix(): Promise<PortEntry[]> {
  try {
    const { stdout } = await execAsync('lsof -i -P -n');
    const entries: PortEntry[] = [];

    for (const line of stdout.split('\n').slice(1)) {
      // lsof columns: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) continue;

      const processName = parts[0];
      const pid = parseInt(parts[1], 10);
      if (isNaN(pid)) continue;

      const node = parts[7].toUpperCase();
      if (node !== 'TCP' && node !== 'UDP') continue;
      const protocol = node as 'TCP' | 'UDP';

      // NAME: "*:3000", "127.0.0.1:8080->10.0.0.1:443 (ESTABLISHED)"
      const namePart = parts[8];
      const stateMatch = line.match(/\(([A-Z_]+)\)\s*$/);
      const state = stateMatch ? stateMatch[1] : '';

      const addrPart = namePart.split('->')[0];
      const lastColon = addrPart.lastIndexOf(':');
      if (lastColon === -1) continue;
      const localPort = parseInt(addrPart.slice(lastColon + 1), 10);
      const localAddress = addrPart.slice(0, lastColon);
      if (isNaN(localPort)) continue;

      entries.push({ protocol, localPort, localAddress, state, pid, processName });
    }

    return entries.sort((a, b) => a.localPort - b.localPort);
  } catch {
    return [];
  }
}

async function killProcess(pid: number): Promise<{ success: boolean; error?: string }> {
  try {
    const cmd = process.platform === 'win32'
      ? `taskkill /PID ${pid} /F`
      : `kill -9 ${pid}`;
    await execAsync(cmd);
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export function registerPortsIpc(): void {
  ipcMain.handle('ports:list', async () => {
    try {
      return process.platform === 'win32'
        ? await listPortsWindows()
        : await listPortsUnix();
    } catch (e: unknown) {
      throw new Error((e as Error).message);
    }
  });

  ipcMain.handle('ports:kill', async (_e, pid: number) => {
    return killProcess(pid);
  });
}
