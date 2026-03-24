import { useSelector, useQueue } from '@naikidev/commiq-react';
import { terminalStore } from '../stores';
import {
  spawnTerminal,
  killTerminal,
  resizeTerminal,
  terminalExited,
} from '../stores/terminal';

export function useTerminalSession(sessionId: string) {
  return useSelector(terminalStore, (s) => s.sessions[sessionId] ?? null);
}

export function useTerminalActions() {
  const queue = useQueue(terminalStore);

  return {
    spawn: (sessionId: string, panelId: string, cwd?: string, shell?: string) =>
      queue(spawnTerminal(sessionId, panelId, cwd, shell)),
    kill: (id: string) => queue(killTerminal(id)),
    resize: (id: string, cols: number, rows: number) =>
      queue(resizeTerminal(id, cols, rows)),
    markExited: (id: string, exitCode: number) =>
      queue(terminalExited(id, exitCode)),
  };
}
