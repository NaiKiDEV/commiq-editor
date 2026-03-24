import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Globe, FolderOpen, Loader2, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { useActiveWorkspaceId } from '../hooks/use-workspace';

type HttpCollection = {
  id: string;
  name: string;
  scope: 'workspace' | 'global';
  workspaceId: string | null;
};

type HttpRequestBody = {
  type: 'none' | 'json' | 'text';
  content: string;
};

type HttpRequestRecord = {
  id: string;
  collectionId: string | null;
  workspaceId: string | null;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: HttpRequestBody;
};

type HttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timing: { start: number; end: number; duration: number };
};

type HttpError = { error: string };

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

function methodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: 'text-green-400',
    POST: 'text-blue-400',
    PUT: 'text-yellow-400',
    PATCH: 'text-orange-400',
    DELETE: 'text-red-400',
    HEAD: 'text-purple-400',
    OPTIONS: 'text-cyan-400',
  };
  return colors[method] ?? 'text-muted-foreground';
}

type HttpClientPanelProps = { panelId: string };

export function HttpClientPanel({ panelId: _panelId }: HttpClientPanelProps) {
  const workspaceId = useActiveWorkspaceId();
  const [collections, setCollections] = useState<HttpCollection[]>([]);
  const [requests, setRequests] = useState<HttpRequestRecord[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [response, setResponse] = useState<HttpResponse | HttpError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'info'>('body');
  const [requestTab, setRequestTab] = useState<'headers' | 'body'>('headers');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const activeRequest = requests.find((r) => r.id === activeRequestId) ?? null;

  useEffect(() => {
    if (!workspaceId) return;
    Promise.all([
      window.electronAPI.http.collectionsList(workspaceId),
      window.electronAPI.http.requestsList(workspaceId),
    ]).then(([cols, reqs]) => {
      setCollections(cols as HttpCollection[]);
      setRequests(reqs as HttpRequestRecord[]);
    });
  }, [workspaceId]);

  const createCollection = useCallback(async () => {
    if (!workspaceId) return;
    const col = await window.electronAPI.http.collectionsCreate(workspaceId, 'New Collection', 'workspace') as HttpCollection;
    setCollections((prev) => [...prev, col]);
  }, [workspaceId]);

  const deleteCollection = useCallback(async (id: string) => {
    await window.electronAPI.http.collectionsDelete(id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
    setRequests((prev) => prev.filter((r) => r.collectionId !== id));
    if (activeRequest?.collectionId === id) setActiveRequestId(null);
  }, [activeRequest]);

  const createRequest = useCallback(async (collectionId: string | null) => {
    if (!workspaceId) return;
    const req: HttpRequestRecord = {
      id: crypto.randomUUID(),
      collectionId,
      workspaceId: collectionId === null ? workspaceId : null,
      name: 'New Request',
      method: 'GET',
      url: '',
      headers: [],
      body: { type: 'none', content: '' },
    };
    await window.electronAPI.http.requestsSave(req);
    setRequests((prev) => [...prev, req]);
    setActiveRequestId(req.id);
  }, [workspaceId]);

  const deleteRequest = useCallback(async (id: string) => {
    await window.electronAPI.http.requestsDelete(id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    if (activeRequestId === id) setActiveRequestId(null);
  }, [activeRequestId]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    const text = await file.text();
    try {
      const result = await window.electronAPI.http.importPostman(workspaceId, text) as { imported: number; skipped: number };
      // Reload data
      const [cols, reqs] = await Promise.all([
        window.electronAPI.http.collectionsList(workspaceId),
        window.electronAPI.http.requestsList(workspaceId),
      ]);
      setCollections(cols as HttpCollection[]);
      setRequests(reqs as HttpRequestRecord[]);
      setImportMessage(`${result.imported} imported, ${result.skipped} skipped`);
      setTimeout(() => setImportMessage(null), 4000);
    } catch (err) {
      setImportMessage('Import failed: invalid Postman file');
      setTimeout(() => setImportMessage(null), 4000);
    }
    e.target.value = '';
  }, [workspaceId]);

  const uncategorized = requests.filter((r) => r.collectionId === null);

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      <div className="flex h-full min-h-0">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collections</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-5 w-5" title="Import Postman" onClick={() => importFileRef.current?.click()}>
                <Upload className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" title="New Collection" onClick={createCollection}>
                <Plus className="h-3 w-3" />
              </Button>
              <input ref={importFileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>
          </div>

          {importMessage && (
            <div className="px-3 py-1 text-xs text-muted-foreground bg-muted/50">{importMessage}</div>
          )}

          <div className="flex-1 overflow-y-auto py-1">
            {collections.map((col) => {
              const colRequests = requests.filter((r) => r.collectionId === col.id);
              const isCollapsed = collapsedIds.has(col.id);
              return (
                <div key={col.id}>
                  <div className="group flex items-center gap-1 px-2 py-1 hover:bg-muted/50 cursor-pointer"
                    onClick={() => setCollapsedIds((prev) => {
                      const next = new Set(prev);
                      next.has(col.id) ? next.delete(col.id) : next.add(col.id);
                      return next;
                    })}>
                    <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs">{col.name}</span>
                    <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); createRequest(col.id); }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteCollection(col.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {!isCollapsed && colRequests.map((req) => (
                    <div key={req.id}
                      className={cn('group flex items-center gap-1 pl-5 pr-2 py-1 cursor-pointer hover:bg-muted/50',
                        activeRequestId === req.id && 'bg-muted')}
                      onClick={() => setActiveRequestId(req.id)}>
                      <span className={cn('text-[10px] font-mono font-bold shrink-0 w-10', methodColor(req.method))}>{req.method}</span>
                      <span className="flex-1 truncate text-xs">{req.name}</span>
                      <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteRequest(req.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Uncategorized */}
            {uncategorized.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs text-muted-foreground">Uncategorized</div>
                {uncategorized.map((req) => (
                  <div key={req.id}
                    className={cn('group flex items-center gap-1 pl-3 pr-2 py-1 cursor-pointer hover:bg-muted/50',
                      activeRequestId === req.id && 'bg-muted')}
                    onClick={() => setActiveRequestId(req.id)}>
                    <span className={cn('text-[10px] font-mono font-bold shrink-0 w-10', methodColor(req.method))}>{req.method}</span>
                    <span className="flex-1 truncate text-xs">{req.name}</span>
                    <Button variant="ghost" size="icon" className="h-4 w-4 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteRequest(req.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {collections.length === 0 && uncategorized.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No collections yet.{' '}
                <button className="underline" onClick={createCollection}>Create one</button>
                {' '}or{' '}
                <button className="underline" onClick={() => importFileRef.current?.click()}>import from Postman</button>.
              </div>
            )}
          </div>

          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs gap-1"
              onClick={() => createRequest(null)}>
              <Plus className="h-3 w-3" /> New Request
            </Button>
          </div>
        </div>

        {/* Right side: editor + response */}
        <div className="flex-1 flex flex-col min-w-0">
          {!activeRequest && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-1">
                <Globe className="h-8 w-8 mx-auto opacity-30" />
                <p className="text-xs">Select or create a request</p>
              </div>
            </div>
          )}
          {activeRequest && (
            <RequestEditor
              request={activeRequest}
              requestTab={requestTab}
              setRequestTab={setRequestTab}
              response={response}
              responseTab={responseTab}
              setResponseTab={setResponseTab}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              setResponse={setResponse}
              onRequestChange={(updated) => {
                setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
                window.electronAPI.http.requestsSave(updated);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type RequestEditorProps = {
  request: HttpRequestRecord;
  requestTab: 'headers' | 'body';
  setRequestTab: (t: 'headers' | 'body') => void;
  response: HttpResponse | HttpError | null;
  responseTab: 'body' | 'headers' | 'info';
  setResponseTab: (t: 'body' | 'headers' | 'info') => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  setResponse: (r: HttpResponse | HttpError | null) => void;
  onRequestChange: (r: HttpRequestRecord) => void;
};

function prettyPrint(body: string, contentType: string): string {
  if (body.startsWith('__binary__:')) {
    const bytes = body.slice('__binary__:'.length);
    return `Binary response — ${bytes} bytes`;
  }
  if (contentType.includes('json')) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

function statusColor(status: number): string {
  if (status < 200) return 'text-muted-foreground';
  if (status < 300) return 'text-green-400';
  if (status < 400) return 'text-yellow-400';
  return 'text-red-400';
}

function RequestEditor({
  request, requestTab, setRequestTab,
  response, responseTab, setResponseTab,
  isLoading, setIsLoading, setResponse,
  onRequestChange,
}: RequestEditorProps) {
  const update = (patch: Partial<HttpRequestRecord>) =>
    onRequestChange({ ...request, ...patch });

  const sendRequest = async () => {
    setIsLoading(true);
    setResponse(null);
    try {
      const result = await window.electronAPI.http.request(request) as HttpResponse | HttpError | { cancelled: true };
      // If user cancelled, leave response null (silently clear)
      if ('cancelled' in result) return;
      setResponse(result as HttpResponse | HttpError);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelRequest = () => {
    window.electronAPI.http.requestCancel(request.id);
  };

  const addHeader = () =>
    update({ headers: [...request.headers, { key: '', value: '', enabled: true }] });

  const updateHeader = (idx: number, patch: Partial<{ key: string; value: string; enabled: boolean }>) => {
    const headers = request.headers.map((h, i) => i === idx ? { ...h, ...patch } : h);
    update({ headers });
  };

  const removeHeader = (idx: number) =>
    update({ headers: request.headers.filter((_, i) => i !== idx) });

  const isError = response && 'error' in response;
  const okResponse = !isError ? response as HttpResponse | null : null;
  const responseBody = okResponse
    ? prettyPrint(okResponse.body, okResponse.headers['content-type'] ?? '')
    : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Request name */}
      <div className="px-3 pt-2 pb-1">
        <input
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          placeholder="Request name"
          value={request.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>

      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <select
          className="bg-muted border border-border rounded px-2 h-8 text-xs font-mono font-bold outline-none shrink-0"
          value={request.method}
          onChange={(e) => update({ method: e.target.value as HttpRequestRecord['method'] })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          className="flex-1 bg-muted border border-border rounded px-3 h-8 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
          placeholder="https://api.example.com/endpoint"
          value={request.url}
          onChange={(e) => update({ url: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isLoading) sendRequest(); }}
        />
        {isLoading ? (
          <Button size="sm" variant="ghost" className="h-8 px-3 text-xs shrink-0" onClick={cancelRequest}>
            <Loader2 className="h-3 w-3 animate-spin mr-1" /> Cancel
          </Button>
        ) : (
          <Button size="sm" className="h-8 px-3 text-xs shrink-0" onClick={sendRequest}>
            Send
          </Button>
        )}
      </div>

      {/* Request tabs */}
      <div className="flex border-b border-border px-3 gap-3">
        {(['headers', 'body'] as const).map((tab) => (
          <button key={tab} onClick={() => setRequestTab(tab)}
            className={cn('pb-1 text-xs capitalize border-b-2 -mb-px transition-colors',
              requestTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {tab}
            {tab === 'headers' && request.headers.filter(h => h.enabled && h.key).length > 0 &&
              <span className="ml-1 text-[10px] text-muted-foreground">({request.headers.filter(h => h.enabled && h.key).length})</span>}
          </button>
        ))}
      </div>

      {/* Request tab content — fixed height */}
      <div className="h-36 overflow-y-auto px-3 py-2 shrink-0">
        {requestTab === 'headers' && (
          <div className="space-y-1">
            {request.headers.map((h, i) => (
              <div key={i} className="flex items-center gap-1">
                <input type="checkbox" checked={h.enabled}
                  onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                  className="h-3 w-3 shrink-0" />
                <input className="flex-1 bg-muted rounded px-2 h-6 text-xs font-mono outline-none"
                  placeholder="Key" value={h.key}
                  onChange={(e) => updateHeader(i, { key: e.target.value })} />
                <input className="flex-1 bg-muted rounded px-2 h-6 text-xs font-mono outline-none"
                  placeholder="Value" value={h.value}
                  onChange={(e) => updateHeader(i, { value: e.target.value })} />
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => removeHeader(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 mt-1" onClick={addHeader}>
              <Plus className="h-3 w-3" /> Add Header
            </Button>
          </div>
        )}
        {requestTab === 'body' && (
          <div className="flex flex-col gap-1 h-full">
            <select className="bg-muted border border-border rounded px-2 h-6 text-xs w-32 outline-none"
              value={request.body.type}
              onChange={(e) => update({ body: { ...request.body, type: e.target.value as HttpRequestBody['type'] } })}>
              <option value="none">None</option>
              <option value="json">JSON</option>
              <option value="text">Text</option>
            </select>
            {request.body.type !== 'none' && (
              <textarea
                className="flex-1 bg-muted rounded p-2 text-xs font-mono outline-none resize-none h-20"
                placeholder={request.body.type === 'json' ? '{\n  "key": "value"\n}' : 'Request body...'}
                value={request.body.content}
                onChange={(e) => update({ body: { ...request.body, content: e.target.value } })}
              />
            )}
          </div>
        )}
      </div>

      {/* Response pane */}
      {(response || isLoading) && (
        <div className="flex-1 flex flex-col min-h-0 border-t border-border">
          <div className="flex items-center gap-3 px-3 border-b border-border">
            {(['body', 'headers', 'info'] as const).map((tab) => (
              <button key={tab} onClick={() => setResponseTab(tab)}
                className={cn('py-1 text-xs capitalize border-b-2 -mb-px transition-colors',
                  responseTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {tab}
              </button>
            ))}
            {okResponse && (
              <span className={cn('ml-auto text-xs font-mono font-bold', statusColor(okResponse.status))}>
                {okResponse.status} {okResponse.statusText}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Sending...
              </div>
            )}
            {!isLoading && isError && (
              <span className="text-red-400">{(response as HttpError).error}</span>
            )}
            {!isLoading && okResponse && responseTab === 'body' && (
              <pre className="whitespace-pre-wrap break-words">{responseBody}</pre>
            )}
            {!isLoading && okResponse && responseTab === 'headers' && (
              <div className="space-y-0.5">
                {Object.entries(okResponse.headers).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{k}:</span>
                    <span className="break-all">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {!isLoading && okResponse && responseTab === 'info' && (
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Status: </span><span className={statusColor(okResponse.status)}>{okResponse.status} {okResponse.statusText}</span></div>
                <div><span className="text-muted-foreground">Time: </span>{okResponse.timing.duration}ms</div>
                <div><span className="text-muted-foreground">Size: </span>
                  {okResponse.body.startsWith('__binary__:')
                    ? `${okResponse.body.slice('__binary__:'.length)} bytes`
                    : `${new TextEncoder().encode(okResponse.body).byteLength} bytes`}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
