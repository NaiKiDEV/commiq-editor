import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function getType(value: JsonValue): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function getPreview(value: JsonValue, maxLen = 60): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value.length > maxLen ? value.slice(0, maxLen) + '…' : value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `{${keys.length} key${keys.length !== 1 ? 's' : ''}}`;
  }
  return String(value);
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'string': return 'text-[#e09e5a]';
    case 'number': return 'text-[#7ec986]';
    case 'boolean': return 'text-[#79b8ff]';
    case 'null': return 'text-[#79b8ff] italic';
    default: return 'text-muted-foreground';
  }
}

function matchesSearch(key: string, value: JsonValue, searchLower: string): boolean {
  if (key.toLowerCase().includes(searchLower)) return true;
  if (value === null) return 'null'.includes(searchLower);
  if (typeof value !== 'object') return String(value).toLowerCase().includes(searchLower);
  return false;
}

function hasSearchMatch(value: JsonValue, searchLower: string, key?: string): boolean {
  if (!searchLower) return true;
  if (key && key.toLowerCase().includes(searchLower)) return true;
  if (value === null) return 'null'.includes(searchLower);
  if (typeof value !== 'object') return String(value).toLowerCase().includes(searchLower);
  if (Array.isArray(value)) return value.some((v, i) => hasSearchMatch(v, searchLower, String(i)));
  return Object.entries(value).some(([k, v]) => hasSearchMatch(v, searchLower, k));
}

// ---------------------------------------------------------------------------
// Tree Node
// ---------------------------------------------------------------------------

function TreeNode({
  keyName,
  value,
  depth,
  defaultExpanded,
  searchTerm,
  path,
}: {
  keyName: string | null;
  value: JsonValue;
  depth: number;
  defaultExpanded: boolean;
  searchTerm: string;
  path: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const type = getType(value);
  const isExpandable = type === 'object' || type === 'array';
  const searchLower = searchTerm.toLowerCase();

  // Auto-expand when searching
  const shouldAutoExpand = searchLower && isExpandable && hasSearchMatch(value, searchLower);
  const isExpanded = shouldAutoExpand || expanded;

  const entries = useMemo(() => {
    if (!isExpandable || !isExpanded) return [];
    if (Array.isArray(value)) {
      return value.map((v, i) => ({ key: String(i), value: v }));
    }
    return Object.entries(value as Record<string, JsonValue>).map(([k, v]) => ({ key: k, value: v }));
  }, [value, isExpandable, isExpanded]);

  // Filter entries during search
  const filteredEntries = searchLower
    ? entries.filter(e => hasSearchMatch(e.value, searchLower, e.key))
    : entries;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  const isHighlighted = searchLower && keyName && keyName.toLowerCase().includes(searchLower);

  return (
    <div className="select-text">
      {/* Node row */}
      <div
        className={cn(
          'group flex items-center gap-1 py-px hover:bg-muted/30 rounded-sm cursor-default',
          isHighlighted && 'bg-yellow-500/10',
        )}
        style={{ paddingLeft: depth * 16 }}
      >
        {/* Expand toggle */}
        {isExpandable ? (
          <button
            onClick={() => setExpanded(!isExpanded)}
            className="p-0.5 rounded hover:bg-muted/50 shrink-0"
          >
            {isExpanded
              ? <ChevronDown className="size-3 text-muted-foreground" />
              : <ChevronRight className="size-3 text-muted-foreground" />
            }
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Key */}
        {keyName !== null && (
          <>
            <span className={cn('text-[#9ecbff] font-mono text-xs', isHighlighted && 'bg-yellow-500/20 rounded px-0.5')}>
              {keyName}
            </span>
            <span className="text-muted-foreground/50 text-xs">:</span>
          </>
        )}

        {/* Value or collapse preview */}
        {isExpandable ? (
          <span className="text-muted-foreground text-xs font-mono">
            {type === 'array' ? `[${(value as JsonValue[]).length}]` : `{${Object.keys(value as Record<string, JsonValue>).length}}`}
            {!isExpanded && (
              <span className="text-muted-foreground/50 ml-1">{getPreview(value)}</span>
            )}
          </span>
        ) : (
          <span className={cn('text-xs font-mono', getTypeColor(type))}>
            {getPreview(value)}
          </span>
        )}

        {/* Copy */}
        <button
          onClick={handleCopy}
          className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-auto shrink-0"
          title={`Copy ${path || 'root'}`}
        >
          {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3 text-muted-foreground" />}
        </button>

        {/* Type badge */}
        <span className="text-[9px] text-muted-foreground/40 opacity-0 group-hover:opacity-100 shrink-0 w-10 text-right">
          {type}
        </span>
      </div>

      {/* Children */}
      {isExpandable && isExpanded && (
        <div>
          {filteredEntries.map((entry) => (
            <TreeNode
              key={entry.key}
              keyName={entry.key}
              value={entry.value}
              depth={depth + 1}
              defaultExpanded={depth < 1}
              searchTerm={searchTerm}
              path={path ? `${path}.${entry.key}` : entry.key}
            />
          ))}
          {filteredEntries.length === 0 && searchLower && (
            <div className="text-xs text-muted-foreground/50 italic" style={{ paddingLeft: (depth + 1) * 16 }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function JsonTreeView({ data }: { data: unknown }) {
  const [search, setSearch] = useState('');

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keys and values…"
            className="w-full bg-muted/30 border border-border/50 rounded text-xs pl-7 pr-7 py-1.5 placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 font-mono"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        <TreeNode
          keyName={null}
          value={data as JsonValue}
          depth={0}
          defaultExpanded={true}
          searchTerm={search}
          path=""
        />
      </div>
    </div>
  );
}
