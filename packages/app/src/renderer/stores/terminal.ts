import {
  createStore,
  sealStore,
  createCommand,
  createEvent,
} from '@naikidev/commiq';
import { withPatch, withInjector } from '@naikidev/commiq-context';

export type TerminalSession = {
  id: string;
  panelId: string;
  pid: number;
  title: string;
  cwd: string;
  status: 'running' | 'exited';
};

export type TerminalState = {
  sessions: Record<string, TerminalSession>;
};

const initialState: TerminalState = {
  sessions: {},
};

export const TerminalSpawned = createEvent<TerminalSession>('terminal:spawned');
export const TerminalExited = createEvent<{ id: string; exitCode: number }>('terminal:exited');

export type TerminalDeps = {
  ipc: {
    getShells: () => Promise<string[]>;
    spawn: (sessionId: string, cwd?: string, shell?: string) => Promise<{ pid: number }>;
    kill: (sessionId: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => void;
  };
};

export function createTerminalStore(deps: TerminalDeps) {
  const _store = createStore(initialState)
    .useExtension(withPatch<TerminalState>())
    .useExtension(withInjector<TerminalState>()(deps))
    .addCommandHandler(
      'terminal:spawn',
      async (ctx, cmd) => {
        const { sessionId, panelId, cwd, shell } = cmd.data as {
          sessionId: string;
          panelId: string;
          cwd?: string;
          shell?: string;
        };

        const { pid } = await ctx.deps.ipc.spawn(sessionId, cwd, shell);

        const session: TerminalSession = {
          id: sessionId,
          panelId,
          pid,
          title: 'Terminal',
          cwd: cwd || '',
          status: 'running',
        };

        ctx.patch({
          sessions: { ...ctx.state.sessions, [sessionId]: session },
        });
        ctx.emit(TerminalSpawned, session);
      },
    )
    .addCommandHandler('terminal:kill', async (ctx, cmd) => {
      const { id } = cmd.data as { id: string };
      await ctx.deps.ipc.kill(id);
      const { [id]: _, ...rest } = ctx.state.sessions;
      ctx.patch({ sessions: rest });
    })
    .addCommandHandler('terminal:resize', (ctx, cmd) => {
      const { id, cols, rows } = cmd.data as {
        id: string;
        cols: number;
        rows: number;
      };
      ctx.deps.ipc.resize(id, cols, rows);
    })
    .addCommandHandler('terminal:exited', (ctx, cmd) => {
      const { id, exitCode } = cmd.data as { id: string; exitCode: number };
      const session = ctx.state.sessions[id];
      if (session) {
        ctx.patch({
          sessions: {
            ...ctx.state.sessions,
            [id]: { ...session, status: 'exited' },
          },
        });
        ctx.emit(TerminalExited, { id, exitCode });
      }
    });

  return sealStore(_store);
}

export const spawnTerminal = (sessionId: string, panelId: string, cwd?: string, shell?: string) =>
  createCommand('terminal:spawn', { sessionId, panelId, cwd, shell });

export const killTerminal = (id: string) =>
  createCommand('terminal:kill', { id });

export const resizeTerminal = (id: string, cols: number, rows: number) =>
  createCommand('terminal:resize', { id, cols, rows });

export const terminalExited = (id: string, exitCode: number) =>
  createCommand('terminal:exited', { id, exitCode });
