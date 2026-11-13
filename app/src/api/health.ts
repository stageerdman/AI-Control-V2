/* Health client — validates the backend's `/health` body and folds a start attempt into a UI status.
   Pure: the Tauri `invoke` (or, in a plain browser, `fetch`) is injected so this is testable. */
import type { ServerHealth } from './types';

export type Health = ServerHealth;

export type Status =
  | { kind: 'starting' }
  | { kind: 'ready'; health: Health; reused: boolean; port?: number }
  | { kind: 'error'; message: string };

/** What the Rust `backend_start` command resolves with. */
export type Started = { reused: boolean; health: string; port?: number };

export type Invoke = (cmd: string) => Promise<unknown>;

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Parse + shape-check a `/health` body. Throws a readable Error on anything unexpected. */
export function parseHealth(raw: string): Health {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('The server answered, but not with JSON.');
  }
  const d = data as Partial<Health> | null;
  const p = d?.paths;
  if (
    !d ||
    typeof d.ok !== 'boolean' ||
    !isStr(d.version) ||
    !p ||
    !isStr(p.home) ||
    !isStr(p.sandbox) ||
    !isStr(p.controlHome) ||
    !isStr(p.db)
  ) {
    throw new Error('The server answered with an unexpected health format.');
  }
  return { ok: d.ok, version: d.version, paths: { ...p } as Health['paths'] };
}

/** Start (or reuse) the backend and report the resulting status. Never throws. */
export async function startBackend(invoke: Invoke): Promise<Status> {
  try {
    const started = (await invoke('backend_start')) as Started;
    const health = parseHealth(started.health);
    if (!health.ok) return { kind: 'error', message: 'The server is up, but its database is not healthy.' };
    return { kind: 'ready', health, reused: started.reused, port: started.port };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: message || 'The server could not start.' };
  }
}

/** Plain-browser path (Vite dev in Chrome, no Tauri): the server must already be running. */
export async function checkServer(url: string, doFetch: typeof fetch = fetch): Promise<Status> {
  try {
    const res = await doFetch(`${url}/health`);
    const health = parseHealth(await res.text());
    if (!health.ok) return { kind: 'error', message: 'The server is up, but its database is not healthy.' };
    return { kind: 'ready', health, reused: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      kind: 'error',
      message: `No studio server at ${url} (${message}). Start it with \`npm run dev\` in server/.`,
    };
  }
}

/** The live-watch step while the app runs: `fails` consecutive failed pings → lost at LOST_AFTER. */
export const LOST_AFTER = 2;
export function watchStep(fails: number, ok: boolean): { fails: number; lost: boolean } {
  const n = ok ? 0 : fails + 1;
  return { fails: n, lost: n >= LOST_AFTER };
}

/** One ping of /health (short timeout). True only for a healthy answer. */
export async function ping(url: string, doFetch: typeof fetch = fetch, ms = 4000): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await doFetch(`${url}/health`, { signal: ctl.signal });
    return res.ok && parseHealth(await res.text()).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** The API base on another port (the app reuses whichever backend holds the data dir). */
export const portBase = (base: string, port: number): string => {
  try {
    const u = new URL(base);
    u.port = String(port);
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch {
    return `http://127.0.0.1:${port}`;
  }
};
