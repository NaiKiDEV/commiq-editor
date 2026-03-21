import { ipcMain, WebContentsView, type BrowserWindow } from 'electron';

const views = new Map<string, WebContentsView>();
let mainWindowRef: BrowserWindow | null = null;

export function registerBrowserIpc(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  ipcMain.handle('browser:create', (_event, sessionId: string, url: string) => {
    const view = new WebContentsView();
    views.set(sessionId, view);

    mainWindow.contentView.addChildView(view);

    // Start hidden (zero size) until bounds are set
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    const wc = view.webContents;

    // Forward navigation events to renderer
    const sender = _event.sender;

    wc.on('page-title-updated', (_e, title) => {
      if (!sender.isDestroyed()) {
        sender.send(`browser:title:${sessionId}`, title);
      }
    });

    wc.on('did-navigate', (_e, url) => {
      if (!sender.isDestroyed()) {
        sender.send(`browser:navigated:${sessionId}`, {
          url,
          canGoBack: wc.canGoBack(),
          canGoForward: wc.canGoForward(),
        });
      }
    });

    wc.on('did-navigate-in-page', (_e, url) => {
      if (!sender.isDestroyed()) {
        sender.send(`browser:navigated:${sessionId}`, {
          url,
          canGoBack: wc.canGoBack(),
          canGoForward: wc.canGoForward(),
        });
      }
    });

    wc.on('did-start-loading', () => {
      if (!sender.isDestroyed()) {
        sender.send(`browser:loading:${sessionId}`, true);
      }
    });

    wc.on('did-stop-loading', () => {
      if (!sender.isDestroyed()) {
        sender.send(`browser:loading:${sessionId}`, false);
      }
    });

    // Intercept app-level shortcuts from the embedded page and forward to renderer
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const ctrl = input.control || input.meta;
      if (ctrl && input.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!sender.isDestroyed()) {
          sender.send('app:shortcut', 'toggle-command-palette');
        }
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
    if (view && view.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  });

  ipcMain.on('browser:forward', (_event, sessionId: string) => {
    const view = views.get(sessionId);
    if (view && view.webContents.canGoForward()) {
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
  if (view && mainWindowRef) {
    mainWindowRef.contentView.removeChildView(view);
    view.webContents.close();
    views.delete(sessionId);
  }
}

export function destroyAllViews(): void {
  for (const sessionId of views.keys()) {
    destroyView(sessionId);
  }
}
