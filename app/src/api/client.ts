/* HTTP client for the AI Studio server. Every failure — HTTP error, network down, a body that
   isn't JSON — becomes one ApiError with the server's {error: {code, message, details}} shape,
   so screens have a single thing to show. Base URL: VITE_API_URL, else 127.0.0.1:4319
   (the port the Tauri side starts the server on). */

/** Server codes (server/src/errors.ts) + two client-side ones. */
export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'agent_error'
  | 'network'
  | 'bad_response'
  | (string & {});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** 422 details: [{path, message}] → "path: message" lines (empty when not a validation error). */
  get issues(): string[] {
    return Array.isArray(this.details)
      ? this.details.map((d: { path?: string; message?: string }) =>
          d?.path ? `${d.path}: ${d.message ?? ''}` : String(d?.message ?? d),
        )
      : [];
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const DEFAULT_BASE = 'http://127.0.0.1:4319';
let base: string = (import.meta.env?.VITE_API_URL as string | undefined) || DEFAULT_BASE;
export const apiBase = (): string => base;
/** Point the client elsewhere (tests, a second dev server). */
export const setApiBase = (url: string): void => {
  base = url.replace(/\/+$/, '');
};

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type RequestOpts = { signal?: AbortSignal; fetch?: typeof fetch };

export async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts: RequestOpts = {},
): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${base}${path}`, {
      method,
      headers:
        body === undefined
          ? { accept: 'application/json' }
          : { 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', "Can't reach the studio server.", { cause: String(e) });
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(res.status, 'bad_response', 'The server answered with something that isn’t JSON.');
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'bad_response',
      err?.message ?? `Request failed (${res.status}).`,
      err?.details,
    );
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, o?: RequestOpts) => request<T>('GET', path, undefined, o),
  post: <T>(path: string, body: unknown = {}, o?: RequestOpts) => request<T>('POST', path, body, o),
  patch: <T>(path: string, body: unknown, o?: RequestOpts) => request<T>('PATCH', path, body, o),
  put: <T>(path: string, body: unknown, o?: RequestOpts) => request<T>('PUT', path, body, o),
  del: <T>(path: string, o?: RequestOpts) => request<T>('DELETE', path, undefined, o),
};
