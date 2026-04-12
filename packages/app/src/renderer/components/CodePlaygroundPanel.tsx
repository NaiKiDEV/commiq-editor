import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, StreamLanguage } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { tags } from '@lezer/highlight';
import { python } from '@codemirror/legacy-modes/mode/python';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { go } from '@codemirror/legacy-modes/mode/go';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { perl } from '@codemirror/legacy-modes/mode/perl';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { Play, Square, Trash2, ChevronDown, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

type Runtime = {
  id: string;
  name: string;
  cmd: string;
  args: string[];
  ext: string;
};

type OutputLine = {
  type: 'stdout' | 'stderr' | 'system';
  text: string;
};

type RunState = 'idle' | 'running' | 'success' | 'error';

const DEFAULT_CODE: Record<string, string> = {
  node: '// Node.js\nconsole.log("Hello from Node.js!");\n',
  bun: '// Bun (TypeScript)\nconst msg: string = "Hello from Bun!";\nconsole.log(msg);\n',
  deno: '// Deno (TypeScript)\nconst msg: string = "Hello from Deno!";\nconsole.log(msg);\n',
  python: '# Python\nprint("Hello from Python!")\n',
  ruby: '# Ruby\nputs "Hello from Ruby!"\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from Go!")\n}\n',
  perl: '#!/usr/bin/perl\nuse strict;\nuse warnings;\nprint "Hello from Perl!\\n";\n',
  lua: '-- Lua\nprint("Hello from Lua!")\n',
  bash: '#!/bin/bash\necho "Hello from Bash!"\n',
  powershell: '# PowerShell\nWrite-Output "Hello from PowerShell!"\n',
};

const highlightStyle = HighlightStyle.define([
  { tag: tags.string,                          color: '#e09e5a' },
  { tag: tags.number,                          color: '#7ec986' },
  { tag: [tags.bool, tags.null],               color: '#79b8ff' },
  { tag: tags.keyword,                         color: '#79b8ff' },
  { tag: [tags.propertyName, tags.variableName], color: '#9ecbff' },
  { tag: tags.comment,                         color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.atom,                            color: '#79b8ff' },
  { tag: [tags.bracket, tags.punctuation],     color: '#8b949e' },
  { tag: tags.typeName,                        color: '#b392f0' },
  { tag: tags.definition(tags.variableName),   color: '#9ecbff' },
  { tag: tags.className,                       color: '#b392f0' },
  { tag: tags.function(tags.variableName),     color: '#7ec986' },
  { tag: tags.operator,                        color: '#79b8ff' },
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    background: 'transparent',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-content': { caretColor: '#e6edf3', padding: '8px 0', color: '#e6edf3' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    paddingRight: '4px',
    minWidth: '36px',
  },
  '.cm-activeLineGutter': { background: 'transparent' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.04)' },
  '.cm-selectionBackground': { background: 'rgba(99,135,255,0.25) !important' },
  '&.cm-focused .cm-selectionBackground': { background: 'rgba(99,135,255,0.3) !important' },
  '.cm-cursor': { borderLeftColor: '#e6edf3' },
  '.cm-focused': { outline: 'none' },
  '.cm-tooltip': { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '6px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--accent)', color: 'var(--accent-foreground)' },
}, { dark: true });

function getLanguageExtension(runtimeId: string) {
  switch (runtimeId) {
    case 'node':   return javascript({ jsx: true });
    case 'bun':
    case 'deno':   return javascript({ typescript: true, jsx: true });
    case 'python': return StreamLanguage.define(python);
    case 'ruby':   return StreamLanguage.define(ruby);
    case 'go':     return StreamLanguage.define(go);
    case 'perl':   return StreamLanguage.define(perl);
    case 'lua':    return StreamLanguage.define(lua);
    case 'bash':   return StreamLanguage.define(shell);
    case 'powershell': return StreamLanguage.define(powerShell);
    default:       return javascript();
  }
}

