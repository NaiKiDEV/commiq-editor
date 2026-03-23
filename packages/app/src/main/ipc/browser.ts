import { ipcMain, WebContentsView, type BrowserWindow } from 'electron';

const views = new Map<string, WebContentsView>();
let mainWindowRef: BrowserWindow | null = null;

export function registerBrowserIpc(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  ipcMain.handle('browser:create', (_event, sessionId: string, url: string) => {
    const view = new WebContentsView();
    views.set(sessionId, view);

    mainWindow.contentView.addChildView(view);

    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    const wc = view.webContents;

    // Use mainWindowRef.webContents for all event forwarding — the captured
    // _event.sender can go stale after Vite HMR reloads, causing events to
    // silently drop.
    const send = (channel: string, ...args: unknown[]) => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send(channel, ...args);
      }
    };

    wc.on('page-title-updated', (_e, title) => {
      send(`browser:title:${sessionId}`, title);
    });

    wc.on('did-navigate', (_e, url) => {
      send(`browser:navigated:${sessionId}`, {
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });

    wc.on('did-navigate-in-page', (_e, url) => {
      send(`browser:navigated:${sessionId}`, {
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });

    wc.on('did-finish-load', () => {
      send(`browser:navigated:${sessionId}`, {
        url: wc.getURL(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });

    wc.on('did-start-loading', () => {
      send(`browser:loading:${sessionId}`, true);
    });

    wc.on('did-stop-loading', () => {
      send(`browser:loading:${sessionId}`, false);
    });

    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const ctrl = input.control || input.meta;
      if (!ctrl) return;

      const key = input.key.toLowerCase();

      if (key === 'k') {
        e.preventDefault();
        send('app:shortcut', 'toggle-command-palette');
      } else if (key === 'tab') {
        e.preventDefault();
        send('app:shortcut', input.shift ? 'prev-tab' : 'next-tab');
      } else if (key === 'w') {
        e.preventDefault();
        send('app:shortcut', 'close-tab');
      } else if (key === 'n') {
        e.preventDefault();
        send('app:shortcut', 'new-tab');
      } else if (key >= '1' && key <= '9') {
        e.preventDefault();
        send('app:shortcut', `activate-tab-${key}`);
      }
    });

    wc.loadURL(url);

    return { id: sessionId };
  });

  ipcMain.on('browser:navigate', (_event, sessionId: string, url: string) => {
    const view = views.get(sessionId);
    if (view) {
      view.webContents.loadURL(url);
    }
  });

  ipcMain.on('browser:back', (_event, sessionId: string) => {
    const view = views.get(sessionId);
    if (view && view.webContents.navigationHistory.canGoBack()) {
      view.webContents.goBack();
    }
  });

  ipcMain.on('browser:forward', (_event, sessionId: string) => {
    const view = views.get(sessionId);
    if (view && view.webContents.navigationHistory.canGoForward()) {
      view.webContents.goForward();
    }
  });

  ipcMain.on('browser:reload', (_event, sessionId: string) => {
    views.get(sessionId)?.webContents.reload();
  });

  ipcMain.on(
    'browser:setBounds',
    (_event, sessionId: string, bounds: { x: number; y: number; width: number; height: number }) => {
      const view = views.get(sessionId);
      if (view) {
        view.setBounds(bounds);
      }
    },
  );

  ipcMain.on('browser:show', (_event, sessionId: string) => {
    const view = views.get(sessionId);
    if (view) {
      view.setVisible(true);
    }
  });

  ipcMain.on('browser:hide', (_event, sessionId: string) => {
    const view = views.get(sessionId);
    if (view) {
      view.setVisible(false);
    }
  });

  ipcMain.on('browser:hideAll', () => {
    for (const view of views.values()) {
      view.setVisible(false);
    }
  });

  ipcMain.on('browser:showSession', (_event, sessionId: string) => {
    const view = views.get(sessionId);
    if (view) {
      view.setVisible(true);
    }
  });

  ipcMain.handle('browser:destroy', (_event, sessionId: string) => {
    destroyView(sessionId);
  });
}

function destroyView(sessionId: string): void {
  const view = views.get(sessionId);
  if (!view) return;
  views.delete(sessionId);
  try {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  } catch {
    // view already destroyed during shutdown
  }
}

export function destroyAllViews(): void {
  for (const sessionId of views.keys()) {
    destroyView(sessionId);
  }
}
