import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerTerminalIpc, killAllSessions } from './ipc/terminal';
import { registerBrowserIpc, destroyAllViews } from './ipc/browser';
import { registerNotesIpc } from './ipc/notes';
import { registerWorkspaceIpc } from './ipc/workspace';
import { registerWorkflowIpc } from './ipc/workflow';

if (started) {
  app.quit();
}

Menu.setApplicationMenu(null);

registerTerminalIpc();
registerNotesIpc();
registerWorkspaceIpc();
registerWorkflowIpc();

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',
      symbolColor: '#e5e5e5',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerBrowserIpc(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  killAllSessions();
  destroyAllViews();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
