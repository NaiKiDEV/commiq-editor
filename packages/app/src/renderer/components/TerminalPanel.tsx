import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { useTerminalActions } from '../hooks/use-terminal';
import { useWorkspaceActions } from '../hooks/use-workspace';

type TerminalPanelProps = {
  sessionId: string;
  panelId: string;
};

export function TerminalPanel({ sessionId, panelId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const spawnedRef = useRef(false);
  const { spawn, resize, markExited } = useTerminalActions();
  const { closePanel, updatePanelTitle } = useWorkspaceActions();

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily: "'CommitMono NF', 'CommitMono NF Mono', Menlo, Monaco, monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#a3a3a3',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#525252',
        selectionForeground: '#fafafa',
        black: '#171717',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#d4d4d4',
        brightBlack: '#525252',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    // WebGL renderer for better performance
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, falls back to canvas
    }

    fitAddon.fit();
    terminalRef.current = terminal;

    // Let app-level shortcuts bubble up to the DOM instead of being consumed by xterm
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'k') return false;
      return true;
    });

    // Title tracking: shell escape sequences update tab title
    terminal.onTitleChange((title) => {
      updatePanelTitle(panelId, title);
    });

    // Data plane: keystrokes → PTY (direct IPC, bypasses commiq)
    terminal.onData((data) => {
      window.electronAPI.terminal.write(sessionId, data);
    });

    // Data plane: PTY output → xterm (direct IPC, bypasses commiq)
    const removeDataListener = window.electronAPI.terminal.onData(
      sessionId,
      (data) => terminal.write(data),
    );

    // Control plane: PTY exit → mark exited + auto-close tab
    const removeExitListener = window.electronAPI.terminal.onExit(
      sessionId,
      (exitCode) => {
        markExited(sessionId, exitCode);
        closePanel(panelId);
      },
    );

    // Spawn the PTY (control plane via commiq)
    if (!spawnedRef.current) {
      spawnedRef.current = true;
      spawn(sessionId, panelId);
    }

    // Resize handling
    const resizeObserver = new ResizeObserver(() => {
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
    };
  }, [sessionId, panelId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ padding: '4px' }}
    />
  );
}
