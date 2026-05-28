import { useCallback, useState } from 'react';

export type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SortMode = 'updated' | 'created' | 'title';

export const SORT_LABELS: Record<SortMode, string> = {
  updated: 'Last updated',
  created: 'Date created',
  title: 'Title (A–Z)',
};

const WORDS_PER_MINUTE = 200;

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function readingTime(wordCount: number): string {
  if (wordCount === 0) return '0 min read';
  const minutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

/**
 * Derive a human-friendly title for a note that has no explicit title:
 * first markdown heading, else first non-empty line, else "Untitled".
 */
export function deriveTitle(note: Pick<Note, 'title' | 'content'>): string {
  if (note.title.trim()) return note.title;
  for (const raw of note.content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.+)/);
    return (heading ? heading[1] : line).slice(0, 80);
  }
  return 'Untitled';
}

/** Short, plain-text excerpt for the sidebar preview line (strips markdown noise). */
export function excerpt(content: string, max = 60): string {
  const cleaned = content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~]/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
  return cleaned.slice(0, max);
}

export function sortNotes(notes: Note[], mode: SortMode): Note[] {
  const byMode = (a: Note, b: Note): number => {
    switch (mode) {
      case 'title':
        return deriveTitle(a).localeCompare(deriveTitle(b), undefined, { sensitivity: 'base' });
      case 'created':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'updated':
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  };
  // Pinned notes always float to the top, sorted among themselves by the active mode.
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return byMode(a, b);
  });
}

/** Tiny localStorage-backed state for view preferences (not synced via IPC). */
export function usePersistentState<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore quota / serialization failures — preference is best-effort.
      }
    },
    [key],
  );

  return [value, set];
}
