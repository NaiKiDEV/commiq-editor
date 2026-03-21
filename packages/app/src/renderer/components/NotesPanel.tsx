import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Trash2, FileText, Check, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type SaveState = 'saved' | 'saving' | 'idle';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type NotesPanelProps = {
  panelId: string;
};

export function NotesPanel({ panelId: _panelId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  // Load notes on mount
  useEffect(() => {
    window.electronAPI.notes.list().then((list) => {
      setNotes(list);
      if (list.length > 0) setActiveNoteId(list[0].id);
      setLoaded(true);
    });
  }, []);

  const createNote = useCallback(async () => {
    const note = await window.electronAPI.notes.create('Untitled');
    setNotes((prev) => [note, ...prev]);
    setActiveNoteId(note.id);
    // Focus title input after render
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 50);
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    await window.electronAPI.notes.delete(id);
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (id === activeNoteId) {
        setActiveNoteId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [activeNoteId]);

  const updateNote = useCallback((id: string, data: { title?: string; content?: string }) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...data, updatedAt: new Date().toISOString() } : n)),
    );

    setSaveState('saving');

    // Debounced save to disk
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await window.electronAPI.notes.update(id, data);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    }, 400);
  }, []);

  // Ctrl+N to create note when panel is focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        createNote();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createNote]);

  if (!loaded) return null;

  const wordCount = activeNote
    ? activeNote.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const charCount = activeNote ? activeNote.content.length : 0;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-52 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</span>
          <Button variant="ghost" size="icon-xs" onClick={createNote}>
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notes.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">No notes yet</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">Ctrl+N to create</p>
            </div>
          )}
          {notes.map((note) => (
            <button
              key={note.id}
              className={cn(
                'w-full flex items-start gap-2 px-3 py-2 text-left transition-colors',
                note.id === activeNoteId
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              onClick={() => setActiveNoteId(note.id)}
            >
              <FileText className="size-3.5 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">
                  {note.title || 'Untitled'}
                </p>
                <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                  {note.content.slice(0, 40) || 'Empty note'}
                </p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                  {relativeTime(note.updatedAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
              <input
                ref={titleInputRef}
                type="text"
                value={activeNote.title}
                onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                placeholder="Note title..."
                className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center gap-1.5">
                {saveState === 'saving' && (
                  <Loader2 className="size-3 text-muted-foreground/50 animate-spin" />
                )}
                {saveState === 'saved' && (
                  <Check className="size-3 text-muted-foreground/50" />
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => deleteNote(activeNote.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={activeNote.content}
              onChange={(e) => updateNote(activeNote.id, { content: e.target.value })}
              placeholder="Start writing..."
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground leading-relaxed"
            />
            {/* Editor footer */}
            <div className="flex items-center justify-between px-4 py-1 border-t border-border text-[10px] text-muted-foreground/50">
              <span>{wordCount} words, {charCount} chars</span>
              <span>{relativeTime(activeNote.updatedAt)}</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <FileText className="size-8 mx-auto opacity-40" />
              <p className="text-sm">Create a note to get started</p>
              <Button variant="outline" size="sm" onClick={createNote}>
                <Plus className="size-3.5" />
                New Note
              </Button>
              <p className="text-[10px] text-muted-foreground/50">or press Ctrl+N</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
