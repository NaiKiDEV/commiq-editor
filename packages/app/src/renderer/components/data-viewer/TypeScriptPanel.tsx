import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Check } from "lucide-react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting } from "@codemirror/language";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { inferTypeScript, type TsStyle } from "./inference";
import { appHighlightStyle, appTheme } from "./DataEditor";

type TypeScriptPanelProps = {
  data: unknown;
};

export function TypeScriptPanel({ data }: TypeScriptPanelProps) {
  const [style, setStyle] = useState<TsStyle>("type");
  const [extract, setExtract] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef("");

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          history(),
          lineNumbers(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          javascript({ typescript: true }),
          syntaxHighlighting(appHighlightStyle),
          appTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              valueRef.current = update.state.doc.toString();
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Re-infer when data, style, or extract changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    let output: string;
    try {
      output = inferTypeScript(data, "Root", style, extract);
    } catch {
      output = "// Could not infer types";
    }
    valueRef.current = output;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: output },
    });
  }, [data, style, extract]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(valueRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-col border-b border-border shrink-0">
        {/* Row 1: title + copy */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            TypeScript
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            title="Copy"
          >
            {copied ? <Check className="text-green-400" /> : <Copy />}
          </Button>
        </div>
        {/* Row 2: controls */}
        <div className="flex items-center gap-2 px-3 pb-1.5">
          {/* type / interface toggle */}
          <div className="flex rounded border border-border overflow-hidden text-xs">
            {(["type", "interface"] as TsStyle[]).map((s, i) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={cn(
                  "px-2.5 py-1 font-mono transition-colors",
                  i > 0 && "border-l border-border",
                  style === s
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {/* Extract toggle */}
          <button
            onClick={() => setExtract((v) => !v)}
            title="Extract nested objects into named types"
            className={cn(
              "text-xs font-mono px-2.5 py-1 rounded border transition-colors",
              extract
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            extract
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
