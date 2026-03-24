import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type AppSettings = {
  terminal: {
    fontFamily: string;
    fontSize: number;
    cursorStyle: 'block' | 'underline' | 'bar';
    scrollback: number;
    shell: string;
  };
  browser: {
    defaultUrl: string;
  };
};

const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    fontFamily: "'CommitMono NF', 'CommitMono NF Mono', Menlo, Monaco, monospace",
    fontSize: 13,
    cursorStyle: 'bar',
    scrollback: 1000,
    shell: '',
  },
  browser: {
    defaultUrl: 'https://www.google.com',
  },
};

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:load', () => {
    try {
      const data = fs.readFileSync(getSettingsPath(), 'utf-8');
      const parsed = JSON.parse(data) as Partial<AppSettings>;
      return {
        terminal: { ...DEFAULT_SETTINGS.terminal, ...(parsed.terminal ?? {}) },
        browser: { ...DEFAULT_SETTINGS.browser, ...(parsed.browser ?? {}) },
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  ipcMain.handle('settings:save', (_event, settings: AppSettings) => {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
  });
}
