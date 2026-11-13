/* Live event streams (server/src/http/sse.ts): GET /projects/:id/events, /drafts/:id/events.
   The server sends NAMED events (`event: <type>`), replays everything after Last-Event-ID /
   ?after=, then goes live with heartbeats.
   - While the browser's EventSource is auto-retrying (readyState CONNECTING) it resends
     Last-Event-ID itself, so nothing is missed.
   - If the stream is CLOSED for good (server restarted, non-200), we reopen it ourselves with
     ?after=<last id> and a growing backoff (1 s → 15 s), so the replay picks up exactly there.
   - Ids at or below the last one seen are dropped (no duplicates across reconnects). */
import { useEffect, useRef, useState } from 'react';
import { apiBase } from './client';
import { EVENT_TYPES, type StudioEvent } from './types';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

type ESLike = {
  readyState: number;
  addEventListener(type: string, fn: (e: MessageEvent) => void): void;
  close(): void;
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
};
type ESCtor = new (url: string) => ESLike;

export type StreamOpts = {
  /** Resume after this id (0 = from the start: the whole log replays). */
  after?: number;
  /** Event types to listen for (default: every known type). */
  types?: readonly string[];
  onStatus?: (s: StreamStatus) => void;
  /** Injected in tests. */
  EventSource?: ESCtor;
  backoffMs?: (attempt: number) => number;
};

const CLOSED = 2;
const defaultBackoff = (n: number) => Math.min(15_000, 1000 * 2 ** n);

export const streamUrl = (path: string, after: number): string => {
  const abs = /^https?:/.test(path) ? path : `${apiBase()}${path}`;
  return after > 0 ? `${abs}${abs.includes('?') ? '&' : '?'}after=${after}` : abs;
};

/** Imperative core (the hook wraps it). Returns a closer. */
export function openEventStream(path: string, onEvent: (e: StudioEvent) => void, opts: StreamOpts = {}) {
  const ES = opts.EventSource ?? (globalThis.EventSource as unknown as ESCtor);
  const backoff = opts.backoffMs ?? defaultBackoff;
  const types = opts.types ?? EVENT_TYPES;
  let last = opts.after ?? 0;
  let es: ESLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let stopped = false;
  const status = (s: StreamStatus) => opts.onStatus?.(s);

  const handle = (m: MessageEvent) => {
    let ev: StudioEvent;
    try {
      ev = JSON.parse(m.data);
    } catch {
      return;
    }
    const id = Number(m.lastEventId || ev.id);
    if (Number.isFinite(id) && id > 0) {
      if (id <= last) return;
      last = id;
    }
    onEvent(ev);
  };

  const connect = () => {
    if (stopped) return;
    status(attempt === 0 ? 'connecting' : 'reconnecting');
    const s = new ES(streamUrl(path, last));
    es = s;
    for (const t of types) s.addEventListener(t, handle);
    s.addEventListener('message', handle);
    s.onopen = () => {
      attempt = 0;
      status('open');
    };
    s.onerror = () => {
      if (stopped || es !== s) return;
      if (s.readyState === CLOSED) {
        s.close();
        es = null;
        status('reconnecting');
        timer = setTimeout(connect, backoff(attempt++));
      } else status('reconnecting'); /* the browser retries with Last-Event-ID */
    };
  };
  connect();

  return {
    close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
      es = null;
      status('closed');
    },
    lastEventId: () => last,
  };
}

/** Subscribe to a stream while mounted (url null = off). onEvent may change freely. */
export function useEventStream(
  path: string | null,
  onEvent: (e: StudioEvent) => void,
  opts: Omit<StreamOpts, 'onStatus'> = {},
): { status: StreamStatus } {
  const [status, setStatus] = useState<StreamStatus>(path ? 'connecting' : 'closed');
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const typesKey = opts.types?.join(',') ?? '';

  // biome-ignore lint/correctness/useExhaustiveDependencies: reopen on path / types only
  useEffect(() => {
    if (!path) {
      setStatus('closed');
      return;
    }
    const s = openEventStream(path, (e) => handler.current(e), { ...optsRef.current, onStatus: setStatus });
    return () => s.close();
  }, [path, typesKey]);

  return { status };
}
