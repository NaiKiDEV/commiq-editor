import { ipcMain, type WebContents } from 'electron';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as pty from 'node-pty';

const execAsync = promisify(exec);

// ── Session tracking ──────────────────────────────────────────────────────────

const logStreams = new Map<string, { kill: () => void }>();
const execSessions = new Map<string, pty.IPty>();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse docker output where each line is a JSON object */
function parseJsonLines<T>(stdout: string): T[] {
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

async function dockerExec(cmd: string): Promise<string> {
  const { stdout } = await execAsync(cmd);
  return stdout;
}

// ── IPC Registration ──────────────────────────────────────────────────────────

export function registerDockerIpc(): void {
  // ── Check ──────────────────────────────────────────────────────────────────

  ipcMain.handle('docker:check', async () => {
    try {
      await execAsync('docker info');
      return { available: true };
    } catch (err) {
      const msg = String(err);
      if (msg.includes('Cannot connect') || msg.includes('error during connect') || msg.includes('Is the docker daemon running')) {
        return { available: false, reason: 'daemon' };
      }
      if (msg.includes('not found') || msg.includes('is not recognized')) {
        return { available: false, reason: 'notInstalled' };
      }
      return { available: false, reason: msg };
    }
  });

  // ── Containers ─────────────────────────────────────────────────────────────

  ipcMain.handle('docker:containers:list', async () => {
    try {
      const stdout = await dockerExec('docker ps -a --format "{{json .}}"');
      return parseJsonLines(stdout);
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:container:start', async (_event, id: string) => {
    try {
      await execAsync(`docker start ${id}`);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:container:stop', async (_event, id: string) => {
    try {
      await execAsync(`docker stop ${id}`);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:container:restart', async (_event, id: string) => {
    try {
      await execAsync(`docker restart ${id}`);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:container:remove', async (_event, id: string, force: boolean) => {
    try {
      await execAsync(`docker rm ${force ? '-f' : ''} ${id}`);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── Container logs ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'docker:logs:start',
    (event: Electron.IpcMainInvokeEvent, containerId: string, streamId: string) => {
      const proc = spawn('docker', ['logs', '--follow', '--tail', '500', containerId]);

      const send = (data: string) => {
        if (!(event.sender as WebContents).isDestroyed()) {
          (event.sender as WebContents).send(`docker:logs:${streamId}`, { text: data });
        }
      };

      proc.stdout.on('data', (chunk: Buffer) => send(chunk.toString('utf-8')));
      proc.stderr.on('data', (chunk: Buffer) => send(chunk.toString('utf-8')));
      proc.on('exit', () => logStreams.delete(streamId));

      logStreams.set(streamId, {
        kill: () => {
          try { proc.kill(); } catch { /* ignore */ }
        },
      });

      return { success: true };
    },
  );

  ipcMain.handle('docker:logs:stop', (_event, streamId: string) => {
    const entry = logStreams.get(streamId);
    if (entry) {
      entry.kill();
      logStreams.delete(streamId);
    }
  });

  // ── Images ─────────────────────────────────────────────────────────────────

  ipcMain.handle('docker:images:list', async () => {
    try {
      const stdout = await dockerExec('docker images --format "{{json .}}"');
      return parseJsonLines(stdout);
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:image:remove', async (_event, id: string) => {
    try {
      await execAsync(`docker rmi ${id}`);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:image:prune', async () => {
    try {
      const { stdout } = await execAsync('docker image prune -f');
      return { success: true, output: stdout };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── Docker Compose ─────────────────────────────────────────────────────────

  ipcMain.handle('docker:compose:list', async () => {
    try {
      const { stdout } = await execAsync('docker compose ls --format json');
      const trimmed = stdout.trim();
      if (!trimmed || trimmed === 'null') return [];
      return JSON.parse(trimmed);
    } catch (err) {
      const msg = String(err);
      // compose ls returns exit code 1 when there are no projects on some versions
      if (msg.includes('exit code 1')) return [];
      return { error: msg };
    }
  });

  ipcMain.handle(
    'docker:compose:up',
    async (_event, projectName: string, configFile: string) => {
      try {
        await execAsync(`docker compose -p "${projectName}" --file "${configFile}" up -d`);
        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'docker:compose:down',
    async (_event, projectName: string, configFile: string) => {
      try {
        await execAsync(`docker compose -p "${projectName}" --file "${configFile}" down`);
        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'docker:compose:restart',
    async (_event, projectName: string, configFile: string) => {
      try {
        await execAsync(`docker compose -p "${projectName}" --file "${configFile}" restart`);
        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    },
  );

  // ── Volumes ────────────────────────────────────────────────────────────────

  ipcMain.handle('docker:volumes:list', async () => {
    try {
      const stdout = await dockerExec('docker volume ls --format "{{json .}}"');
      return parseJsonLines(stdout);
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:volume:remove', async (_event, name: string) => {
    try {
      await execAsync(`docker volume rm "${name}"`);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:volume:prune', async () => {
    try {
      const { stdout } = await execAsync('docker volume prune -f');
      return { success: true, output: stdout };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── Container inspect ──────────────────────────────────────────────────────

  ipcMain.handle('docker:container:inspect', async (_event, id: string) => {
    try {
      const { stdout } = await execAsync(`docker inspect ${id}`);
      return JSON.parse(stdout)?.[0] ?? null;
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── Container exec (node-pty) ──────────────────────────────────────────────

  ipcMain.handle(
    'docker:exec:start',
    (event: Electron.IpcMainInvokeEvent, containerId: string, execId: string, shell: string) => {
      try {
        const proc = pty.spawn('docker', ['exec', '-it', containerId, shell], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          env: process.env as Record<string, string>,
        });

        execSessions.set(execId, proc);

        proc.onData((data) => {
          if (!(event.sender as WebContents).isDestroyed()) {
            (event.sender as WebContents).send(`docker:exec:data:${execId}`, data);
          }
        });

        proc.onExit(() => {
          execSessions.delete(execId);
          if (!(event.sender as WebContents).isDestroyed()) {
            (event.sender as WebContents).send(`docker:exec:exit:${execId}`, 0);
          }
        });

        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    },
  );

  ipcMain.on('docker:exec:write', (_event, execId: string, data: string) => {
    const proc = execSessions.get(execId);
    if (proc) proc.write(data);
  });

  ipcMain.on('docker:exec:resize', (_event, execId: string, cols: number, rows: number) => {
    const proc = execSessions.get(execId);
    if (proc) {
      try { proc.resize(cols, rows); } catch { /* ignore */ }
    }
  });

  ipcMain.handle('docker:exec:stop', (_event, execId: string) => {
    const proc = execSessions.get(execId);
    if (proc) {
      try { proc.kill(); } catch { /* ignore */ }
      execSessions.delete(execId);
    }
  });

  // ── Files ──────────────────────────────────────────────────────────────────

  ipcMain.handle('docker:files:list', async (_event, id: string, path: string) => {
    try {
      const { stdout } = await execAsync(`docker exec ${id} ls -la "${path.replace(/"/g, '\\"')}"`);
      return { output: stdout };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:files:read', async (_event, id: string, path: string) => {
    try {
      // Limit reads to 512KB to avoid flooding the IPC channel
      const { stdout } = await execAsync(
        `docker exec ${id} head -c 524288 "${path.replace(/"/g, '\\"')}"`,
      );
      return { content: stdout };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── Image history ──────────────────────────────────────────────────────────

  ipcMain.handle('docker:image:history', async (_event, id: string) => {
    try {
      const stdout = await dockerExec(`docker history --no-trunc --format "{{json .}}" ${id}`);
      return parseJsonLines(stdout);
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── Volume inspect ─────────────────────────────────────────────────────────

  ipcMain.handle('docker:volume:inspect', async (_event, name: string) => {
    try {
      const { stdout } = await execAsync(`docker volume inspect "${name}"`);
      return JSON.parse(stdout)?.[0] ?? null;
    } catch (err) {
      return { error: String(err) };
    }
  });

  // ── Networks ───────────────────────────────────────────────────────────────

  ipcMain.handle('docker:networks:list', async () => {
    try {
      const stdout = await dockerExec('docker network ls --format "{{json .}}"');
      return parseJsonLines(stdout);
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('docker:network:remove', async (_event, id: string) => {
    try {
      await execAsync(`docker network rm "${id}"`);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function stopAllDockerStreams(): void {
  for (const [id, entry] of logStreams) {
    entry.kill();
    logStreams.delete(id);
  }
  for (const [id, proc] of execSessions) {
    try { proc.kill(); } catch { /* ignore */ }
    execSessions.delete(id);
  }
}
