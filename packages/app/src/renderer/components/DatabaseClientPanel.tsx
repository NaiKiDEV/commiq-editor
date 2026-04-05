import { useEffect, useState, useCallback, useRef, memo } from 'react';
import {
  Plus, Trash2, Play, Database, Table2, ChevronRight, ChevronDown,
  Plug, Unplug, Loader2, History, KeyRound, Copy, Check, X,
  Hash, Link2, Search,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription,
} from './ui/dialog';
import { cn } from '@/lib/utils';

// CodeMirror
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { sql, PostgreSQL, MySQL, SQLite } from '@codemirror/lang-sql';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DbDriver = 'sqlite' | 'postgresql' | 'mysql';

type DbConnectionProfile = {
  id: string;
  name: string;
  driver: DbDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

type DbTableIndex = {
  name: string;
  unique: boolean;
  columns: string[];
};

type DbTableForeignKey = {
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
};

type DbTable = {
  name: string;
  schema: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue: string | null;
  }>;
  indexes: DbTableIndex[];
  foreignKeys: DbTableForeignKey[];
};

type DbQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  affectedRows: number;
  duration: number;
};

type HistoryEntry = { id: string; connectionId: string; query: string; timestamp: number };

type QueryTab = {
  id: string;
  label: string;
  result: DbQueryResult | null;
  error: string | null;
  executing: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRIVER_LABELS: Record<DbDriver, string> = {
  sqlite: 'SQLite',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
};

const DRIVER_DEFAULTS: Record<DbDriver, { host: string; port: number }> = {
  sqlite: { host: '', port: 0 },
  postgresql: { host: 'localhost', port: 5432 },
  mysql: { host: 'localhost', port: 3306 },
};

const DRIVER_COLORS: Record<DbDriver, string> = {
  sqlite: 'text-info',
  postgresql: 'text-info',
  mysql: 'text-warning',
};

function emptyProfile(): DbConnectionProfile {
  return {
    id: crypto.randomUUID(),
    name: 'New Connection',
    driver: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
  };
}

function createQueryTab(n: number): QueryTab {
  return { id: crypto.randomUUID(), label: `Query ${n}`, result: null, error: null, executing: false };
}

// ---------------------------------------------------------------------------
// CodeMirror theme (reuses app color palette from DataEditor)
// ---------------------------------------------------------------------------

const highlightStyle = HighlightStyle.define([
  { tag: tags.string,                            color: '#e09e5a' },
  { tag: tags.number,                            color: '#7ec986' },
  { tag: [tags.bool, tags.null],                 color: '#79b8ff' },
  { tag: tags.keyword,                           color: '#79b8ff' },
  { tag: [tags.propertyName, tags.variableName], color: '#9ecbff' },
  { tag: tags.comment,                           color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.atom,                              color: '#79b8ff' },
  { tag: [tags.bracket, tags.punctuation],       color: '#8b949e' },
  { tag: tags.typeName,                          color: '#b392f0' },
  { tag: tags.operatorKeyword,                   color: '#79b8ff' },
  { tag: tags.operator,                          color: '#8b949e' },
]);

const cmTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    background: 'transparent',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-content': { caretColor: '#e6edf3', padding: '8px 0', color: '#e6edf3' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: '#6b7280', paddingRight: '4px' },
  '.cm-activeLineGutter': { background: 'transparent' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.04)' },
  '.cm-selectionBackground': { background: 'rgba(99,135,255,0.25) !important' },
  '&.cm-focused .cm-selectionBackground': { background: 'rgba(99,135,255,0.3) !important' },
  '.cm-cursor': { borderLeftColor: '#e6edf3' },
  '.cm-focused': { outline: 'none' },
  '.cm-tooltip': { background: '#1c2128', border: '1px solid #30363d', borderRadius: '6px' },
  '.cm-tooltip.cm-tooltip-autocomplete': { '& > ul': { fontFamily: 'inherit', fontSize: '12px', maxHeight: '200px' } },
  '.cm-tooltip-autocomplete ul li': { padding: '2px 8px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'rgba(99,135,255,0.2)', color: '#e6edf3' },
  '.cm-completionLabel': { color: '#e6edf3' },
  '.cm-completionDetail': { color: '#6b7280', fontStyle: 'italic', marginLeft: '8px' },
}, { dark: true });

