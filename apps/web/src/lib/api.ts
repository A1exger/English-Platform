// Minimal typed fetch client for the LinguaDesk API.
const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// Token keys mirror lib/auth's tokenStore (kept local to avoid a circular import).
const ACCESS_KEY = 'ld_access';
const REFRESH_KEY = 'ld_refresh';

// Silent access-token refresh on 401 so an *active* user is never logged out
// mid-session (the access token lives 15m; the refresh token 7d). Concurrent
// 401s share a single in-flight refresh.
let refreshing: Promise<string | null> | null = null;
function refreshAccessToken(locale?: string): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return Promise.resolve(null);
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(locale ? { 'x-lang': locale } : {}) },
          body: JSON.stringify({ refreshToken }),
          cache: 'no-store',
        });
        if (!res.ok) return null;
        const t = (await res.json()) as { accessToken: string; refreshToken: string };
        localStorage.setItem(ACCESS_KEY, t.accessToken);
        localStorage.setItem(REFRESH_KEY, t.refreshToken);
        return t.accessToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  locale?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Absolute URL for a server-relative path (e.g. an uploaded /uploads/... file). */
export function fileUrl(url: string): string {
  if (url.startsWith('/uploads')) {
    return BASE.replace(/\/api\/v1\/?$/, '') + url;
  }
  return url;
}

/** Multipart upload (FormData); the browser sets the multipart boundary. */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  opts: { token?: string | null; locale?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(opts.locale ? { 'x-lang': opts.locale } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (data?.message) {
        message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      }
    } catch {
      /* non-JSON */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiFetch<T>(
  path: string,
  opts: ApiOptions = {},
  retried = false,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      // Localized server messages/notifications follow the user's UI language.
      ...(opts.locale ? { 'x-lang': opts.locale } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  // An authenticated request whose access token just expired: refresh once and retry.
  if (
    res.status === 401 &&
    opts.token &&
    !retried &&
    path !== '/auth/refresh' &&
    path !== '/auth/login'
  ) {
    const fresh = await refreshAccessToken(opts.locale);
    if (fresh) return apiFetch<T>(path, { ...opts, token: fresh }, true);
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (data?.message) {
        message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}
