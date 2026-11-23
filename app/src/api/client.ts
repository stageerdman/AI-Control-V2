/* HTTP client for the AI Studio server. Every failure — HTTP error, network down, a body that
   isn't JSON — becomes one ApiError with the server's {error: {code, message, details}} shape,
   so screens have a single thing to show. Base URL: VITE_API_URL, else 127.0.0.1:4319
   (the port the Tauri side starts the server on). */

/** Server codes (server/src/errors.ts) + client-side ones (network = server down, blocked = up but refused). */
export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'agent_error'
  | 'network'
  | 'blocked'
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
/** A server path (e.g. a project's `imageUrl`) as a full URL; null stays null. */
export const apiUrl = (path: string | null | undefined): string | null => (path ? `${base}${path}` : null);
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
  /* a Blob goes as raw bytes with its own type (the project's picture; an unnamed one, like an .icns, as
     octet-stream so the server reads its bytes); everything else is JSON */
  const raw = typeof Blob !== 'undefined' && body instanceof Blob;
  const type = raw ? body.type || 'application/octet-stream' : 'application/json';
  try {
    res = await doFetch(`${base}${path}`, {
      method,
      headers:
        body === undefined
          ? { accept: 'application/json' }
          : { 'content-type': type, accept: 'application/json' },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw await networkError(method, path, e, doFetch);
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

/* A browser reports a CORS refusal exactly like a dead server. Ask /health in no-cors mode (a simple
   request: never blocked, the answer just unreadable) — if anything answers, the server is up and
   refused THIS request, so say that instead of "can't reach". */
async function networkError(method: Method, path: string, e: unknown, doFetch: typeof fetch) {
  const cause = String(e);
  const up = await doFetch(`${base}/health`, { mode: 'no-cors' }).then(
    () => true,
    () => false,
  );
  const refused = `The studio server is running but refused ${method} ${path} (${cause}).`;
  const down = `Can't reach the studio server at ${base} — is it running?`;
  return up ? new ApiError(0, 'blocked', refused, { cause }) : new ApiError(0, 'network', down, { cause });
}

export const http = {
  get: <T>(path: string, o?: RequestOpts) => request<T>('GET', path, undefined, o),
  post: <T>(path: string, body: unknown = {}, o?: RequestOpts) => request<T>('POST', path, body, o),
  patch: <T>(path: string, body: unknown, o?: RequestOpts) => request<T>('PATCH', path, body, o),
  put: <T>(path: string, body: unknown, o?: RequestOpts) => request<T>('PUT', path, body, o),
  del: <T>(path: string, o?: RequestOpts) => request<T>('DELETE', path, undefined, o),
};
