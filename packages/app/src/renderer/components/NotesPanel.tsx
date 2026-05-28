import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, FileText, Check, Loader2, Eye, Pencil, Columns2, Search, X, Tag, Hash,
  Pin, PinOff, Copy, Download, MoreVertical, ArrowDownNarrowWide, ClipboardCopy,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from './ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { useSettings } from '../contexts/settings';
import { cn } from '@/lib/utils';
import { renderMarkdown } from './notes/markdown';
import { MarkdownToolbar, transformSelection, type MarkdownAction } from './notes/MarkdownToolbar';
import { useEditorHistory } from './notes/useEditorHistory';
import {
  type Note, type SortMode, SORT_LABELS, relativeTime, countWords, readingTime,
  deriveTitle, excerpt, sortNotes, usePersistentState,
} from './notes/utils';

type SaveState = 'saved' | 'saving' | 'idle';
type ViewMode = 'edit' | 'split' | 'preview';

type NotesPanelProps = {
  panelId: string;
};

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;
const SIDEBAR_DEFAULT = 224;

// Ctrl/Cmd+K is reserved by the app (command palette), so it is intentionally
// not bound here.
const SHORTCUT_KEYS: Record<string, MarkdownAction> = {
  b: 'bold',
  i: 'italic',
};

export function NotesPanel({ panelId: _panelId }: NotesPanelProps) {
  const { settings } = useSettings();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [copied, setCopied] = useState(false);

  const [viewMode, setViewMode] = usePersistentState<ViewMode>('notes.viewMode', 'edit');
  const [sortMode, setSortMode] = usePersistentState<SortMode>('notes.sortMode', 'updated');
  const [sidebarWidth, setSidebarWidth] = usePersistentState<number>('notes.sidebarWidth', SIDEBAR_DEFAULT);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const history = useEditorHistory();
  // Last known caret/selection in the editor — kept current so toolbar actions
  // target the right spot even after a misclick blurs the textarea.
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const trackSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) selectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
  }, []);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const n of notes) for (const t of (n.tags ?? [])) tagSet.add(t);
    return Array.from(tagSet).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let filtered = notes;
    if (activeTag) filtered = filtered.filter((n) => (n.tags ?? []).includes(activeTag));
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) => n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)
          || (n.tags ?? []).some((t) => t.toLowerCase().includes(lower)),
      );
    }
    return sortNotes(filtered, sortMode);
  }, [notes, searchQuery, activeTag, sortMode]);

  const renderedHtml = useMemo(
    () => activeNote ? renderMarkdown(activeNote.content) : '',
    [activeNote?.content],
  );

  useEffect(() => {
    window.electronAPI.notes.list()
      .then((list) => {
        setNotes(list as Note[]);
        if (list.length > 0) setActiveNoteId(list[0].id);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Seed the undo baseline for whichever note is open.
  useEffect(() => {
    if (activeNote) history.ensure(activeNote.id, activeNote.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  // --- Sidebar resize ---
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizing.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, e.clientX - rect.left));
      setSidebarWidth(next);
    };
    const onUp = () => {
      resizing.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setSidebarWidth]);

  const createNote = useCallback(async () => {
    const note = await window.electronAPI.notes.create('');
    setNotes((prev) => [note as Note, ...prev]);
    setActiveNoteId(note.id);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 50);
  }, []);

  const performDelete = useCallback(async (id: string) => {
    await window.electronAPI.notes.delete(id);
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (id === activeNoteId) setActiveNoteId(next[0]?.id ?? null);
      return next;
    });
  }, [activeNoteId]);

  const duplicateNote = useCallback(async (id: string) => {
    const copy = await window.electronAPI.notes.duplicate(id);
    if (!copy) return;
    setNotes((prev) => {
      const index = prev.findIndex((n) => n.id === id);
      const next = [...prev];
      next.splice(index + 1, 0, copy as Note);
      return next;
    });
    setActiveNoteId(copy.id);
  }, []);

  const updateNote = useCallback((id: string, data: { title?: string; content?: string; tags?: string[]; pinned?: boolean }) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...data, updatedAt: new Date().toISOString() } : n)),
    );
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await window.electronAPI.notes.update(id, data);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    }, 400);
  }, []);

  // All content edits flow through here so they land in the undo history.
  const editContent = useCallback((id: string, content: string) => {
    history.record(id, content);
    updateNote(id, { content });
  }, [history, updateNote]);

  const togglePin = useCallback((note: Note) => {
    updateNote(note.id, { pinned: !note.pinned });
  }, [updateNote]);

  const addTag = useCallback((noteId: string, tag: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || (note.tags ?? []).includes(trimmed)) return;
    updateNote(noteId, { tags: [...(note.tags ?? []), trimmed] });
  }, [notes, updateNote]);

  const removeTag = useCallback((noteId: string, tag: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    updateNote(noteId, { tags: (note.tags ?? []).filter((t) => t !== tag) });
    if (activeTag === tag && !notes.some((n) => n.id !== noteId && (n.tags ?? []).includes(tag))) {
      setActiveTag(null);
    }
  }, [notes, updateNote, activeTag]);

  const copyMarkdown = useCallback(async () => {
    if (!activeNote) return;
    await navigator.clipboard.writeText(activeNote.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [activeNote]);

  const exportMarkdown = useCallback(() => {
    if (!activeNote) return;
    const name = (deriveTitle(activeNote) || 'note').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'note';
    const blob = new Blob([activeNote.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeNote]);

  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    e.preventDefault();
    if (href && /^(https?:|mailto:)/i.test(href)) {
      window.electronAPI.openExternal(href);
    }
  }, []);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeNote) return;
    const ta = e.currentTarget;

    // Tab indents instead of leaving the editor (Shift+Tab outdents).
    if (e.key === 'Tab') {
      e.preventDefault();
      const indent = '  ';
      const { selectionStart: s, selectionEnd: en, value } = ta;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      if (e.shiftKey) {
        const lineEnd = value.indexOf('\n', en);
        const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
        const block = value.slice(lineStart, sliceEnd);
        const outdented = block.split('\n').map((l) => l.replace(/^ {1,2}|^\t/, '')).join('\n');
        const removed = block.length - outdented.length;
        const next = value.slice(0, lineStart) + outdented + value.slice(sliceEnd);
        editContent(activeNote.id, next);
        const caret = Math.max(lineStart, s - Math.min(removed, s - lineStart));
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, Math.max(caret, en - removed)); trackSelection(); });
      } else if (s === en) {
        const next = value.slice(0, s) + indent + value.slice(en);
        editContent(activeNote.id, next);
        const caret = s + indent.length;
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); trackSelection(); });
      } else {
        // Indent every line spanned by the selection.
        const lineEnd = value.indexOf('\n', en);
        const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
        const block = value.slice(lineStart, sliceEnd);
        const indented = block.split('\n').map((l) => indent + l).join('\n');
        const next = value.slice(0, lineStart) + indented + value.slice(sliceEnd);
        editContent(activeNote.id, next);
        const added = indented.length - block.length;
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + indent.length, en + added); trackSelection(); });
      }
      return;
    }

    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();

    // Undo / redo against the custom history stack (native undo is dead on a
    // controlled textarea). Ctrl+Z / Ctrl+Shift+Z, plus Ctrl+Y for redo.
    if (key === 'z' || key === 'y') {
      const redo = key === 'y' || (key === 'z' && e.shiftKey);
      const next = redo ? history.redo(activeNote.id) : history.undo(activeNote.id);
      if (next === null) return; // nothing to do — let the event pass
      e.preventDefault();
      updateNote(activeNote.id, { content: next });
      requestAnimationFrame(() => {
        ta.focus();
        const pos = Math.min(ta.selectionStart, next.length);
        ta.setSelectionRange(pos, pos);
        trackSelection();
      });
      return;
    }

    const action = SHORTCUT_KEYS[key];
    if (!action) return;
    e.preventDefault();
    const result = transformSelection(ta.value, ta.selectionStart, ta.selectionEnd, action);
    editContent(activeNote.id, result.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.selStart, result.selEnd);
      trackSelection();
    });
  }, [activeNote, history, updateNote, editContent, trackSelection]);

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

  const wordCount = activeNote ? countWords(activeNote.content) : 0;
  const charCount = activeNote ? activeNote.content.length : 0;
  const showEditor = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  const editorTextarea = (
    <Textarea
      ref={textareaRef}
      value={activeNote?.content ?? ''}
      onChange={(e) => { if (activeNote) { editContent(activeNote.id, e.target.value); trackSelection(); } }}
      onKeyDown={handleEditorKeyDown}
      onKeyUp={trackSelection}
      onSelect={trackSelection}
      onClick={trackSelection}
      placeholder="Start writing… (Markdown supported)"
      spellCheck={settings.notes.spellcheck}
      wrap={settings.notes.wordWrap ? 'soft' : 'off'}
      style={{ fontSize: `${settings.notes.fontSize}px` }}
      className={cn(
        'flex-1 resize-none border-0 rounded-none px-4 py-3 leading-relaxed focus-visible:ring-0 min-h-0 font-mono',
        !settings.notes.wordWrap && 'whitespace-pre overflow-x-auto',
      )}
    />
  );

  const previewPane = (
    <div
      className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed"
      onClick={handlePreviewClick}
      dangerouslySetInnerHTML={{ __html: renderedHtml || '<p class="text-muted-foreground italic">Nothing to preview yet.</p>' }}
    />
  );

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Sidebar */}
      <div className="shrink-0 border-r border-border bg-card flex flex-col" style={{ width: sidebarWidth }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Notes
            <span className="ml-1.5 text-muted-foreground/40 normal-case tracking-normal">{notes.length}</span>
          </span>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" size="icon-xs" title="Sort notes" />
              }>
                <ArrowDownNarrowWide className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                  <DropdownMenuItem key={mode} onClick={() => setSortMode(mode)}>
                    <span className={cn('flex-1', sortMode === mode && 'font-medium text-foreground')}>{SORT_LABELS[mode]}</span>
                    {sortMode === mode && <Check className="size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-xs" onClick={createNote} title="New note (Ctrl+N)">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 py-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full bg-muted/30 border border-border/50 rounded text-xs pl-7 pr-6 py-1 placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30"
            />
            {searchQuery && (
              <button
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery('')}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="px-2 py-1.5 border-b border-border flex flex-wrap gap-1">
            <button
              onClick={() => setActiveTag(null)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] transition-colors',
                !activeTag ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-muted-foreground hover:text-foreground',
              )}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                  activeTag === tag ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-muted-foreground hover:text-foreground',
                )}
              >
                <Hash className="size-2.5" />
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 && !searchQuery && !activeTag && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">No notes yet</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">Ctrl+N to create</p>
            </div>
          )}
          {filteredNotes.length === 0 && (searchQuery || activeTag) && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">No matching notes</p>
              <button
                className="text-[10px] text-primary hover:underline mt-1"
                onClick={() => { setSearchQuery(''); setActiveTag(null); }}
              >
                Clear filters
              </button>
            </div>
          )}
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveNoteId(note.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') setActiveNoteId(note.id); }}
              className={cn(
                'group relative w-full flex items-start gap-2 px-3 py-2 text-left cursor-pointer border-l-2 transition-colors',
                note.id === activeNoteId
                  ? 'bg-muted text-foreground border-l-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-l-transparent',
              )}
            >
              {note.pinned
                ? <Pin className="size-3.5 mt-0.5 shrink-0 text-primary fill-primary/20" />
                : <FileText className="size-3.5 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1 pr-12">
                <p className="text-xs font-medium truncate">{deriveTitle(note)}</p>
                <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                  {excerpt(note.content) || 'Empty note'}
                </p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">{relativeTime(note.updatedAt)}</p>
                {(note.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {note.tags.map((tag) => (
                      <span key={tag} className="text-[9px] bg-primary/10 text-primary/70 px-1 py-px rounded">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="absolute right-1 top-1.5 flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(note); }}
                  title={note.pinned ? 'Unpin' : 'Pin'}
                  className={cn(
                    'rounded p-1 hover:bg-background/80 transition-opacity',
                    note.pinned ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(note); }}
                  title="Delete note"
                  className="rounded p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-background/80 hover:text-destructive transition-opacity"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
        onPointerDown={(e) => {
          e.preventDefault();
          resizing.current = true;
          document.body.style.cursor = 'col-resize';
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
      />

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border">
              <Input
                ref={titleInputRef}
                type="text"
                value={activeNote.title}
                onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                placeholder="Note title…"
                className="flex-1 border-transparent bg-transparent focus-visible:border-transparent focus-visible:ring-0 px-0 h-7 text-sm font-medium"
              />
              <div className="flex items-center gap-1.5">
                {saveState === 'saving' && <Loader2 className="size-3 text-muted-foreground/50 animate-spin" />}
                {saveState === 'saved' && <Check className="size-3 text-muted-foreground/50" />}

                {/* View mode toggle */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  {([
                    { mode: 'edit' as const, icon: Pencil, title: 'Edit' },
                    { mode: 'split' as const, icon: Columns2, title: 'Split' },
                    { mode: 'preview' as const, icon: Eye, title: 'Preview' },
                  ]).map(({ mode, icon: Icon, title }, i) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      title={title}
                      className={cn(
                        'flex items-center px-2 py-0.5 text-[10px] transition-colors',
                        i > 0 && 'border-l border-border',
                        viewMode === mode ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="size-3" />
                    </button>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => togglePin(activeNote)}
                  title={activeNote.pinned ? 'Unpin' : 'Pin'}
                  className={cn(activeNote.pinned && 'text-primary')}
                >
                  {activeNote.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="ghost" size="icon-xs" title="More" />
                  }>
                    <MoreVertical className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={copyMarkdown}>
                      {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
                      {copied ? 'Copied' : 'Copy as Markdown'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportMarkdown}>
                      <Download className="size-3.5" />
                      Export as .md
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateNote(activeNote.id)}>
                      <Copy className="size-3.5" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(activeNote)}>
                      <Trash2 className="size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Tags bar */}
            <div className="flex items-center gap-1.5 px-4 py-1 border-b border-border min-h-7 flex-wrap">
              <Tag className="size-3 text-muted-foreground/50 shrink-0" />
              {(activeNote.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded group"
                >
                  #{tag}
                  <button
                    onClick={() => removeTag(activeNote.id, tag)}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    addTag(activeNote.id, tagInput);
                    setTagInput('');
                  }
                  if (e.key === 'Backspace' && !tagInput && (activeNote.tags ?? []).length > 0) {
                    removeTag(activeNote.id, activeNote.tags[activeNote.tags.length - 1]);
                  }
                }}
                placeholder="Add tag…"
                className="flex-1 min-w-15 bg-transparent text-[10px] placeholder:text-muted-foreground/30 focus:outline-none"
              />
            </div>

            {/* Markdown toolbar (edit + split) */}
            {showEditor && (
              <MarkdownToolbar
                textareaRef={textareaRef}
                selectionRef={selectionRef}
                value={activeNote.content}
                onChange={(next) => editContent(activeNote.id, next)}
              />
            )}

            {/* Body */}
            <div className="flex-1 flex min-h-0">
              {showEditor && (
                <div className={cn('flex flex-col min-w-0', showPreview ? 'w-1/2 border-r border-border' : 'flex-1')}>
                  {editorTextarea}
                </div>
              )}
              {showPreview && (
                <div className={cn('flex flex-col min-w-0', showEditor ? 'w-1/2' : 'flex-1')}>
                  {previewPane}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-1 border-t border-border text-[10px] text-muted-foreground/50">
              <span>{wordCount} words · {readingTime(wordCount)} · {charCount} chars</span>
              <span>Edited {relativeTime(activeNote.updatedAt)}</span>
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

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete note?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              “{deleteTarget ? deriveTitle(deleteTarget) : ''}” will be permanently deleted. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deleteTarget) performDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
