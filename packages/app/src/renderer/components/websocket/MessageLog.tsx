import { useEffect, useRef, useState, memo } from 'react';
import { ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { Input } from '../ui/input';
import { cn } from '@/lib/utils';

export type WsMessage = {
  id: string;
  direction: 'sent' | 'received';
  payload: string;
  binary: boolean;
  byteLen: number;
  timestamp: number;
};

type Stats = {
  sentCount: number;
  receivedCount: number;
  bytesSent: number;
  bytesReceived: number;
};

const MAX_MESSAGES = 1000;
const ZERO_STATS: Stats = { sentCount: 0, receivedCount: 0, bytesSent: 0, bytesReceived: 0 };

function isJsonString(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}

function prettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  return `${(b / 1024).toFixed(1)}KB`;
}

// ─── MessageRow ──────────────────────────────────────────────────────────────

type MessageRowProps = {
  msg: WsMessage;
  expanded: boolean;
  onToggleExpand: () => void;
};

const MessageRow = memo(function MessageRow({ msg, expanded, onToggleExpand }: MessageRowProps) {
  const isJson = isJsonString(msg.payload);
  const isLong = msg.payload.length > 300;
  const displayPayload = isJson && expanded ? prettyJson(msg.payload) : msg.payload;

  return (
    <div className={cn(
      'flex gap-2 px-3 py-1.5 border-b border-border/40 hover:bg-muted/20',
      msg.direction === 'sent' ? 'bg-info/5' : 'bg-success/5',
    )}>
      <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
          {formatTs(msg.timestamp)}
        </span>
        {msg.direction === 'sent'
          ? <ArrowUp className="size-3 text-info" />
          : <ArrowDown className="size-3 text-success" />}
      </div>
      <div className="flex-1 min-w-0 font-mono text-xs">
        <pre className={cn('whitespace-pre-wrap break-all', !expanded && 'line-clamp-4')}>
          {displayPayload}
        </pre>
        {(isJson || isLong) && (
          <button
            className="text-[10px] text-primary/70 hover:text-primary mt-0.5"
            onClick={onToggleExpand}
          >
            {expanded ? '▲ collapse' : isJson ? '▼ expand JSON' : '▼ show more'}
          </button>
        )}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums pt-0.5">
        {formatBytes(msg.byteLen)}
      </span>
    </div>
  );
});

// ─── MessageLog ───────────────────────────────────────────────────────────────

type MessageLogProps = {
  connId: string;
  isConnected: boolean;
  clearToken: number;
};

export const MessageLog = memo(function MessageLog({ connId, isConnected, clearToken }: MessageLogProps) {
  // Messages stored in a ref — never triggers re-render on push, only on setMsgTick
  const messagesRef = useRef<WsMessage[]>([]);
  const [msgTick, setMsgTick] = useState(0);
  const [stats, setStats] = useState<Stats>({ ...ZERO_STATS });
  const [msgFilter, setMsgFilter] = useState<'all' | 'sent' | 'received'>('all');
  const [msgSearch, setMsgSearch] = useState('');
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());

  const logRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Subscribe to messages — isolated from parent, never causes parent re-renders
  useEffect(() => {
    return window.electronAPI.ws.onMessage(connId, (msg) => {
      messagesRef.current.push(msg);
      if (messagesRef.current.length > MAX_MESSAGES) {
        messagesRef.current.splice(0, messagesRef.current.length - MAX_MESSAGES);
      }
      setStats(prev =>
        msg.direction === 'sent'
          ? { ...prev, sentCount: prev.sentCount + 1, bytesSent: prev.bytesSent + msg.byteLen }
          : { ...prev, receivedCount: prev.receivedCount + 1, bytesReceived: prev.bytesReceived + msg.byteLen },
      );
      setMsgTick(t => t + 1);
    });
  }, [connId]);

  // Clear when token changes (driven by parent "Clear" button)
  useEffect(() => {
    if (clearToken === 0) return;
    messagesRef.current = [];
    setStats({ ...ZERO_STATS });
    setMsgTick(t => t + 1);
  }, [clearToken]);

  // Auto-scroll — only runs when messages update, not on parent re-renders
  useEffect(() => {
    if (atBottomRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [msgTick]);

  const handleScroll = () => {
    const el = logRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const toggleExpand = (id: string) =>
    setExpandedMsgIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filteredMessages = messagesRef.current.filter(m => {
    if (msgFilter === 'sent' && m.direction !== 'sent') return false;
    if (msgFilter === 'received' && m.direction !== 'received') return false;
    if (msgSearch && !m.payload.toLowerCase().includes(msgSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <div className="flex rounded-md border border-border overflow-hidden text-xs w-fit">
          {(['all', 'sent', 'received'] as const).map((f, i) => (
            <button
              key={f}
              className={cn(
                'px-2.5 py-0.5 capitalize transition-colors',
                i > 0 && 'border-l border-border',
                msgFilter === f ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50',
              )}
              onClick={() => setMsgFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            className="h-6 pl-7 text-xs"
            placeholder="Search messages..."
            value={msgSearch}
            onChange={(e) => setMsgSearch(e.target.value)}
          />
          {msgSearch && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setMsgSearch('')}>
              <X className="size-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        {(stats.sentCount > 0 || stats.receivedCount > 0) && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <ArrowUp className="size-3 text-blue-400 shrink-0" />
            {stats.sentCount}
            <span className="text-muted-foreground/40">·</span>
            <ArrowDown className="size-3 text-green-400 shrink-0" />
            {stats.receivedCount}
            <span className="ml-0.5 text-muted-foreground/60">
              {formatBytes(stats.bytesSent + stats.bytesReceived)}
            </span>
          </span>
        )}
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {filteredMessages.length}
        </span>
      </div>

      {/* Message list */}
      <div ref={logRef} className="flex-1 overflow-y-auto min-h-0" onScroll={handleScroll}>
        {filteredMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {isConnected ? 'No messages yet — send one below' : 'Connect to start receiving messages'}
          </div>
        )}
        {filteredMessages.map(msg => (
          <MessageRow
            key={msg.id}
            msg={msg}
            expanded={expandedMsgIds.has(msg.id)}
            onToggleExpand={() => toggleExpand(msg.id)}
          />
        ))}
      </div>
    </div>
  );
});
