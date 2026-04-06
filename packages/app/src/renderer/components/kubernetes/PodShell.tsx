import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, ChevronDown, Box } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { cn } from '@/lib/utils';

type PodShellProps = {
  context: string;
  namespace: string;
  podName: string;
  onBack: () => void;
};

const SHELL_OPTIONS = [
  { label: '/bin/sh', command: ['/bin/sh'] },
  { label: '/bin/bash', command: ['/bin/bash'] },
  { label: '/bin/zsh', command: ['/bin/zsh'] },
];

export function PodShell({ context, namespace, podName, onBack }: PodShellProps) {
  const [containers, setContainers] = useState<string[]>([]);
  const [activeContainer, setActiveContainer] = useState<string>('');
  const [shell, setShell] = useState(SHELL_OPTIONS[0]);
  const [connected, setConnected] = useState(false);
  const [exited, setExited] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const execIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Load containers
  useEffect(() => {
    window.electronAPI.k8s.getPodContainers(context, namespace, podName)
      .then((c) => {
        setContainers(c);
        if (c.length > 0) setActiveContainer(c[0]);
      })
      .catch(() => {});
  }, [context, namespace, podName]);

  const startExec = useCallback(() => {
    if (!activeContainer || !containerRef.current) return;

    // Cleanup previous session
    cleanupRef.current?.();
    terminalRef.current?.dispose();
    terminalRef.current = null;

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
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch { /* webgl not available */ }

    fitAddon.fit();
    terminalRef.current = terminal;

    const execId = crypto.randomUUID();
    execIdRef.current = execId;

    // Wire up terminal I/O
    terminal.onData((data) => {
      window.electronAPI.k8s.execWrite(execId, data);
    });

    const removeDataListener = window.electronAPI.k8s.onExecData(execId, (data) => {
      terminal.write(data);
    });

    const removeExitListener = window.electronAPI.k8s.onExecExit(execId, () => {
      setExited(true);
      setConnected(false);
      terminal.write('\r\n\x1b[33m--- Session ended ---\x1b[0m\r\n');
    });

    // Resize handling
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      fitAddon.fit();
      window.electronAPI.k8s.execResize(execId, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(containerRef.current);

    // Start the exec
    window.electronAPI.k8s.execStart(context, namespace, podName, activeContainer, execId, shell.command)
      .then((result) => {
        if (result.success) {
          setConnected(true);
          // Send initial resize
          window.electronAPI.k8s.execResize(execId, terminal.cols, terminal.rows);
        }
      });

    const cleanup = () => {
      resizeObserver.disconnect();
      removeDataListener();
      removeExitListener();
      window.electronAPI.k8s.execStop(execId);
    };
    cleanupRef.current = cleanup;

    return cleanup;
  }, [context, namespace, podName, activeContainer, shell]);

  // Start exec when container is selected
  useEffect(() => {
    if (!activeContainer) return;
    const cleanup = startExec();
    return cleanup;
  }, [activeContainer, shell]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      terminalRef.current?.dispose();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold truncate">{podName}</h2>
          <p className="text-[10px] text-muted-foreground">
            Shell &middot; {namespace}
          </p>
        </div>

        {/* Container selector */}
        {containers.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border/60 bg-background hover:border-border transition-colors">
                  <Box className="size-3 text-muted-foreground" />
                  <span className="truncate max-w-28 font-medium">{activeContainer}</span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent align="end">
              {containers.map((c) => (
                <DropdownMenuItem
                  key={c}
                  onClick={() => setActiveContainer(c)}
                  className={cn(c === activeContainer && 'bg-accent')}
                >
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Shell selector */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border/60 bg-background hover:border-border transition-colors font-mono">
                {shell.label}
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            {SHELL_OPTIONS.map((s) => (
              <DropdownMenuItem
                key={s.label}
                onClick={() => setShell(s)}
                className={cn(s.label === shell.label && 'bg-accent', 'font-mono')}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2 border-l border-border pl-2 ml-1">
          {connected && (
            <div className="flex items-center gap-1">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-green-400" />
              </span>
              <span className="text-[10px] text-green-400 font-medium">CONNECTED</span>
            </div>
          )}
          {exited && (
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">EXITED</span>
              <Button variant="outline" size="sm" className="text-xs h-6 px-2 ml-1" onClick={startExec}>
                Reconnect
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#0a0a0a]"
        style={{ padding: '4px' }}
      />
    </div>
  );
}
