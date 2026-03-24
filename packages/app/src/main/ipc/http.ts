import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type HttpCollection = {
  id: string;
  name: string;
  scope: 'workspace' | 'global';
  workspaceId: string | null;
};

export type HttpRequestBody = {
  type: 'none' | 'json' | 'text';
  content: string;
};

export type HttpRequestRecord = {
  id: string;
  collectionId: string | null;
  workspaceId: string | null; // set when collectionId is null (uncategorized)
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: HttpRequestBody;
};

export type HttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timing: { start: number; end: number; duration: number };
};

export type HttpError = {
  error: string;
};

function getCollectionsPath(): string {
  return path.join(app.getPath('userData'), 'http-collections.json');
}

function getRequestsPath(): string {
  return path.join(app.getPath('userData'), 'http-requests.json');
}

function readCollections(): HttpCollection[] {
  try {
    return JSON.parse(fs.readFileSync(getCollectionsPath(), 'utf-8'));
  } catch {
    return [];
  }
}

function writeCollections(collections: HttpCollection[]): void {
  fs.writeFileSync(getCollectionsPath(), JSON.stringify(collections, null, 2));
}

function readRequests(): HttpRequestRecord[] {
  try {
    return JSON.parse(fs.readFileSync(getRequestsPath(), 'utf-8'));
  } catch {
    return [];
  }
}

function writeRequests(requests: HttpRequestRecord[]): void {
  fs.writeFileSync(getRequestsPath(), JSON.stringify(requests, null, 2));
}

const inflight = new Map<string, AbortController>();

export function registerHttpIpc(): void {
  // --- Collections ---

  ipcMain.handle('http:collections:list', (_event, workspaceId: string) => {
    return readCollections().filter(
      (c) => c.scope === 'global' || c.workspaceId === workspaceId,
    );
  });

  ipcMain.handle(
    'http:collections:create',
    (_event, workspaceId: string, name: string, scope: 'workspace' | 'global') => {
      const collections = readCollections();
      const collection: HttpCollection = {
        id: crypto.randomUUID(),
        name,
        scope,
        workspaceId: scope === 'global' ? null : workspaceId,
      };
      collections.push(collection);
      writeCollections(collections);
      return collection;
    },
  );

  ipcMain.handle('http:collections:delete', (_event, id: string) => {
    writeCollections(readCollections().filter((c) => c.id !== id));
    // Cascade: delete all requests belonging to this collection
    writeRequests(readRequests().filter((r) => r.collectionId !== id));
  });

  // --- Requests ---

  ipcMain.handle('http:requests:list', (_event, workspaceId: string) => {
    const collections = readCollections().filter(
      (c) => c.scope === 'global' || c.workspaceId === workspaceId,
    );
    const visibleCollectionIds = new Set(collections.map((c) => c.id));

    return readRequests().filter((r) => {
      if (r.collectionId !== null) {
        return visibleCollectionIds.has(r.collectionId);
      }
      // Uncategorized: must match workspaceId
      return r.workspaceId === workspaceId;
    });
  });

  ipcMain.handle('http:requests:save', (_event, request: HttpRequestRecord) => {
    const requests = readRequests();
    const idx = requests.findIndex((r) => r.id === request.id);
    if (idx !== -1) {
      requests[idx] = request;
    } else {
      requests.push(request);
    }
    writeRequests(requests);
    return request;
  });

  ipcMain.handle('http:requests:delete', (_event, id: string) => {
    writeRequests(readRequests().filter((r) => r.id !== id));
  });

  // --- HTTP Execution ---

  ipcMain.handle('http:request', async (_event, request: HttpRequestRecord): Promise<HttpResponse | HttpError | { cancelled: true }> => {
    const controller = new AbortController();
    inflight.set(request.id, controller);

    const timeoutId = setTimeout(() => controller.abort(new Error('Request timed out')), 30_000);
    const start = Date.now();

    try {
      const headers: Record<string, string> = {};
      for (const h of request.headers) {
        if (h.enabled && h.key.trim()) {
          headers[h.key.trim()] = h.value;
        }
      }

      // Set Content-Type for json bodies if not already set
      if (request.body.type === 'json' && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }

      const fetchOptions: RequestInit = {
        method: request.method,
        headers,
        signal: controller.signal,
      };

      if (request.body.type !== 'none' && request.body.content) {
        fetchOptions.body = request.body.content;
      }

      const res = await fetch(request.url, fetchOptions);
      const end = Date.now();

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Check if binary
      const contentType = res.headers.get('content-type') ?? '';
      const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript');

      let body: string;
      if (isText) {
        body = await res.text();
      } else {
        const buf = await res.arrayBuffer();
        body = `__binary__:${buf.byteLength}`;
      }

      return {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body,
        timing: { start, end, duration: end - start },
      };
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        // Return a distinct cancelled sentinel — renderer suppresses display for this
        return { cancelled: true };
      }
      return { error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timeoutId);
      inflight.delete(request.id);
    }
  });

  ipcMain.handle('http:request:cancel', (_event, requestId: string) => {
    inflight.get(requestId)?.abort(new Error('Request cancelled'));
  });

  // --- Postman Import ---

  ipcMain.handle('http:import-postman', (_event, workspaceId: string, json: string): { imported: number; skipped: number } => {
    let parsed: any;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Invalid JSON');
    }

    const collectionName = parsed?.info?.name ?? 'Imported Collection';
    const collection: HttpCollection = {
      id: crypto.randomUUID(),
      name: collectionName,
      scope: 'workspace',
      workspaceId,
    };

    const collections = readCollections();
    collections.push(collection);
    writeCollections(collections);

    // Flatten items recursively, collect leaf requests only
    function flattenItems(items: any[]): { requests: HttpRequestRecord[]; skipped: number } {
      let skipped = 0;
      const requests: HttpRequestRecord[] = [];

      for (const item of items ?? []) {
        if (Array.isArray(item.item)) {
          // It's a folder — recurse and flatten
          const nested = flattenItems(item.item);
          requests.push(...nested.requests);
          skipped += nested.skipped;
        } else if (item.request) {
          const req = item.request;
          const method = (req.method ?? 'GET').toUpperCase();
          const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
          if (!validMethods.includes(method)) {
            skipped++;
            continue;
          }

          const url: string =
            typeof req.url === 'string'
              ? req.url
              : req.url?.raw ?? '';

          const headers = (req.header ?? [])
            .filter((h: any) => h.key && !h.disabled)
            .map((h: any) => ({ key: h.key, value: h.value ?? '', enabled: true }));

          let body: HttpRequestBody = { type: 'none', content: '' };
          if (req.body?.mode === 'raw') {
            const lang = req.body?.options?.raw?.language ?? '';
            body = {
              type: lang === 'json' ? 'json' : 'text',
              content: req.body.raw ?? '',
            };
          } else if (req.body) {
            // form, binary, graphql etc — skip body, count as partial import
            skipped++;
          }

          requests.push({
            id: crypto.randomUUID(),
            collectionId: collection.id,
            workspaceId: null,
            name: item.name ?? 'Untitled',
            method: method as HttpRequestRecord['method'],
            url,
            headers,
            body,
          });
        }
      }

      return { requests, skipped };
    }

    const { requests, skipped } = flattenItems(parsed?.item ?? []);
    const existing = readRequests();
    writeRequests([...existing, ...requests]);

    return { imported: requests.length, skipped };
  });
}
