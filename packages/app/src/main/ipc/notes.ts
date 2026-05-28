import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

function getNotesPath(): string {
  return path.join(app.getPath('userData'), 'notes.json');
}

function readNotes(): Note[] {
  try {
    const data = fs.readFileSync(getNotesPath(), 'utf-8');
    const notes: Note[] = JSON.parse(data);
    // Backfill fields added after a note was first written (legacy notes).
    for (const n of notes) {
      if (!n.tags) n.tags = [];
      if (typeof n.pinned !== 'boolean') n.pinned = false;
    }
    return notes;
  } catch {
    return [];
  }
}

function writeNotes(notes: Note[]): void {
  fs.writeFileSync(getNotesPath(), JSON.stringify(notes, null, 2));
}

export function registerNotesIpc(): void {
  ipcMain.handle('notes:list', () => {
    return readNotes();
  });

  ipcMain.handle('notes:create', (_event, title: string) => {
    const notes = readNotes();
    const note: Note = {
      id: crypto.randomUUID(),
      title,
      content: '',
      tags: [],
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    notes.unshift(note);
    writeNotes(notes);
    return note;
  });

  ipcMain.handle('notes:update', (_event, id: string, data: { title?: string; content?: string; tags?: string[]; pinned?: boolean }) => {
    const notes = readNotes();
    const note = notes.find((n) => n.id === id);
    if (!note) return null;
    if (data.title !== undefined) note.title = data.title;
    if (data.content !== undefined) note.content = data.content;
    if (data.tags !== undefined) note.tags = data.tags;
    if (data.pinned !== undefined) note.pinned = data.pinned;
    // Ensure fields exist for legacy notes
    if (!note.tags) note.tags = [];
    note.updatedAt = new Date().toISOString();
    writeNotes(notes);
    return note;
  });

  ipcMain.handle('notes:duplicate', (_event, id: string) => {
    const notes = readNotes();
    const source = notes.find((n) => n.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const copy: Note = {
      id: crypto.randomUUID(),
      title: source.title ? `${source.title} (copy)` : '',
      content: source.content,
      tags: [...(source.tags ?? [])],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    const index = notes.findIndex((n) => n.id === id);
    notes.splice(index + 1, 0, copy);
    writeNotes(notes);
    return copy;
  });

  ipcMain.handle('notes:delete', (_event, id: string) => {
    const notes = readNotes().filter((n) => n.id !== id);
    writeNotes(notes);
  });
}
