import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Runtime = {
  id: string;
  name: string;
  cmd: string;
  args: string[];
  ext: string;
};

type RuntimeDef = {
  id: string;
  name: string;
  cmds: string[];
  args: string[];
  ext: string;
};

const RUNTIME_DEFS: RuntimeDef[] = [
  { id: 'node',       name: 'Node.js',    cmds: ['node'],              args: [],        ext: '.js'  },
  { id: 'bun',        name: 'Bun',        cmds: ['bun'],               args: ['run'],   ext: '.ts'  },
  { id: 'deno',       name: 'Deno',       cmds: ['deno'],              args: ['run'],   ext: '.ts'  },
  { id: 'python',     name: 'Python',     cmds: ['python3', 'python'], args: [],        ext: '.py'  },
  { id: 'ruby',       name: 'Ruby',       cmds: ['ruby'],              args: [],        ext: '.rb'  },
  { id: 'go',         name: 'Go',         cmds: ['go'],                args: ['run'],   ext: '.go'  },
  { id: 'perl',       name: 'Perl',       cmds: ['perl'],              args: [],        ext: '.pl'  },
  { id: 'lua',        name: 'Lua',        cmds: ['lua', 'lua5.4', 'lua5.3'], args: [], ext: '.lua' },
  { id: 'bash',       name: 'Bash',       cmds: ['bash'],              args: [],        ext: '.sh'  },
  { id: 'powershell', name: 'PowerShell', cmds: ['pwsh', 'powershell'], args: ['-File'], ext: '.ps1' },
];

function findCmd(cmds: string[]): string | null {
  const isWin = process.platform === 'win32';
  for (const cmd of cmds) {
    try {
      if (isWin) {
        execSync(`where "${cmd}"`, { stdio: 'pipe', timeout: 3000 });
      } else {
        execSync(`which "${cmd}"`, { stdio: 'pipe', timeout: 3000 });
      }
      return cmd;
    } catch {
      // not found
    }
  }
  return null;
}

const activeProcesses = new Map<string, ReturnType<typeof spawn>>();

export function registerCodePlaygroundIpc(): void {
  ipcMain.handle('code-playground:detect-runtimes', (): Runtime[] => {
    const result: Runtime[] = [];
    for (const def of RUNTIME_DEFS) {
      // On non-Windows, skip PowerShell if not installed (it's opt-in)
      if (def.id === 'powershell' && process.platform !== 'win32') {
        const cmd = findCmd(def.cmds);
        if (!cmd) continue;
        result.push({ id: def.id, name: def.name, cmd, args: def.args, ext: def.ext });
        continue;
      }
      // On Windows, skip bash (unless Git Bash is in PATH)
      if (def.id === 'bash' && process.platform === 'win32') {
        const cmd = findCmd(def.cmds);
        if (!cmd) continue;
        result.push({ id: def.id, name: def.name, cmd, args: def.args, ext: def.ext });
        continue;
      }
      const cmd = findCmd(def.cmds);
      if (cmd) {
        result.push({ id: def.id, name: def.name, cmd, args: def.args, ext: def.ext });
      }
    }
    return result;
  });

  ipcMain.handle(
    'code-playground:execute',
    (event, panelId: string, runtime: Runtime, code: string) => {
      // Kill any existing process for this panel
      const existing = activeProcesses.get(panelId);
      if (existing) {
        try { existing.kill('SIGTERM'); } catch {}
        activeProcesses.delete(panelId);
      }

      const tmpFile = path.join(os.tmpdir(), `codeplay_${panelId}${runtime.ext}`);
      fs.writeFileSync(tmpFile, code, 'utf-8');

      const sender = event.sender;

      const proc = spawn(runtime.cmd, [...runtime.args, tmpFile], {
        env: { ...process.env } as Record<string, string>,
        cwd: os.homedir(),
        windowsHide: true,
      });

      activeProcesses.set(panelId, proc);

      proc.stdout?.on('data', (data: Buffer) => {
        if (!sender.isDestroyed()) {
          sender.send(`code-playground:output:${panelId}`, { type: 'stdout', text: data.toString() });
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (!sender.isDestroyed()) {
          sender.send(`code-playground:output:${panelId}`, { type: 'stderr', text: data.toString() });
        }
      });

      proc.on('close', (exitCode) => {
        activeProcesses.delete(panelId);
        try { fs.unlinkSync(tmpFile); } catch {}
        if (!sender.isDestroyed()) {
          sender.send(`code-playground:exit:${panelId}`, exitCode ?? 0);
        }
      });

      proc.on('error', (err) => {
        activeProcesses.delete(panelId);
        try { fs.unlinkSync(tmpFile); } catch {}
        if (!sender.isDestroyed()) {
          sender.send(`code-playground:output:${panelId}`, {
            type: 'stderr',
            text: `Failed to start process: ${err.message}\n`,
          });
          sender.send(`code-playground:exit:${panelId}`, 1);
        }
      });

      return { started: true };
    },
  );

  ipcMain.handle('code-playground:kill', (_event, panelId: string) => {
    const proc = activeProcesses.get(panelId);
    if (proc) {
      try { proc.kill('SIGTERM'); } catch {}
      activeProcesses.delete(panelId);
    }
  });
}
