// Shared HTTP client types — imported by both main process (ipc/http.ts) and renderer (HttpClientPanel.tsx)

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
  workspaceId: string | null;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: HttpRequestBody;
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'apikey';
    bearer: { token: string };
    basic: { username: string; password: string };
    apikey: { key: string; value: string; addTo: 'header' | 'query' };
  };
  queryParams?: { key: string; value: string; enabled: boolean }[];
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
