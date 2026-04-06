import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { appHighlightStyle, appTheme } from "../data-viewer/DataEditor";

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Approximate visible line count (controls min-height via CSS) */
  minLines?: number;
  placeholder?: string;
  className?: string;
};

/**
 * Compact CodeMirror-powered JSON editor for inline use in forms.
 * Reuses the app-wide theme and highlight style from DataEditor.
 */
export function JsonEditor({
  value,
  onChange,
  minLines = 4,
  className,
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);

  // Create the editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          history(),
          lineNumbers(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          json(),
          syntaxHighlighting(appHighlightStyle),
          compactTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newVal = update.state.doc.toString();
              valueRef.current = newVal;
              onChangeRef.current(newVal);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === valueRef.current) return;
    valueRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  const minH = `${minLines * 20}px`;

  return (
    <div ref={containerRef} className={className} style={{ minHeight: minH }} />
  );
}

/**
 * Compact variant of the app theme — smaller font, tighter padding,
 * blends into form borders.
 */
const compactTheme = EditorView.theme(
  {
    "&": {
      fontSize: "12px",
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      background: "transparent",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg, 8px)",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "var(--color-primary)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
    },
    ".cm-content": {
      caretColor: "#e6edf3",
      padding: "6px 0",
      color: "#e6edf3",
    },
    ".cm-gutters": {
      background: "transparent",
      border: "none",
      color: "#6b7280",
      paddingRight: "2px",
      minWidth: "28px",
    },
    ".cm-activeLineGutter": { background: "transparent" },
    ".cm-activeLine": { background: "rgba(255,255,255,0.04)" },
    ".cm-selectionBackground": {
      background: "rgba(99,135,255,0.25) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      background: "rgba(99,135,255,0.3) !important",
    },
    ".cm-cursor": { borderLeftColor: "#e6edf3" },
  },
  { dark: true },
);
