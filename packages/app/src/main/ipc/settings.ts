import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type AppSettings = {
  theme: string;
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
  whiteboard: {
    mcpPort: number;
  };
  mockServer: {
    mcpPort: number;
  };
  editor: {
    fontFamily: string;
    fontSize: number;
    tabSize: number;
    wordWrap: boolean;
  };
  monitors: {
    refreshInterval: number;
  };
  notes: {
    fontSize: number;
    wordWrap: boolean;
    spellcheck: boolean;
  };
  httpClient: {
    timeout: number;
    followRedirects: boolean;
  };
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'amoled',
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
  whiteboard: {
    mcpPort: 3100,
  },
  mockServer: {
    mcpPort: 3200,
  },
  editor: {
    fontFamily: "'CommitMono NF', 'CommitMono NF Mono', ui-monospace, Menlo, monospace",
    fontSize: 13,
    tabSize: 2,
    wordWrap: true,
  },
  monitors: {
    refreshInterval: 3,
  },
  notes: {
    fontSize: 13,
    wordWrap: true,
    spellcheck: false,
  },
  httpClient: {
    timeout: 30000,
    followRedirects: true,
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
        theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
        terminal: { ...DEFAULT_SETTINGS.terminal, ...(parsed.terminal ?? {}) },
        browser: { ...DEFAULT_SETTINGS.browser, ...(parsed.browser ?? {}) },
        whiteboard: { ...DEFAULT_SETTINGS.whiteboard, ...(parsed.whiteboard ?? {}) },
        mockServer: { ...DEFAULT_SETTINGS.mockServer, ...(parsed.mockServer ?? {}) },
        editor: { ...DEFAULT_SETTINGS.editor, ...(parsed.editor ?? {}) },
        monitors: { ...DEFAULT_SETTINGS.monitors, ...(parsed.monitors ?? {}) },
        notes: { ...DEFAULT_SETTINGS.notes, ...(parsed.notes ?? {}) },
        httpClient: { ...DEFAULT_SETTINGS.httpClient, ...(parsed.httpClient ?? {}) },
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  ipcMain.handle('settings:save', (_event, settings: AppSettings) => {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
  });
}
