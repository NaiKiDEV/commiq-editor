import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { RefreshCw, X, ChevronRight } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';

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

  useEffect(() => { fetchEnv(); }, [fetchEnv]);

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
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Memoized filter — only recomputes when entries or filter changes
  const filtered = useMemo(() => {
    if (!filter) return entries;
    const q = filter.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }, [entries, filter]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">Environment</span>
        <Input
          className="flex-1 min-w-32 h-7 text-xs"
          placeholder="Filter by name or value..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => fetchEnv()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 flex items-center justify-between gap-2">
          <span>{error}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setError(null)}>
            <X />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {initialLoad && loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw className="size-4 animate-spin mr-2" /><span className="text-sm">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No variables found</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
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
                      <td
                        className={[
                          'px-4 py-1.5 font-mono text-muted-foreground transition-colors',
                          copiedKey === valCopyKey ? 'bg-green-500/10 text-green-600' : '',
                          copyFailed === valCopyKey ? 'bg-destructive/10 text-destructive' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {isPath ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => togglePath(entry.name)}
                            className="gap-1 font-mono text-muted-foreground hover:text-foreground px-1"
                          >
                            <ChevronRight className={`size-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            {pathEntries.length} entries
                          </Button>
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

                    {isPath && isExpanded && pathEntries.map((pathEntry, i) => {
                      const subKey = `path:${entry.name}:${i}`;
                      return (
                        <tr key={subKey} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
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
