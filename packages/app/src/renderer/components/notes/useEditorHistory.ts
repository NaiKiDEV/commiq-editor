import { useCallback, useRef } from 'react';

// A controlled <textarea> (value driven by React state) loses the browser's
// native undo buffer, so Ctrl+Z does nothing. This hook keeps a per-note
// snapshot stack so undo/redo work against the note content directly.

type Entry = { stack: string[]; index: number; lastPushAt: number };

const COALESCE_MS = 500;
const MAX_ENTRIES = 200;

export function useEditorHistory() {
  const map = useRef<Record<string, Entry>>({});

  /** Seed the baseline snapshot the first time a note is opened. */
  const ensure = useCallback((id: string, content: string) => {
    if (!map.current[id]) {
      map.current[id] = { stack: [content], index: 0, lastPushAt: 0 };
    }
  }, []);

  /** Record an edit, coalescing rapid keystrokes into one undo step. */
  const record = useCallback((id: string, content: string) => {
    const h = map.current[id];
    if (!h) {
      map.current[id] = { stack: [content], index: 0, lastPushAt: Date.now() };
      return;
    }
    if (h.stack[h.index] === content) return;
    const now = Date.now();
    // Discard any redo branch once a fresh edit lands.
    if (h.index < h.stack.length - 1) h.stack = h.stack.slice(0, h.index + 1);
    // Coalesce — but never collapse into the baseline (index 0) so the
    // original content always remains reachable.
    if (now - h.lastPushAt < COALESCE_MS && h.index > 0) {
      h.stack[h.index] = content;
    } else {
      h.stack.push(content);
      h.index = h.stack.length - 1;
      if (h.stack.length > MAX_ENTRIES) {
        h.stack.shift();
        h.index--;
      }
    }
    h.lastPushAt = now;
  }, []);

  const undo = useCallback((id: string): string | null => {
    const h = map.current[id];
    if (!h || h.index <= 0) return null;
    h.index--;
    h.lastPushAt = 0; // force the next edit to start a new step
    return h.stack[h.index];
  }, []);

  const redo = useCallback((id: string): string | null => {
    const h = map.current[id];
    if (!h || h.index >= h.stack.length - 1) return null;
    h.index++;
    h.lastPushAt = 0;
    return h.stack[h.index];
  }, []);

  return { ensure, record, undo, redo };
}
