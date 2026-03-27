import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { tags } from '@lezer/highlight';
import type { DataFormat } from './detect';

export const appHighlightStyle = HighlightStyle.define([
  { tag: tags.string,                     color: '#e09e5a' },
  { tag: tags.number,                     color: '#7ec986' },
  { tag: [tags.bool, tags.null],          color: '#79b8ff' },
  { tag: tags.keyword,                    color: '#79b8ff' },
  { tag: [tags.propertyName, tags.variableName], color: '#9ecbff' },
  { tag: tags.comment,                    color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.atom,                       color: '#79b8ff' },
  { tag: [tags.bracket, tags.punctuation], color: '#8b949e' },
  { tag: tags.typeName,                   color: '#b392f0' },
  { tag: tags.definition(tags.variableName), color: '#9ecbff' },
  { tag: tags.className,                  color: '#b392f0' },
]);

function getLanguageExtension(format: DataFormat) {
  if (format === 'json') return json();
  if (format === 'yaml') return yaml();
  if (format === 'toml') return StreamLanguage.define(toml);
  return [];
}

export const appTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    background: 'transparent',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-content': { caretColor: '#e6edf3', padding: '12px 0', color: '#e6edf3' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    paddingRight: '4px',
  },
  '.cm-activeLineGutter': { background: 'transparent' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.04)' },
  '.cm-selectionBackground': { background: 'rgba(99,135,255,0.25) !important' },
  '&.cm-focused .cm-selectionBackground': { background: 'rgba(99,135,255,0.3) !important' },
  '.cm-cursor': { borderLeftColor: '#e6edf3' },
  '.cm-focused': { outline: 'none' },
}, { dark: true });

type DataEditorProps = {
  value: string;
  format: DataFormat;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

export function DataEditor({ value, format, onChange, readOnly = false }: DataEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  const langCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          history(),
          lineNumbers(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          langCompartment.current.of(getLanguageExtension(format)),
          syntaxHighlighting(appHighlightStyle),
          appTheme,
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
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

  // Sync external value changes (prettify / convert)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === valueRef.current) return;
    valueRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  // Swap language via Compartment
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(getLanguageExtension(format)),
    });
  }, [format]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
