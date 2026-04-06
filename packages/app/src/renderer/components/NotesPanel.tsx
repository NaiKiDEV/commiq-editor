import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Plus, Trash2, FileText, Check, Loader2, Eye, Pencil, Search, X, Tag, Hash } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { cn } from '@/lib/utils';

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
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

// ── Lightweight Markdown → HTML ─────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let tableRows: string[] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const parseRow = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim());
    const headers = parseRow(tableRows[0]);
    // Determine alignment from separator row (row index 1)
    const aligns: ('left' | 'center' | 'right' | null)[] = headers.map(() => null);
    if (tableRows.length > 1) {
      const sepCells = parseRow(tableRows[1]);
      sepCells.forEach((cell, i) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) aligns[i] = 'center';
        else if (right) aligns[i] = 'right';
        else if (left) aligns[i] = 'left';
      });
    }
    const alignAttr = (i: number) => aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
    let t = '<table class="my-2 w-full text-sm border-collapse">';
    t += '<thead><tr class="border-b border-border">';
    headers.forEach((h, i) => { t += `<th class="px-2 py-1 text-left font-semibold text-muted-foreground"${alignAttr(i)}>${inline(h)}</th>`; });
    t += '</tr></thead><tbody>';
    const dataRows = tableRows.slice(2); // skip header + separator
    dataRows.forEach((row) => {
      const cells = parseRow(row);
      t += '<tr class="border-b border-border/50">';
      headers.forEach((_, i) => { t += `<td class="px-2 py-1"${alignAttr(i)}>${inline(cells[i] ?? '')}</td>`; });
      t += '</tr>';
    });
    t += '</tbody></table>';
    html.push(t);
    tableRows = [];
  };

  const flushList = () => {
    if (inList) { html.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null; }
  };

  const flushAll = () => { flushList(); flushTable(); };

  const inline = (text: string): string => {
    let result = escapeHtml(text);
    // Code spans (before other inline formatting)
    result = result.replace(/`([^`]+)`/g, '<code class="bg-muted/50 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');
    // Bold + italic
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Strikethrough
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Links
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline" target="_blank" rel="noopener">$1</a>');
    // Auto-links
    result = result.replace(/(^|[^"=])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" class="text-primary underline" target="_blank" rel="noopener">$2</a>');
    return result;
  };

  for (const line of lines) {
    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const langBadge = codeLang ? `<span class="absolute top-1.5 right-2 text-[10px] text-muted-foreground/40 uppercase select-none">${escapeHtml(codeLang)}</span>` : '';
        html.push(`<pre class="relative bg-muted/30 border border-border/50 rounded-lg p-3 my-2 overflow-x-auto font-mono text-xs leading-relaxed">${langBadge}<code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
      } else {
        flushAll();
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) { codeLines.push(line); continue; }

    // Blank line
    if (!line.trim()) { flushAll(); html.push(''); continue; }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      const sizes = ['text-xl font-bold', 'text-lg font-bold', 'text-base font-semibold', 'text-sm font-semibold', 'text-sm font-medium', 'text-xs font-medium'];
      html.push(`<h${level} class="${sizes[level - 1]} mt-4 mb-1">${inline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushAll();
      html.push('<hr class="border-border my-3" />');
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushAll();
      html.push(`<blockquote class="border-l-2 border-primary/40 pl-3 my-1 text-muted-foreground italic">${inline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      if (inList !== 'ul') { flushAll(); html.push('<ul class="list-disc list-inside space-y-0.5 my-1 ml-2">'); inList = 'ul'; }
      html.push(`<li>${inline(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      if (inList !== 'ol') { flushAll(); html.push('<ol class="list-decimal list-inside space-y-0.5 my-1 ml-2">'); inList = 'ol'; }
      html.push(`<li>${inline(olMatch[2])}</li>`);
      continue;
    }

    // Checkbox
    const cbMatch = line.match(/^- \[([ xX])\]\s+(.+)/);
    if (cbMatch) {
      flushAll();
      const checked = cbMatch[1] !== ' ';
      html.push(`<div class="flex items-center gap-2 my-0.5"><input type="checkbox" ${checked ? 'checked' : ''} disabled class="accent-primary" /><span${checked ? ' class="line-through text-muted-foreground"' : ''}>${inline(cbMatch[2])}</span></div>`);
      continue;
    }

    // Table rows (lines that start and end with |)
    if (line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')) {
      flushList();
      tableRows.push(line);
      continue;
    }

    // Paragraph
    flushAll();
    html.push(`<p class="my-1">${inline(line)}</p>`);
  }

  flushAll();
  if (inCodeBlock) {
    const langBadge = codeLang ? `<span class="absolute top-1.5 right-2 text-[10px] text-muted-foreground/40 uppercase select-none">${escapeHtml(codeLang)}</span>` : '';
    html.push(`<pre class="relative bg-muted/30 border border-border/50 rounded-lg p-3 my-2 overflow-x-auto font-mono text-xs leading-relaxed">${langBadge}<code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  return html.join('\n');
}

// ── Component ───────────────────────────────────────────────────────────────

export function NotesPanel({ panelId: _panelId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [previewMode, setPreviewMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const n of notes) for (const t of (n.tags ?? [])) tagSet.add(t);
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter notes by search + active tag
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
    return filtered;
  }, [notes, searchQuery, activeTag]);

  // Rendered markdown (memoized)
  const renderedHtml = useMemo(
    () => activeNote ? renderMarkdown(activeNote.content) : '',
    [activeNote?.content],
  );

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

  const updateNote = useCallback((id: string, data: { title?: string; content?: string; tags?: string[] }) => {
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

  const addTag = useCallback((noteId: string, tag: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || (note.tags ?? []).includes(trimmed)) return;
    const newTags = [...(note.tags ?? []), trimmed];
    updateNote(noteId, { tags: newTags });
  }, [notes, updateNote]);

  const removeTag = useCallback((noteId: string, tag: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const newTags = (note.tags ?? []).filter((t) => t !== tag);
    updateNote(noteId, { tags: newTags });
    // If the removed tag was the active filter and no notes have it anymore, clear filter
    if (activeTag === tag && !notes.some((n) => n.id !== noteId && (n.tags ?? []).includes(tag))) {
      setActiveTag(null);
    }
  }, [notes, updateNote, activeTag]);

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
              {(searchQuery || activeTag) && (
                <button
                  className="text-[10px] text-primary hover:underline mt-1"
                  onClick={() => { setSearchQuery(''); setActiveTag(null); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          {filteredNotes.map((note) => (
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
            </button>
          ))}
        </div>
      </div>

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
                placeholder="Note title..."
                className="flex-1 border-transparent bg-transparent focus-visible:border-transparent focus-visible:ring-0 px-0 h-7 text-sm font-medium"
              />
              <div className="flex items-center gap-1.5">
                {saveState === 'saving' && (
                  <Loader2 className="size-3 text-muted-foreground/50 animate-spin" />
                )}
                {saveState === 'saved' && (
                  <Check className="size-3 text-muted-foreground/50" />
                )}
                {/* Preview / Edit toggle */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setPreviewMode(false)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 text-[10px] transition-colors',
                      !previewMode ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Edit"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    onClick={() => setPreviewMode(true)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 text-[10px] border-l border-border transition-colors',
                      previewMode ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Preview Markdown"
                  >
                    <Eye className="size-3" />
                  </button>
                </div>
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

            {/* Tags bar */}
            <div className="flex items-center gap-1.5 px-4 py-1 border-b border-border min-h-7">
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

            {/* Editor or Preview */}
            {previewMode ? (
              <div
                className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed prose-sm"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <Textarea
                ref={textareaRef}
                value={activeNote.content}
                onChange={(e) => updateNote(activeNote.id, { content: e.target.value })}
                placeholder="Start writing… (Markdown supported)"
                className="flex-1 resize-none border-0 rounded-none px-4 py-3 text-sm leading-relaxed focus-visible:ring-0 min-h-0 font-mono"
              />
            )}
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
