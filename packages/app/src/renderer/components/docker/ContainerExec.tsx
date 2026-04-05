import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { DockerContainer } from './types';

type Props = { container: DockerContainer };

const SHELL_OPTIONS = [
  { label: '/bin/sh', value: '/bin/sh' },
  { label: '/bin/bash', value: '/bin/bash' },
  { label: '/bin/zsh', value: '/bin/zsh' },
  { label: 'cmd', value: 'cmd' },
];

export function ContainerExec({ container }: Props) {
  const [shell, setShell] = useState(SHELL_OPTIONS[0]);
  const [connected, setConnected] = useState(false);
  const [exited, setExited] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const execIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startExec = useCallback(() => {
    if (!containerRef.current) return;

    cleanupRef.current?.();
    termRef.current?.dispose();
    termRef.current = null;

    setConnected(false);
    setExited(false);

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
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
    fitRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch { /* webgl unavailable */ }

    fitAddon.fit();
    termRef.current = terminal;

    const execId = crypto.randomUUID();
    execIdRef.current = execId;

    terminal.onData((data) => window.electronAPI.docker.execWrite(execId, data));

    const removeData = window.electronAPI.docker.onExecData(execId, (data) => terminal.write(data));
    const removeExit = window.electronAPI.docker.onExecExit(execId, () => {
      setExited(true);
      setConnected(false);
      terminal.write('\r\n\x1b[33m--- Session ended ---\x1b[0m\r\n');
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (execIdRef.current) {
        window.electronAPI.docker.execResize(execId, terminal.cols, terminal.rows);
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    window.electronAPI.docker.execStart(container.ID, execId, shell.value).then((result) => {
      if ('success' in result) {
        setConnected(true);
        window.electronAPI.docker.execResize(execId, terminal.cols, terminal.rows);
      } else {
        terminal.write(`\r\n\x1b[31mError: ${(result as { error: string }).error}\x1b[0m\r\n`);
      }
    });

    cleanupRef.current = () => {
      ro.disconnect();
      removeData();
      removeExit();
      window.electronAPI.docker.execStop(execId);
    };
  }, [container.ID, shell.value]);

  useEffect(() => {
    startExec();
    return () => {
      cleanupRef.current?.();
      termRef.current?.dispose();
    };
  }, [startExec]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-border/60 bg-background hover:border-border transition-colors font-mono">
                {shell.label}
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              </button>
            }
          />
          <DropdownMenuContent align="start">
            {SHELL_OPTIONS.map((s) => (
              <DropdownMenuItem
                key={s.value}
                onClick={() => setShell(s)}
                className={cn(s.value === shell.value && 'bg-accent', 'font-mono text-xs')}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1.5 ml-1">
          {connected && (
            <>
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-green-400" />
              </span>
              <span className="text-[10px] text-green-400 font-medium">CONNECTED</span>
            </>
          )}
          {exited && (
            <>
              <span className="size-2 rounded-full bg-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground font-medium">EXITED</span>
              <Button variant="outline" size="sm" className="h-5 text-[10px] px-2 ml-1" onClick={startExec}>
                Reconnect
              </Button>
            </>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 bg-[#0a0a0a]" style={{ padding: 4 }} />
    </div>
  );
}
