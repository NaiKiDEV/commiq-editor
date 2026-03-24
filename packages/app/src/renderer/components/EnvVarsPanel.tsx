import { useState, useEffect, useCallback, Fragment } from 'react';
import { RefreshCw, X, ChevronRight } from 'lucide-react';


type EnvEntry = { name: string; value: string };

const WELL_KNOWN = new Set([
  'PATH', 'Path', 'HOME', 'USER', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'TEMP', 'TMP', 'COMPUTERNAME', 'USERNAME', 'SYSTEMROOT', 'WINDIR',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'NODE_ENV', 'SHELL',
]);

const PATH_NAMES = new Set(['PATH', 'Path']);

function splitPath(value: string): string[] {
  const delimiter = value.includes(';') ? ';' : ':';
  return value.split(delimiter).filter((p) => p.trim() !== '');
}


export function EnvVarsPanel({ panelId: _panelId }: { panelId: string }) {
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);

  const fetchEnv = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.env.list();
      setEntries(data);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load environment variables');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setCopyFailed(key);
      setTimeout(() => setCopyFailed(null), 1500);
    }
  };

  const togglePath = (name: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const filtered = entries.filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
          Environment
        </span>
        <input
          className="flex-1 min-w-32 h-7 rounded-md bg-muted px-2 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          placeholder="Filter by name or value..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          onClick={() => fetchEnv()}
          disabled={loading}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70">
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {initialLoad && loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw className="size-4 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No variables found
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr className="text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium w-64">Name</th>
                <th className="text-left px-4 py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const isPath = PATH_NAMES.has(entry.name);
                const isExpanded = expandedPaths.has(entry.name);
                const pathEntries = isPath ? splitPath(entry.value) : [];
                const nameCopyKey = `name:${entry.name}`;
                const valCopyKey = `val:${entry.name}`;

                return (
                  <Fragment key={entry.name}>
                    <tr className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                      {/* Name cell */}
                      <td
                        className={[
                          'px-4 py-1.5 font-mono w-64 cursor-pointer select-text transition-colors',
                          WELL_KNOWN.has(entry.name) ? 'font-medium text-foreground' : 'text-muted-foreground',
                          copiedKey === nameCopyKey ? 'bg-green-500/10 text-green-600' : '',
                          copyFailed === nameCopyKey ? 'bg-destructive/10 text-destructive' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => copyToClipboard(entry.name, nameCopyKey)}
                        title={`Click to copy: ${entry.name}`}
                      >
                        {entry.name}
                      </td>

                      {/* Value cell */}
                      <td
                        className={[
                          'px-4 py-1.5 font-mono text-muted-foreground transition-colors',
                          copiedKey === valCopyKey ? 'bg-green-500/10 text-green-600' : '',
                          copyFailed === valCopyKey ? 'bg-destructive/10 text-destructive' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {isPath ? (
                          <button
                            onClick={() => togglePath(entry.name)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronRight
                              className={`size-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                            <span>{pathEntries.length} entries</span>
                          </button>
                        ) : (
                          <span
                            className="block max-w-[600px] truncate cursor-pointer"
                            onClick={() => copyToClipboard(entry.value, valCopyKey)}
                            title={`Click to copy: ${entry.value}`}
                          >
                            {entry.value || <span className="opacity-30 italic">empty</span>}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* PATH expanded sub-rows */}
                    {isPath && isExpanded && pathEntries.map((pathEntry, i) => {
                      const subKey = `path:${entry.name}:${i}`;
                      return (
                        <tr
                          key={subKey}
                          className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                        >
                          <td />
                          <td
                            className={[
                              'pl-8 pr-4 py-1 font-mono text-[11px] text-muted-foreground cursor-pointer transition-colors',
                              copiedKey === subKey ? 'bg-green-500/10 text-green-600' : '',
                              copyFailed === subKey ? 'bg-destructive/10 text-destructive' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => copyToClipboard(pathEntry, subKey)}
                            title={`Click to copy: ${pathEntry}`}
                          >
                            {pathEntry}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
