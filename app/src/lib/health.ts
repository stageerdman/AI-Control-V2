/* Health client — validates the backend's `/health` body and folds a start attempt into a UI status.
   Pure: the Tauri `invoke` is injected so this is testable without a window. */

export type Health = {
  ok: boolean;
  version: string;
  paths: { home: string; sandbox: string; controlHome: string; db: string };
};

export type Status =
  | { kind: 'starting' }
  | { kind: 'ready'; health: Health; reused: boolean }
  | { kind: 'error'; message: string };

/** What the Rust `backend_start` command resolves with. */
export type Started = { reused: boolean; health: string };

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
    return { kind: 'ready', health, reused: started.reused };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message: message || 'The server could not start.' };
  }
}
