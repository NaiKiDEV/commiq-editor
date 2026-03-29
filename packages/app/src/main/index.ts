import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerTerminalIpc, killAllSessions } from './ipc/terminal';
import { registerBrowserIpc, destroyAllViews } from './ipc/browser';
import { registerNotesIpc } from './ipc/notes';
import { registerWorkspaceIpc } from './ipc/workspace';
import { registerWorkflowIpc } from './ipc/workflow';
import { registerTimerIpc } from './ipc/timer';
import { registerPortsIpc } from './ipc/ports';
import { registerProcessesIpc } from './ipc/processes';
import { registerEnvIpc } from './ipc/env';
import { registerSettingsIpc } from './ipc/settings';
import { registerHttpIpc } from './ipc/http';
import { registerWhiteboardIpc, registerWhiteboardPush } from './ipc/whiteboard';
import { whiteboardState } from './whiteboard/state';
import { registerRegistersIpc } from './ipc/registers';
import { registerK8sIpc, stopAllK8sWatches } from './ipc/k8s';
import { registerWsIpc, stopAllWsConnections } from './ipc/ws';

if (started) {
  app.quit();
}

// Null menu removes built-in edit shortcuts (Ctrl+A, C, V, Z…) on Windows/Linux.
// Set a hidden Edit-only menu so those shortcuts work in text fields.
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]),
);

registerTerminalIpc();
registerNotesIpc();
registerWorkspaceIpc();
registerWorkflowIpc();
registerTimerIpc();
registerPortsIpc();
registerProcessesIpc();
registerEnvIpc();
registerSettingsIpc();
registerHttpIpc();
registerWhiteboardIpc();
registerRegistersIpc();
registerK8sIpc();
registerWsIpc();

const createWindow = () => {
  const isMac = process.platform === 'darwin';
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(isMac ? {} : {
      titleBarOverlay: {
        color: '#1a1a1a',
        symbolColor: '#e5e5e5',
        height: 36,
      },
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerBrowserIpc(mainWindow);
  registerWhiteboardPush(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

};

app.on('ready', createWindow);

app.on('before-quit', () => {
  whiteboardState.flushAll();
});

app.on('window-all-closed', () => {
  killAllSessions();
  destroyAllViews();
  stopAllK8sWatches();
  stopAllWsConnections();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
