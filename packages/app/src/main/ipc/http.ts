import { ipcMain, app } from 'electron';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { HttpCollection, HttpRequestBody, HttpRequestRecord, HttpResponse, HttpError } from '../../shared/http-types';

export type { HttpCollection, HttpRequestBody, HttpRequestRecord, HttpResponse, HttpError };

function getCollectionsPath(): string {
  return path.join(app.getPath('userData'), 'http-collections.json');
}

function getRequestsPath(): string {
  return path.join(app.getPath('userData'), 'http-requests.json');
}

async function readCollections(): Promise<HttpCollection[]> {
  try {
    return JSON.parse(await fsp.readFile(getCollectionsPath(), 'utf-8'));
  } catch {
    return [];
  }
}

async function writeCollections(collections: HttpCollection[]): Promise<void> {
  await fsp.writeFile(getCollectionsPath(), JSON.stringify(collections, null, 2));
}

async function readRequests(): Promise<HttpRequestRecord[]> {
  try {
    return JSON.parse(await fsp.readFile(getRequestsPath(), 'utf-8'));
  } catch {
    return [];
  }
}

async function writeRequests(requests: HttpRequestRecord[]): Promise<void> {
  await fsp.writeFile(getRequestsPath(), JSON.stringify(requests, null, 2));
}

const inflight = new Map<string, AbortController>();

export function registerHttpIpc(): void {
  ipcMain.handle('http:collections:list', async (_event, workspaceId: string) => {
    return (await readCollections()).filter(
      (c) => c.scope === 'global' || c.workspaceId === workspaceId,
    );
  });

  ipcMain.handle(
    'http:collections:create',
    async (_event, workspaceId: string, name: string, scope: 'workspace' | 'global') => {
      const collections = await readCollections();
      const collection: HttpCollection = {
        id: crypto.randomUUID(),
        name,
        scope,
        workspaceId: scope === 'global' ? null : workspaceId,
      };
      collections.push(collection);
      await writeCollections(collections);
      return collection;
    },
  );

  ipcMain.handle('http:collections:delete', async (_event, id: string) => {
    await writeCollections((await readCollections()).filter((c) => c.id !== id));
    await writeRequests((await readRequests()).filter((r) => r.collectionId !== id));
  });

  ipcMain.handle('http:requests:list', async (_event, workspaceId: string) => {
    const collections = (await readCollections()).filter(
      (c) => c.scope === 'global' || c.workspaceId === workspaceId,
    );
    const visibleCollectionIds = new Set(collections.map((c) => c.id));

    return (await readRequests()).filter((r) => {
      if (r.collectionId !== null) return visibleCollectionIds.has(r.collectionId);
      return r.workspaceId === workspaceId;
    });
  });

  ipcMain.handle('http:requests:save', async (_event, request: HttpRequestRecord) => {
    const requests = await readRequests();
    const idx = requests.findIndex((r) => r.id === request.id);
    if (idx !== -1) {
      requests[idx] = request;
    } else {
      requests.push(request);
    }
    await writeRequests(requests);
    return request;
  });

  ipcMain.handle('http:requests:delete', async (_event, id: string) => {
    await writeRequests((await readRequests()).filter((r) => r.id !== id));
  });

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

  ipcMain.handle('http:import-postman', async (_event, workspaceId: string, json: string): Promise<{ imported: number; skipped: number }> => {
    type PostmanHeader = { key: string; value?: string; disabled?: boolean };
    type PostmanBody = {
      mode?: string;
      raw?: string;
      options?: { raw?: { language?: string } };
    };
    type PostmanRequest = {
      method?: string;
      url?: string | { raw?: string };
      header?: PostmanHeader[];
      body?: PostmanBody;
    };
    type PostmanItem = {
      name?: string;
      request?: PostmanRequest;
      item?: PostmanItem[];
    };
    type PostmanCollection = {
      info?: { name?: string };
      item?: PostmanItem[];
    };

    let parsed: PostmanCollection;
    try {
      parsed = JSON.parse(json) as PostmanCollection;
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

    const collections = await readCollections();
    collections.push(collection);
    await writeCollections(collections);

    function flattenItems(items: PostmanItem[]): { requests: HttpRequestRecord[]; skipped: number } {
      let skipped = 0;
      const requests: HttpRequestRecord[] = [];

      for (const item of items ?? []) {
        if (Array.isArray(item.item)) {
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
            .filter((h) => h.key && !h.disabled)
            .map((h) => ({ key: h.key, value: h.value ?? '', enabled: true }));

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
    const existing = await readRequests();
    await writeRequests([...existing, ...requests]);

    return { imported: requests.length, skipped };
  });
}
