import { useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { useTerminalActions } from '../hooks/use-terminal';
import { useWorkspaceActions } from '../hooks/use-workspace';
import { useSettings } from '../contexts/settings';
import type { Theme } from '../contexts/settings';

const ANSI_DARK = {
  black: '#171717', red: '#ef4444', green: '#22c55e', yellow: '#eab308',
  blue: '#3b82f6', magenta: '#a855f7', cyan: '#06b6d4', white: '#d4d4d4',
  brightBlack: '#525252', brightRed: '#f87171', brightGreen: '#4ade80',
  brightYellow: '#facc15', brightBlue: '#60a5fa', brightMagenta: '#c084fc',
  brightCyan: '#22d3ee', brightWhite: '#fafafa',
};

const ANSI_LIGHT = {
  black: '#1e1e2e', red: '#dc2626', green: '#16a34a', yellow: '#b45309',
  blue: '#2563eb', magenta: '#7c3aed', cyan: '#0e7490', white: '#374151',
  brightBlack: '#6b7280', brightRed: '#ef4444', brightGreen: '#22c55e',
  brightYellow: '#d97706', brightBlue: '#3b82f6', brightMagenta: '#8b5cf6',
  brightCyan: '#06b6d4', brightWhite: '#111827',
};

const TERMINAL_THEMES: Record<Theme, ITheme> = {
  amoled: {
    background: '#171717', foreground: '#e5e5e5',
    cursor: '#a3a3a3', cursorAccent: '#171717',
    selectionBackground: '#404040', selectionForeground: '#fafafa',
    ...ANSI_DARK,
  },
  midnight: {
    background: '#313348', foreground: '#eeeff5',
    cursor: '#9091a6', cursorAccent: '#313348',
    selectionBackground: '#454660', selectionForeground: '#fafafa',
    ...ANSI_DARK,
  },
  light: {
    background: '#f9f9fb', foreground: '#1a1a30',
    cursor: '#6b6b8a', cursorAccent: '#f9f9fb',
    selectionBackground: '#c8c8dc', selectionForeground: '#1a1a30',
    ...ANSI_LIGHT,
  },
  'catppuccin-mocha': {
    background: '#1e1e2e', foreground: '#cdd6f4',
    cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
    selectionBackground: '#585b70', selectionForeground: '#cdd6f4',
    ...ANSI_DARK,
  },
  'gruvbox-material-dark-hard': {
    background: '#1d2021', foreground: '#d4be98',
    cursor: '#a89984', cursorAccent: '#1d2021',
    selectionBackground: '#3c3836', selectionForeground: '#d4be98',
    black: '#1d2021', red: '#ea6962', green: '#a9b665', yellow: '#d8a657',
    blue: '#7daea3', magenta: '#d3869b', cyan: '#89b482', white: '#d4be98',
    brightBlack: '#928374', brightRed: '#ea6962', brightGreen: '#a9b665',
    brightYellow: '#d8a657', brightBlue: '#7daea3', brightMagenta: '#d3869b',
    brightCyan: '#89b482', brightWhite: '#d4be98',
  },
  'rose-pine-moon': {
    background: '#232136', foreground: '#e0def4',
    cursor: '#c4a7e7', cursorAccent: '#232136',
    selectionBackground: '#44415a', selectionForeground: '#e0def4',
    black: '#232136', red: '#eb6f92', green: '#9ccfd8', yellow: '#f6c177',
    blue: '#3e8fb0', magenta: '#c4a7e7', cyan: '#9ccfd8', white: '#e0def4',
    brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#9ccfd8',
    brightYellow: '#f6c177', brightBlue: '#3e8fb0', brightMagenta: '#c4a7e7',
    brightCyan: '#9ccfd8', brightWhite: '#e0def4',
  },
  'kanagawa-wave': {
    background: '#1f1f28', foreground: '#dcd7ba',
    cursor: '#c8c093', cursorAccent: '#1f1f28',
    selectionBackground: '#363646', selectionForeground: '#dcd7ba',
    black: '#090618', red: '#c34043', green: '#76946a', yellow: '#c0a36e',
    blue: '#7e9cd8', magenta: '#957fb8', cyan: '#6a9589', white: '#c8c093',
    brightBlack: '#727169', brightRed: '#e46876', brightGreen: '#98bb6c',
    brightYellow: '#e9c46a', brightBlue: '#7fb4ca', brightMagenta: '#938aa9',
    brightCyan: '#7aa89f', brightWhite: '#dcd7ba',
  },
  'rose-pine': {
    background: '#191724', foreground: '#e0def4',
    cursor: '#e0def4', cursorAccent: '#191724',
    selectionBackground: '#403d52', selectionForeground: '#e0def4',
    black: '#26233a', red: '#eb6f92', green: '#31748f', yellow: '#f6c177',
    blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4',
    brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#31748f',
    brightYellow: '#f6c177', brightBlue: '#9ccfd8', brightMagenta: '#c4a7e7',
    brightCyan: '#ebbcba', brightWhite: '#e0def4',
  },
  'kanagawa-dragon': {
    background: '#1d1c19', foreground: '#c5c9c5',
    cursor: '#a6a69c', cursorAccent: '#1d1c19',
    selectionBackground: '#393836', selectionForeground: '#c5c9c5',
    black: '#0d0c0c', red: '#c4746e', green: '#8a9a7b', yellow: '#c4b28a',
    blue: '#8ba4b0', magenta: '#a292a3', cyan: '#8ea4a2', white: '#c8c093',
    brightBlack: '#a6a69c', brightRed: '#e46876', brightGreen: '#87a987',
    brightYellow: '#e9c46a', brightBlue: '#7fb4ca', brightMagenta: '#938aa9',
    brightCyan: '#7aa89f', brightWhite: '#c5c9c5',
  },
  'catppuccin-latte': {
    background: '#eff1f5', foreground: '#4c4f69',
    cursor: '#8c8fa1', cursorAccent: '#eff1f5',
    selectionBackground: '#acb0be', selectionForeground: '#4c4f69',
    black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
    brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b',
    brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb',
    brightCyan: '#179299', brightWhite: '#bcc0cc',
  },
  'gruvbox-material-light': {
    background: '#fbf1c7', foreground: '#3c3836',
    cursor: '#7c6f64', cursorAccent: '#fbf1c7',
    selectionBackground: '#d5c4a1', selectionForeground: '#3c3836',
    black: '#3c3836', red: '#c14a4a', green: '#6c782e', yellow: '#b47109',
    blue: '#45707a', magenta: '#945e80', cyan: '#4c7a5d', white: '#a89984',
    brightBlack: '#7c6f64', brightRed: '#c14a4a', brightGreen: '#6c782e',
    brightYellow: '#b47109', brightBlue: '#45707a', brightMagenta: '#945e80',
    brightCyan: '#4c7a5d', brightWhite: '#d5c4a1',
  },
  'rose-pine-light': {
    background: '#faf4ed', foreground: '#575279',
    cursor: '#797593', cursorAccent: '#faf4ed',
    selectionBackground: '#dfdad9', selectionForeground: '#575279',
    black: '#f4ede8', red: '#b4637a', green: '#286983', yellow: '#ea9d34',
    blue: '#56949f', magenta: '#907aa9', cyan: '#d7827e', white: '#575279',
    brightBlack: '#9893a5', brightRed: '#b4637a', brightGreen: '#286983',
    brightYellow: '#ea9d34', brightBlue: '#56949f', brightMagenta: '#907aa9',
    brightCyan: '#d7827e', brightWhite: '#575279',
  },
};

type TerminalPanelProps = {
  sessionId: string;
  panelId: string;
};

export function TerminalPanel({ sessionId, panelId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);
  const { spawn, resize, markExited } = useTerminalActions();
  const { closePanel, updatePanelTitle } = useWorkspaceActions();
  const { settings } = useSettings();

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: settings.terminal.cursorStyle,
      fontSize: settings.terminal.fontSize,
      lineHeight: 1.2,
      fontFamily: settings.terminal.fontFamily,
      theme: TERMINAL_THEMES[settings.theme] ?? TERMINAL_THEMES.amoled,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch {}

    fitAddon.fit();
    terminalRef.current = terminal;

    // Let app-level shortcuts bubble up to the DOM instead of being consumed by xterm
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'k') return false;
      return true;
    });

    terminal.onTitleChange((title) => {
      updatePanelTitle(panelId, title);
    });

    terminal.onData((data) => {
      window.electronAPI.terminal.write(sessionId, data);
    });

    const removeDataListener = window.electronAPI.terminal.onData(
      sessionId,
      (data) => terminal.write(data),
    );

    const removeExitListener = window.electronAPI.terminal.onExit(
      sessionId,
      (exitCode) => {
        markExited(sessionId, exitCode);
        closePanel(panelId);
      },
    );

    if (!spawnedRef.current) {
      spawnedRef.current = true;
      spawn(sessionId, panelId, undefined, settings.terminal.shell || undefined);
    }

    // Resize handling — skip when hidden (display:none → 0×0) to avoid scroll shift
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      fitAddon.fit();
      resize(sessionId, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      removeDataListener();
      removeExitListener();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, panelId]);

  useEffect(() => {
    if (!terminalRef.current) return;
    const t = terminalRef.current;
    t.options.cursorStyle = settings.terminal.cursorStyle;
    t.options.fontSize = settings.terminal.fontSize;
    t.options.fontFamily = settings.terminal.fontFamily;
    t.options.scrollback = settings.terminal.scrollback;
    fitAddonRef.current?.fit();
  }, [settings.terminal]);

  useEffect(() => {
    if (!terminalRef.current) return;
    terminalRef.current.options.theme = TERMINAL_THEMES[settings.theme] ?? TERMINAL_THEMES.amoled;
  }, [settings.theme]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ padding: '4px' }}
    />
  );
}
