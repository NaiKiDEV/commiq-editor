import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

function getNotesPath(): string {
  return path.join(app.getPath('userData'), 'notes.json');
}

function readNotes(): Note[] {
  try {
    const data = fs.readFileSync(getNotesPath(), 'utf-8');
    return JSON.parse(data);
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    notes.unshift(note);
    writeNotes(notes);
    return note;
  });

  ipcMain.handle('notes:update', (_event, id: string, data: { title?: string; content?: string }) => {
    const notes = readNotes();
    const note = notes.find((n) => n.id === id);
    if (!note) return null;
    if (data.title !== undefined) note.title = data.title;
    if (data.content !== undefined) note.content = data.content;
    note.updatedAt = new Date().toISOString();
    writeNotes(notes);
    return note;
  });

  ipcMain.handle('notes:delete', (_event, id: string) => {
    const notes = readNotes().filter((n) => n.id !== id);
    writeNotes(notes);
  });
}