function getSqlDialect(driver: DbDriver) {
  if (driver === 'postgresql') return PostgreSQL;
  if (driver === 'mysql') return MySQL;
  return SQLite;
}

// ---------------------------------------------------------------------------
// Results table (memoized rows)
// ---------------------------------------------------------------------------

const ResultRow = memo(function ResultRow({
  row,
  columns,
  rowIndex,
}: {
  row: Record<string, unknown>;
  columns: string[];
  rowIndex: number;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyCell = (col: string) => {
    const val = row[col];
    navigator.clipboard.writeText(val == null ? 'NULL' : String(val));
    setCopied(col);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <tr className={cn('border-b border-border/50 hover:bg-muted/30', rowIndex % 2 === 0 && 'bg-muted/10')}>
      <td className="px-2 py-1 text-muted-foreground text-right tabular-nums sticky left-0 bg-background/80 border-r border-border/50 z-10">
        {rowIndex + 1}
      </td>
      {columns.map((col) => {
        const val = row[col];
        const display = val === null ? 'NULL' : val === undefined ? '' : String(val);
        const isNull = val === null;
        return (
          <td key={col} className="px-2 py-1 whitespace-nowrap group relative cursor-default" title={display}>
            <span className={cn(isNull && 'italic text-muted-foreground/60')}>{display}</span>
            <button
              className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted"
              onClick={() => copyCell(col)}
            >
              {copied === col ? <Check className="size-3 text-success" /> : <Copy className="size-3 text-muted-foreground" />}
            </button>
          </td>
        );
      })}
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Connection form dialog
// ---------------------------------------------------------------------------

function ConnectionDialog({
  open,
  onOpenChange,
  profile,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: DbConnectionProfile;
  onSave: (profile: DbConnectionProfile) => void;
}) {
  const [form, setForm] = useState(profile);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    setForm(profile);
    setTestResult(null);
  }, [profile, open]);

  const handleDriverChange = (driver: string) => {
    const d = driver as DbDriver;
    const defaults = DRIVER_DEFAULTS[d];
    setForm((prev) => ({ ...prev, driver: d, host: defaults.host, port: defaults.port }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await window.electronAPI.db.test(form);
    if ('success' in result) {
      setTestResult(`Connected in ${result.duration}ms`);
    } else {
      setTestResult(`Error: ${result.error}`);
    }
    setTesting(false);
  };

  const handleSave = () => {
    onSave(form);
    onOpenChange(false);
  };

  const isSqlite = form.driver === 'sqlite';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{profile.name === 'New Connection' ? 'New Connection' : `Edit: ${profile.name}`}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Configure your database connection details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="w-36">
              <label className="text-xs text-muted-foreground mb-1 block">Driver</label>
              <Select value={form.driver} onValueChange={handleDriverChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgresql">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="sqlite">SQLite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isSqlite ? (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Database Path</label>
              <Input
                value={form.database}
                onChange={(e) => setForm((p) => ({ ...p, database: e.target.value }))}
                placeholder="/path/to/database.db"
              />
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Host</label>
                  <Input value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} placeholder="localhost" />
                </div>
                <div className="w-24">
                  <label className="text-xs text-muted-foreground mb-1 block">Port</label>
                  <Input type="number" value={form.port} onChange={(e) => setForm((p) => ({ ...p, port: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Database</label>
                <Input value={form.database} onChange={(e) => setForm((p) => ({ ...p, database: e.target.value }))} placeholder="mydb" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Username</label>
                  <Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} placeholder="user" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                  <Input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
                </div>
              </div>
            </>
          )}

          {testResult && (
            <div className={cn(
              'text-xs px-2 py-1.5 rounded border',
              testResult.startsWith('Error') ? 'text-destructive border-destructive/30 bg-destructive/10' : 'text-success border-success/30 bg-success/10',
            )}>
              {testResult}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="animate-spin" /> : <Plug className="size-3.5" />}
            Test
          </Button>
          <div className="flex-1" />
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

type DatabaseClientPanelProps = { panelId: string };

export function DatabaseClientPanel({ panelId: _panelId }: DatabaseClientPanelProps) {
  // --- Profiles ---
  const [profiles, setProfiles] = useState<DbConnectionProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string | null>(null);

  // --- Dialog ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DbConnectionProfile | null>(null);

  // --- Schema ---
  const [schema, setSchema] = useState<DbTable[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [loadingSchema, setLoadingSchema] = useState(false);

  // --- Query tabs ---
  const firstTab = useRef(createQueryTab(1));
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>([firstTab.current]);
  const [activeTabId, setActiveTabId] = useState(firstTab.current.id);
  const tabCounter = useRef(1);
  /** Stores editor content per tab id – avoids stale-closure issues */
  const tabQueriesRef = useRef<Record<string, string>>({ [firstTab.current.id]: '' });
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // --- History ---
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // --- Sidebar tab ---
  const [sidebarTab, setSidebarTab] = useState<'connections' | 'schema'>('connections');
  const [schemaSearch, setSchemaSearch] = useState('');

  // --- Editor ref ---
  const editorRef = useRef<{ getQuery: () => string; setQuery: (s: string) => void } | null>(null);
  const sqlEditorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const dialectCompartment = useRef(new Compartment());

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const activeTab = queryTabs.find((t) => t.id === activeTabId) ?? queryTabs[0];

  // Load profiles on mount
  useEffect(() => {
    window.electronAPI.db.profilesList().then((p) => setProfiles(p));
  }, []);

  // Connect
  const handleConnect = useCallback(async (profile: DbConnectionProfile) => {
    setConnecting(profile.id);
    const res = await window.electronAPI.db.connect(profile);
    if ('success' in res) {
      setConnectedIds((prev) => new Set(prev).add(profile.id));
      setActiveProfileId(profile.id);
      setSidebarTab('schema');
      // Load schema
      setLoadingSchema(true);
      const schemaRes = await window.electronAPI.db.schema(profile.id);
      if (!('error' in schemaRes)) {
        setSchema(schemaRes);
      }
      setLoadingSchema(false);
      // Load history
      const hist = await window.electronAPI.db.historyList(profile.id);
      setHistoryEntries(hist);
    } else {
      setQueryTabs((prev) =>
        prev.map((t) => (t.id === activeTabIdRef.current ? { ...t, error: res.error } : t)),
      );
    }
    setConnecting(null);
  }, []);

  // Disconnect
  const handleDisconnect = useCallback(async (profileId: string) => {
    await window.electronAPI.db.disconnect(profileId);
    setConnectedIds((prev) => {
      const next = new Set(prev);
      next.delete(profileId);
      return next;
    });
    if (activeProfileId === profileId) {
      setSchema([]);
      setQueryTabs((prev) => prev.map((t) => ({ ...t, result: null, error: null })));
      setSidebarTab('connections');
    }
  }, [activeProfileId]);

  // Save profile (create or update)
  const handleSaveProfile = useCallback(async (profile: DbConnectionProfile) => {
    await window.electronAPI.db.profilesSave(profile);
    setProfiles((prev) => {
      const idx = prev.findIndex((p) => p.id === profile.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = profile;
        return next;
      }
      return [...prev, profile];
    });
  }, []);

  // Delete profile
  const handleDeleteProfile = useCallback(async (id: string) => {
    await window.electronAPI.db.profilesDelete(id);
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    setConnectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeProfileId === id) {
      setActiveProfileId(null);
      setSchema([]);
      setQueryTabs((prev) => prev.map((t) => ({ ...t, result: null, error: null })));
    }
  }, [activeProfileId]);

  // Execute query — uses a ref so the editor keymap always calls the latest version
  const handleExecute = useCallback(async (sqlText: string) => {
    if (!activeProfileId || !sqlText.trim()) return;
    const tabId = activeTabIdRef.current;

    setQueryTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, executing: true, error: null, result: null } : t)),
    );

    const res = await window.electronAPI.db.query(activeProfileId, sqlText.trim());

    if ('error' in res) {
      setQueryTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, executing: false, error: res.error } : t)),
      );
    } else {
      setQueryTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, executing: false, result: res } : t)),
      );
      // Refresh schema if DDL detected
      if (/^\s*(CREATE|ALTER|DROP)\b/i.test(sqlText)) {
        const schemaRes = await window.electronAPI.db.schema(activeProfileId);
        if (!('error' in schemaRes)) setSchema(schemaRes);
      }
    }
    // Reload history
    const hist = await window.electronAPI.db.historyList(activeProfileId);
    setHistoryEntries(hist);
  }, [activeProfileId]);

  const handleExecuteRef = useRef(handleExecute);
  handleExecuteRef.current = handleExecute;

  // --------------- Tab management ---------------

  const switchTab = useCallback((tabId: string) => {
    if (tabId === activeTabIdRef.current) return;
    // Save current editor content
    tabQueriesRef.current[activeTabIdRef.current] = editorRef.current?.getQuery() ?? '';
    setActiveTabId(tabId);
    // Load new tab content immediately (imperative)
    editorRef.current?.setQuery(tabQueriesRef.current[tabId] ?? '');
  }, []);

  const addTab = useCallback(() => {
    // Save current editor content
    tabQueriesRef.current[activeTabIdRef.current] = editorRef.current?.getQuery() ?? '';
    tabCounter.current += 1;
    const tab = createQueryTab(tabCounter.current);
    tabQueriesRef.current[tab.id] = '';
    setQueryTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    editorRef.current?.setQuery('');
  }, []);

  const closeTab = useCallback((tabId: string) => {
    delete tabQueriesRef.current[tabId];
    setQueryTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) {
        tabCounter.current += 1;
        const fresh = createQueryTab(tabCounter.current);
        tabQueriesRef.current[fresh.id] = '';
        setActiveTabId(fresh.id);
        editorRef.current?.setQuery('');
        return [fresh];
      }
      if (activeTabIdRef.current === tabId) {
        const idx = prev.findIndex((t) => t.id === tabId);
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive.id);
        editorRef.current?.setQuery(tabQueriesRef.current[newActive.id] ?? '');
      }
      return next;
    });
  }, []);

  // Build editor (once)
  useEffect(() => {
    const container = sqlEditorContainerRef.current;
    if (!container) return;

    const driver = activeProfile?.driver ?? 'postgresql';
    const schemaObj: Record<string, string[]> = {};
    for (const t of schema) {
      const cols = t.columns.map((c) => c.name);
      schemaObj[t.name] = cols;
      // Also add schema-qualified name for multi-schema support
      if (t.schema && !(driver === 'sqlite' && t.schema === 'main')) {
        schemaObj[`${t.schema}.${t.name}`] = cols;
      }
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          lineNumbers(),
          keymap.of([
            {
              key: 'Ctrl-Enter',
              run: (v) => { handleExecuteRef.current(v.state.doc.toString()); return true; },
            },
            {
              key: 'Mod-Enter',
              run: (v) => { handleExecuteRef.current(v.state.doc.toString()); return true; },
            },
            indentWithTab,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          closeBrackets(),
          autocompletion({ defaultKeymap: true }),
          dialectCompartment.current.of(sql({ dialect: getSqlDialect(driver), schema: schemaObj, upperCaseKeywords: true })),
          syntaxHighlighting(highlightStyle),
          cmTheme,
          cmPlaceholder('Write your SQL query here... (Ctrl+Enter to execute)'),
          EditorView.lineWrapping,
        ],
      }),
      parent: container,
    });

    editorViewRef.current = view;
    editorRef.current = {
      getQuery: () => view.state.doc.toString(),
      setQuery: (text: string) => {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        view.focus();
      },
    };

    return () => {
      view.destroy();
      editorViewRef.current = null;
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update dialect + schema autocomplete when connection changes
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const driver = activeProfile?.driver ?? 'postgresql';
    const schemaObj: Record<string, string[]> = {};
    for (const t of schema) {
      const cols = t.columns.map((c) => c.name);
      schemaObj[t.name] = cols;
      if (t.schema && !(driver === 'sqlite' && t.schema === 'main')) {
        schemaObj[`${t.schema}.${t.name}`] = cols;
      }
    }
    view.dispatch({
      effects: dialectCompartment.current.reconfigure(
        sql({ dialect: getSqlDialect(driver), schema: schemaObj, upperCaseKeywords: true }),
      ),
    });
  }, [activeProfile?.driver, schema]);

  const toggleTable = (key: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSchema = (schemaName: string) => {
    setExpandedTables((prev) => {
      const key = `__schema__${schemaName}`;
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  /** Build a schema-qualified reference for use in SQL */
  const qualifiedName = (table: DbTable) => {
    const driver = activeProfile?.driver ?? 'postgresql';
    if (driver === 'sqlite' && table.schema === 'main') return table.name;
    return `${table.schema}.${table.name}`;
  };

  const insertTableQuery = (table: DbTable) => {
    const q = `SELECT * FROM ${qualifiedName(table)} LIMIT 100;`;
    tabQueriesRef.current[activeTabId] = q;
    editorRef.current?.setQuery(q);
  };

  /** Group tables by schema for the sidebar tree, filtered by search */
  const searchLower = schemaSearch.toLowerCase();
  const filteredSchema = searchLower
    ? schema.filter((t) => t.name.toLowerCase().includes(searchLower) || t.schema.toLowerCase().includes(searchLower))
    : schema;
  const schemaGroups = filteredSchema.reduce<Record<string, DbTable[]>>((acc, table) => {
    (acc[table.schema] ??= []).push(table);
    return acc;
  }, {});
  const schemaNames = Object.keys(schemaGroups).sort();

  const insertHistoryQuery = (query: string) => {
    tabQueriesRef.current[activeTabId] = query;
    editorRef.current?.setQuery(query);
    setShowHistory(false);
  };

  const isConnected = activeProfileId ? connectedIds.has(activeProfileId) : false;

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      <div className="flex h-full min-h-0">
        {/* -------- Sidebar -------- */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col">
          {/* Sidebar tabs */}
          <div className="flex border-b border-border text-xs">
            <button
              className={cn(
                'flex-1 py-1.5 text-center transition-colors',
                sidebarTab === 'connections' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setSidebarTab('connections')}
            >
              Connections
            </button>
            <button
              className={cn(
                'flex-1 py-1.5 text-center transition-colors',
                sidebarTab === 'schema' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setSidebarTab('schema')}
            >
              Schema
            </button>
          </div>

          {sidebarTab === 'connections' && (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connections</span>
                <Button variant="ghost" size="icon-xs" title="New Connection" onClick={() => {
                  setEditingProfile(emptyProfile());
                  setDialogOpen(true);
                }}>
                  <Plus />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto py-1">
                {profiles.map((p) => {
                  const connected = connectedIds.has(p.id);
                  const isActive = activeProfileId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/50',
                        isActive && 'bg-muted',
                      )}
                      onClick={() => {
                        if (connected) {
                          setActiveProfileId(p.id);
                          setSidebarTab('schema');
                          window.electronAPI.db.schema(p.id).then((res) => {
                            if (!('error' in res)) setSchema(res);
                          });
                        }
                      }}
                      onDoubleClick={() => {
                        if (!connected) handleConnect(p);
                      }}
                    >
                      <Database className={cn('size-3.5 shrink-0', connected ? DRIVER_COLORS[p.driver] : 'text-muted-foreground/50')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs truncate">{p.name}</span>
                          {connected && <span className="size-1.5 rounded-full bg-success shrink-0" />}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate block">
                          {DRIVER_LABELS[p.driver]}{p.driver !== 'sqlite' ? ` - ${p.host}:${p.port}` : ''}
                        </span>
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                        {!connected ? (
                          <Button variant="ghost" size="icon" className="h-5 w-5" title="Connect"
                            disabled={connecting === p.id}
                            onClick={(e) => { e.stopPropagation(); handleConnect(p); }}>
                            {connecting === p.id ? <Loader2 className="size-3 animate-spin" /> : <Plug className="size-3" />}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-5 w-5" title="Disconnect"
                            onClick={(e) => { e.stopPropagation(); handleDisconnect(p.id); }}>
                            <Unplug className="size-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-5 w-5" title="Edit"
                          onClick={(e) => { e.stopPropagation(); setEditingProfile(p); setDialogOpen(true); }}>
                          <KeyRound className="size-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5" title="Delete"
                          onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id); }}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {profiles.length === 0 && (
                  <div className="px-3 py-6 flex flex-col items-center gap-3 text-center">
                    <Database className="size-6 opacity-30" />
                    <p className="text-xs text-muted-foreground">No connections yet</p>
                    <Button variant="outline" size="xs" className="w-full" onClick={() => {
                      setEditingProfile(emptyProfile());
                      setDialogOpen(true);
                    }}>
                      <Plus /> New Connection
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {sidebarTab === 'schema' && (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {activeProfile ? activeProfile.name : 'Schema'}
                </span>
                {activeProfileId && (
                  <Button variant="ghost" size="icon-xs" title="Refresh Schema" onClick={async () => {
                    setLoadingSchema(true);
                    const res = await window.electronAPI.db.schema(activeProfileId);
                    if (!('error' in res)) setSchema(res);
                    setLoadingSchema(false);
                  }}>
                    {loadingSchema ? <Loader2 className="animate-spin" /> : <Database className="size-3" />}
                  </Button>
                )}
              </div>

              {isConnected && schema.length > 0 && (
                <div className="px-2 py-1.5 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={schemaSearch}
                      onChange={(e) => setSchemaSearch(e.target.value)}
                      placeholder="Filter tables..."
                      className="w-full bg-muted/30 border border-border/50 rounded text-xs pl-7 pr-6 py-1 placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30"
                    />
                    {schemaSearch && (
                      <button
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setSchemaSearch('')}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto py-1">
                {!isConnected && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Connect to a database to browse schema
                  </div>
                )}

                {isConnected && schema.length === 0 && !loadingSchema && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No tables found
                  </div>
                )}

                {loadingSchema && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" /> Loading schema...
                  </div>
                )}

                {isConnected && searchLower && filteredSchema.length === 0 && !loadingSchema && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No tables matching &ldquo;{schemaSearch}&rdquo;
                  </div>
                )}

                {schemaNames.map((schemaName) => {
                  const tables = schemaGroups[schemaName];
                  const schemaKey = `__schema__${schemaName}`;
                  const isSchemaExpanded = expandedTables.has(schemaKey);
                  const hasManySchemas = schemaNames.length > 1;

                  // When searching, always show tables (auto-expand schemas)
                  const tablesToRender = hasManySchemas && !isSchemaExpanded && !searchLower ? [] : tables;

                  return (
                    <div key={schemaName}>
                      {hasManySchemas && (
                        <div
                          className="group flex items-center gap-1 px-2 py-1 hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleSchema(schemaName)}
                        >
                          {isSchemaExpanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
                          <Database className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate flex-1 font-medium">{schemaName}</span>
                          <span className="text-[10px] text-muted-foreground">{tables.length}</span>
                        </div>
                      )}

                      {tablesToRender.map((table) => {
                        const tableKey = `${table.schema}.${table.name}`;
                        const isExpanded = expandedTables.has(tableKey);
                        const idxKey = `__idx__${tableKey}`;
                        const fkKey = `__fk__${tableKey}`;
                        return (
                          <div key={tableKey}>
                            <div
                              className={cn(
                                'group flex items-center gap-1 px-2 py-1 hover:bg-muted/50 cursor-pointer',
                                hasManySchemas && 'pl-5',
                              )}
                              onClick={() => toggleTable(tableKey)}
                            >
                              {isExpanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
                              <Table2 className="size-3 text-muted-foreground shrink-0" />
                              <span className="text-xs truncate flex-1">{table.name}</span>
                              <span className="text-[10px] text-muted-foreground">{table.columns.length}</span>
                              <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover:opacity-100" title={`SELECT * FROM ${qualifiedName(table)}`}
                                onClick={(e) => { e.stopPropagation(); insertTableQuery(table); }}>
                                <Play className="size-2.5" />
                              </Button>
                            </div>
                            {isExpanded && (
                              <div className={cn('pr-2', hasManySchemas ? 'pl-10' : 'pl-7')}>
                                {/* Columns */}
                                {table.columns.map((col) => (
                                  <div key={col.name} className="flex items-center gap-1 py-0.5 text-[11px]">
                                    {col.primaryKey && <KeyRound className="size-2.5 text-warning shrink-0" />}
                                    <span className={cn('truncate', col.primaryKey && 'font-medium')}>{col.name}</span>
                                    <span className="text-muted-foreground ml-auto shrink-0">{col.type}</span>
                                    {col.nullable && <span className="text-muted-foreground/50 text-[9px]">?</span>}
                                  </div>
                                ))}

                                {/* Indexes */}
                                {table.indexes?.length > 0 && (
                                  <>
                                    <div
                                      className="flex items-center gap-1 py-0.5 mt-1 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded"
                                      onClick={(e) => { e.stopPropagation(); toggleTable(idxKey); }}
                                    >
                                      {expandedTables.has(idxKey)
                                        ? <ChevronDown className="size-2.5 text-muted-foreground" />
                                        : <ChevronRight className="size-2.5 text-muted-foreground" />}
                                      <Hash className="size-2.5 text-muted-foreground shrink-0" />
                                      <span className="text-[10px] text-muted-foreground">Indexes ({table.indexes.length})</span>
                                    </div>
                                    {expandedTables.has(idxKey) && table.indexes.map((idx) => (
                                      <div key={idx.name} className="pl-4 py-0.5 text-[10px]">
                                        <div className="flex items-center gap-1">
                                          {idx.unique && <span className="text-[9px] text-info font-medium">UQ</span>}
                                          <span className="truncate text-foreground/80">{idx.name}</span>
                                        </div>
                                        <span className="text-muted-foreground/60 block truncate">{idx.columns.join(', ')}</span>
                                      </div>
                                    ))}
                                  </>
                                )}

                                {/* Foreign Keys */}
                                {table.foreignKeys?.length > 0 && (
                                  <>
                                    <div
                                      className="flex items-center gap-1 py-0.5 mt-1 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded"
                                      onClick={(e) => { e.stopPropagation(); toggleTable(fkKey); }}
                                    >
                                      {expandedTables.has(fkKey)
                                        ? <ChevronDown className="size-2.5 text-muted-foreground" />
                                        : <ChevronRight className="size-2.5 text-muted-foreground" />}
                                      <Link2 className="size-2.5 text-muted-foreground shrink-0" />
                                      <span className="text-[10px] text-muted-foreground">Relations ({table.foreignKeys.length})</span>
                                    </div>
                                    {expandedTables.has(fkKey) && table.foreignKeys.map((fk, i) => (
                                      <div key={i} className="pl-4 py-0.5 text-[10px]">
                                        <span className="text-foreground/80">{fk.columns.join(', ')}</span>
                                        <span className="text-muted-foreground/50">{' \u2192 '}</span>
                                        <span className="text-foreground/80">
                                          {fk.referencedSchema !== table.schema ? `${fk.referencedSchema}.` : ''}
                                          {fk.referencedTable}
                                        </span>
                                        <span className="text-muted-foreground/60">({fk.referencedColumns.join(', ')})</span>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* -------- Main area -------- */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
            {activeProfile && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className={cn('size-1.5 rounded-full', isConnected ? 'bg-success' : 'bg-muted-foreground/30')} />
                <span className="text-muted-foreground">{activeProfile.name}</span>
                <span className="text-muted-foreground/50">({DRIVER_LABELS[activeProfile.driver]})</span>
              </div>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost" size="icon-xs" title="Query History"
              onClick={() => setShowHistory(!showHistory)}
              disabled={!isConnected}
            >
              <History className="size-3.5" />
            </Button>
            <Button
              variant="default" size="xs"
              disabled={!isConnected || activeTab?.executing}
              onClick={() => {
                const q = editorRef.current?.getQuery();
                if (q) handleExecute(q);
              }}
            >
              {activeTab?.executing ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              Execute
            </Button>
          </div>

          {/* History dropdown */}
          {showHistory && historyEntries.length > 0 && (
            <div className="border-b border-border max-h-40 overflow-y-auto bg-muted/20">
              <div className="flex items-center justify-between px-3 py-1 border-b border-border/50">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Recent Queries</span>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => setShowHistory(false)}>
                  <X className="size-3" />
                </Button>
              </div>
              {historyEntries.slice(0, 50).map((entry) => (
                <div
                  key={entry.id}
                  className="px-3 py-1 cursor-pointer hover:bg-muted/50 flex items-center gap-2"
                  onClick={() => insertHistoryQuery(entry.query)}
                >
                  <span className="text-xs font-mono truncate flex-1">{entry.query}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Query Tabs */}
          <div className="flex items-center border-b border-border bg-muted/10 overflow-x-auto shrink-0">
            {queryTabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs cursor-pointer border-r border-border/50 shrink-0 group max-w-[160px]',
                  activeTabId === tab.id
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
                onClick={() => switchTab(tab.id)}
              >
                <span className="truncate">{tab.label}</span>
                {tab.executing && <Loader2 className="size-3 animate-spin shrink-0" />}
                {queryTabs.length > 1 && (
                  <button
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 ml-auto"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
            <button
              className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-muted/30 shrink-0"
              title="New Query Tab"
              onClick={addTab}
            >
              <Plus className="size-3" />
            </button>
          </div>

          {/* SQL Editor */}
          <div className="h-40 shrink-0 border-b border-border overflow-hidden">
            <div ref={sqlEditorContainerRef} className="h-full w-full" />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto min-h-0">
            {activeTab?.error && (
              <div className="m-3 p-3 rounded border border-destructive/30 bg-destructive/10 text-destructive text-xs font-mono whitespace-pre-wrap">
                {activeTab.error}
              </div>
            )}

            {activeTab?.executing && (
              <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" /> Executing query...
              </div>
            )}

            {activeTab?.result && !activeTab.executing && (
              <div className="flex flex-col h-full">
                {/* Status bar */}
                <div className="flex items-center gap-3 px-3 py-1 border-b border-border text-xs text-muted-foreground shrink-0">
                  {activeTab.result.columns.length > 0 ? (
                    <span>{activeTab.result.rowCount} row{activeTab.result.rowCount !== 1 ? 's' : ''} returned</span>
                  ) : (
                    <span>{activeTab.result.affectedRows} row{activeTab.result.affectedRows !== 1 ? 's' : ''} affected</span>
                  )}
                  <span>{activeTab.result.duration}ms</span>
                </div>

                {activeTab.result.columns.length > 0 && (
                  <div className="flex-1 overflow-auto">
                    <table className="min-w-max text-xs font-mono border-collapse">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b border-border">
                          <th className="px-2 py-1 text-left text-muted-foreground font-medium sticky left-0 bg-background border-r border-border/50 w-10 z-20">#</th>
                          {activeTab.result.columns.map((col) => (
                            <th key={col} className="px-2 py-1 text-left text-muted-foreground font-medium whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeTab.result.rows.map((row, i) => (
                          <ResultRow key={i} row={row} columns={activeTab.result!.columns} rowIndex={i} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab.result.columns.length === 0 && !activeTab.error && (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Query executed successfully
                  </div>
                )}
              </div>
            )}

            {!activeTab?.result && !activeTab?.error && !activeTab?.executing && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Database className="size-8 opacity-20" />
                <p className="text-xs">
                  {isConnected
                    ? 'Write a query and press Ctrl+Enter to execute'
                    : 'Connect to a database to start querying'
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection dialog */}
      {editingProfile && (
        <ConnectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          profile={editingProfile}
          onSave={handleSaveProfile}
        />
      )}
    </div>
  );
}