function RuntimeDropdown({
  runtimes,
  selected,
  onSelect,
}: {
  runtimes: Runtime[];
  selected: Runtime | null;
  onSelect: (r: Runtime) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors border border-border"
      >
        <span className="text-foreground">{selected?.name ?? 'Select runtime…'}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-36 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          {runtimes.map((r) => (
            <button
              key={r.id}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors',
                selected?.id === r.id && 'bg-accent/50 text-accent-foreground',
              )}
              onClick={() => { onSelect(r); setOpen(false); }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CodePlaygroundPanel({ panelId }: { panelId: string }) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const outputEndRef = useRef<HTMLDivElement>(null);
  const runCodeRef = useRef<() => void>(() => {});

  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState<Runtime | null>(null);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [runState, setRunState] = useState<RunState>('idle');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [loadingRuntimes, setLoadingRuntimes] = useState(true);

  // Detect runtimes on mount
  useEffect(() => {
    window.electronAPI.codePlayground.detectRuntimes().then((detected) => {
      setRuntimes(detected);
      if (detected.length > 0) setSelectedRuntime(detected[0]);
      setLoadingRuntimes(false);
    });
  }, []);

  // Build editor once runtimes are loaded
  useEffect(() => {
    if (!editorContainerRef.current || viewRef.current) return;

    const initialLang = selectedRuntime ? getLanguageExtension(selectedRuntime.id) : javascript();

    const view = new EditorView({
      state: EditorState.create({
        doc: selectedRuntime ? DEFAULT_CODE[selectedRuntime.id] ?? '' : '',
        extensions: [
          history(),
          lineNumbers(),
          keymap.of([
            { key: 'Ctrl-Enter', run: () => { runCodeRef.current(); return true; } },
            { key: 'Mod-Enter',  run: () => { runCodeRef.current(); return true; } },
            indentWithTab,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          closeBrackets(),
          autocompletion(),
          langCompartment.current.of(initialLang),
          syntaxHighlighting(highlightStyle),
          editorTheme,
          EditorView.lineWrapping,
        ],
      }),
      parent: editorContainerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [loadingRuntimes]); // only once after runtimes load

  // Update language when runtime changes (after initial mount)
  const prevRuntimeId = useRef<string | null>(null);
  useEffect(() => {
    if (!viewRef.current || !selectedRuntime) return;
    if (prevRuntimeId.current === selectedRuntime.id) return;
    prevRuntimeId.current = selectedRuntime.id;

    const newLang = getLanguageExtension(selectedRuntime.id);
    viewRef.current.dispatch({
      effects: langCompartment.current.reconfigure(newLang),
    });

    // If editor is empty, populate with default code
    const currentContent = viewRef.current.state.doc.toString();
    if (!currentContent.trim()) {
      const defaultCode = DEFAULT_CODE[selectedRuntime.id] ?? '';
      viewRef.current.dispatch({
        changes: { from: 0, to: currentContent.length, insert: defaultCode },
      });
    }
  }, [selectedRuntime]);

  // Register output/exit listeners
  useEffect(() => {
    const removeOutput = window.electronAPI.codePlayground.onOutput(panelId, (data) => {
      setOutput((prev) => [...prev, data]);
    });

    const removeExit = window.electronAPI.codePlayground.onExit(panelId, (code) => {
      setExitCode(code);
      setRunState(code === 0 ? 'success' : 'error');
      setOutput((prev) => [
        ...prev,
        {
          type: 'system',
          text: `\nProcess exited with code ${code}\n`,
        },
      ]);
    });

    return () => {
      removeOutput();
      removeExit();
      window.electronAPI.codePlayground.kill(panelId);
    };
  }, [panelId]);

  // Auto-scroll output to bottom
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  const runCode = useCallback(() => {
    if (!viewRef.current || !selectedRuntime || runState === 'running') return;
    const code = viewRef.current.state.doc.toString();
    if (!code.trim()) return;

    setOutput([]);
    setExitCode(null);
    setRunState('running');

    window.electronAPI.codePlayground.execute(panelId, selectedRuntime, code);
  }, [panelId, selectedRuntime, runState]);

  // Keep ref in sync so keymap handler always calls the latest version
  runCodeRef.current = runCode;

  const killCode = useCallback(() => {
    window.electronAPI.codePlayground.kill(panelId);
    setRunState('idle');
    setOutput((prev) => [
      ...prev,
      { type: 'system', text: '\nProcess killed by user\n' },
    ]);
  }, [panelId]);

  const clearOutput = useCallback(() => {
    setOutput([]);
    setExitCode(null);
    setRunState('idle');
  }, []);

  const handleSelectRuntime = useCallback((runtime: Runtime) => {
    setSelectedRuntime(runtime);
    clearOutput();
  }, [clearOutput]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        {loadingRuntimes ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Detecting runtimes…
          </span>
        ) : runtimes.length === 0 ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />
            No runtimes detected
          </span>
        ) : (
          <RuntimeDropdown
            runtimes={runtimes}
            selected={selectedRuntime}
            onSelect={handleSelectRuntime}
          />
        )}

        <div className="flex items-center gap-1 ml-auto">
          {/* Status indicator */}
          {runState === 'running' && (
            <span className="flex items-center gap-1 text-xs text-yellow-400 mr-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Running…
            </span>
          )}
          {runState === 'success' && (
            <span className="flex items-center gap-1 text-xs text-green-400 mr-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Done ({exitCode})
            </span>
          )}
          {runState === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-400 mr-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Exit {exitCode}
            </span>
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            title="Clear output"
            onClick={clearOutput}
            disabled={output.length === 0}
          >
            <Trash2 />
          </Button>

          {runState === 'running' ? (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Kill process"
              onClick={killCode}
              className="text-red-400 hover:text-red-300"
            >
              <Square />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Run (Ctrl+Enter)"
              onClick={runCode}
              disabled={!selectedRuntime}
              className="text-green-400 hover:text-green-300"
            >
              <Play />
            </Button>
          )}
        </div>
      </div>

      {/* Editor + Output split */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Editor — takes 60% */}
        <div className="flex-[3] min-h-0 border-b border-border">
          {runtimes.length === 0 && !loadingRuntimes ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-6 text-center">
              <AlertCircle className="w-8 h-8 text-yellow-400/70" />
              <div>
                <p className="text-sm font-medium text-foreground/70">No runtimes found</p>
                <p className="text-xs mt-1">
                  Install Node.js, Python, Ruby, Go, or another supported runtime and restart the app.
                </p>
              </div>
            </div>
          ) : (
            <div ref={editorContainerRef} className="h-full" />
          )}
        </div>

        {/* Output pane — takes 40% */}
        <div className="flex-[2] min-h-0 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Output
            </span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-xs p-3 leading-relaxed">
            {output.length === 0 ? (
              <span className="text-muted-foreground/40 select-none">
                Run code to see output…
              </span>
            ) : (
              output.map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    'whitespace-pre-wrap break-all',
                    line.type === 'stderr' && 'text-red-400',
                    line.type === 'system' && 'text-muted-foreground italic',
                    line.type === 'stdout' && 'text-foreground',
                  )}
                >
                  {line.text}
                </span>
              ))
            )}
            <div ref={outputEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
