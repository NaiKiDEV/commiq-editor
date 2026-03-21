import {
  createStore,
  sealStore,
  createCommand,
  createEvent,
} from '@naikidev/commiq';
import { withPatch, withInjector } from '@naikidev/commiq-context';

export type BrowserSession = {
  id: string;
  panelId: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type BrowserState = {
  sessions: Record<string, BrowserSession>;
};

const initialState: BrowserState = {
  sessions: {},
};

export const BrowserCreated = createEvent<BrowserSession>('browser:created');

export type BrowserDeps = {
  ipc: {
    create: (sessionId: string, url: string) => Promise<{ id: string }>;
    destroy: (sessionId: string) => Promise<void>;
    navigate: (sessionId: string, url: string) => void;
    back: (sessionId: string) => void;
    forward: (sessionId: string) => void;
    reload: (sessionId: string) => void;
  };
};

export function createBrowserStore(deps: BrowserDeps) {
  const _store = createStore(initialState)
    .useExtension(withPatch<BrowserState>())
    .useExtension(withInjector<BrowserState>()(deps))
    .addCommandHandler('browser:open', async (ctx, cmd) => {
      const { sessionId, panelId, url } = cmd.data as {
        sessionId: string;
        panelId: string;
        url: string;
      };

      await ctx.deps.ipc.create(sessionId, url);

      const session: BrowserSession = {
        id: sessionId,
        panelId,
        url,
        title: url,
        loading: true,
        canGoBack: false,
        canGoForward: false,
      };

      ctx.patch({
        sessions: { ...ctx.state.sessions, [sessionId]: session },
      });
      ctx.emit(BrowserCreated, session);
    })
    .addCommandHandler('browser:navigate', (ctx, cmd) => {
      const { id, url } = cmd.data as { id: string; url: string };
      const session = ctx.state.sessions[id];
      if (session) {
        ctx.deps.ipc.navigate(id, url);
        ctx.patch({
          sessions: {
            ...ctx.state.sessions,
            [id]: { ...session, url, loading: true },
          },
        });
      }
    })
    .addCommandHandler('browser:back', (ctx, cmd) => {
      const { id } = cmd.data as { id: string };
      ctx.deps.ipc.back(id);
    })
    .addCommandHandler('browser:forward', (ctx, cmd) => {
      const { id } = cmd.data as { id: string };
      ctx.deps.ipc.forward(id);
    })
    .addCommandHandler('browser:reload', (ctx, cmd) => {
      const { id } = cmd.data as { id: string };
      ctx.deps.ipc.reload(id);
    })
    .addCommandHandler('browser:close', async (ctx, cmd) => {
      const { id } = cmd.data as { id: string };
      await ctx.deps.ipc.destroy(id);
      const { [id]: _, ...rest } = ctx.state.sessions;
      ctx.patch({ sessions: rest });
    })
    .addCommandHandler('browser:updateNavigation', (ctx, cmd) => {
      const { id, url, canGoBack, canGoForward } = cmd.data as {
        id: string;
        url: string;
        canGoBack: boolean;
        canGoForward: boolean;
      };
      const session = ctx.state.sessions[id];
      if (session) {
        ctx.patch({
          sessions: {
            ...ctx.state.sessions,
            [id]: { ...session, url, canGoBack, canGoForward },
          },
        });
      }
    })
    .addCommandHandler('browser:updateTitle', (ctx, cmd) => {
      const { id, title } = cmd.data as { id: string; title: string };
      const session = ctx.state.sessions[id];
      if (session) {
        ctx.patch({
          sessions: {
            ...ctx.state.sessions,
            [id]: { ...session, title },
          },
        });
      }
    })
    .addCommandHandler('browser:updateLoading', (ctx, cmd) => {
      const { id, loading } = cmd.data as { id: string; loading: boolean };
      const session = ctx.state.sessions[id];
      if (session) {
        ctx.patch({
          sessions: {
            ...ctx.state.sessions,
            [id]: { ...session, loading },
          },
        });
      }
    });

  return sealStore(_store);
}

export const openBrowser = (sessionId: string, panelId: string, url: string) =>
  createCommand('browser:open', { sessionId, panelId, url });

export const navigateBrowser = (id: string, url: string) =>
  createCommand('browser:navigate', { id, url });

export const browserBack = (id: string) =>
  createCommand('browser:back', { id });

export const browserForward = (id: string) =>
  createCommand('browser:forward', { id });

export const browserReload = (id: string) =>
  createCommand('browser:reload', { id });

export const closeBrowser = (id: string) =>
  createCommand('browser:close', { id });

export const updateBrowserNavigation = (
  id: string,
  url: string,
  canGoBack: boolean,
  canGoForward: boolean,
) => createCommand('browser:updateNavigation', { id, url, canGoBack, canGoForward });

export const updateBrowserTitle = (id: string, title: string) =>
  createCommand('browser:updateTitle', { id, title });

export const updateBrowserLoading = (id: string, loading: boolean) =>
  createCommand('browser:updateLoading', { id, loading });
