type Query = Record<string, string | number | boolean> | URLSearchParams;

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

function buildUrl(path: string, query?: Query) {
  const base = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(base.replace(/\/$/, '') + normalizedPath);
  if (query) {
    if (query instanceof URLSearchParams) url.search = query.toString();
    else Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  return url.toString();
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; headers?: Record<string, string>; query?: Query } = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, query } = options;
  const url = buildUrl(path, query);
  const mergedHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (authToken) mergedHeaders['Authorization'] = `Bearer ${authToken}`;

  const init: RequestInit = { method, headers: mergedHeaders };
  if (body !== undefined && body !== null) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    try {
      err.body = JSON.parse(text);
    } catch {
      err.body = text;
    }
    throw err;
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T = any>(path: string, query?: Query) => request<T>(path, { method: 'GET', query }),
  post: <T = any>(path: string, body?: any) => request<T>(path, { method: 'POST', body }),
  put: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PUT', body }),
  del: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
  setAuthToken,
};

export default api;
