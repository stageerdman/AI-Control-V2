/* A tiny query cache — just enough for a local, single-user studio:
   - useQuery(key, fetcher): cached by key, deduped while in flight, keeps the last data while
     refreshing, refetches on invalidate(). Keys are strings like 'agents' or 'project:aurora:work'.
   - useMutation(fn, {invalidate}): runs fn, then invalidates the given key prefixes.
   - invalidate(prefix) / setQueryData(key, v) for event-driven updates (e.g. from useEventStream).
   No retries, no window-focus refetch, no GC: data is small and the server is local. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export type QueryState<T> = {
  data: T | undefined;
  error: Error | undefined;
  /** No data yet and a fetch is running. */
  loading: boolean;
  /** A fetch is running (with or without data). */
  fetching: boolean;
};
type Entry<T = unknown> = QueryState<T> & {
  stale: boolean;
  promise?: Promise<void>;
  fetcher?: () => Promise<T>;
};

const cache = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();
const EMPTY: Entry = { data: undefined, error: undefined, loading: false, fetching: false, stale: true };

const put = (key: string, patch: Partial<Entry>) => {
  cache.set(key, { ...(cache.get(key) ?? EMPTY), ...patch });
  for (const fn of subs.get(key) ?? []) fn();
};

function load<T>(key: string, fetcher?: () => Promise<T>): Promise<void> {
  const cur = cache.get(key) as Entry<T> | undefined;
  const f = fetcher ?? cur?.fetcher;
  if (!f) return Promise.resolve();
  if (cur?.promise) return cur.promise;
  const promise = f().then(
    (data) =>
      put(key, { data, error: undefined, loading: false, fetching: false, stale: false, promise: undefined }),
    (error: Error) => put(key, { error, loading: false, fetching: false, stale: false, promise: undefined }),
  );
  put(key, {
    fetcher: f as () => Promise<unknown>,
    promise,
    fetching: true,
    loading: cur?.data === undefined,
  });
  return promise;
}

/* A fetch already in flight may have read the server before the change behind this refresh
   (e.g. a report filed mid-fetch), so fetch again once it ends instead of reusing its answer. */
const reload = (key: string): Promise<void> => {
  const inFlight = cache.get(key)?.promise;
  return inFlight ? inFlight.then(() => load(key)) : load(key);
};

/** Mark every key starting with `prefix` stale; ones on screen refetch now. */
export function invalidate(prefix: string): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const key of cache.keys()) {
    if (!key.startsWith(prefix)) continue;
    put(key, { stale: true });
    if (subs.get(key)?.size) jobs.push(reload(key));
  }
  return Promise.all(jobs).then(() => undefined);
}

/** Write data straight into the cache (optimistic updates, SSE-driven refreshes). */
export function setQueryData<T>(key: string, value: T | ((prev: T | undefined) => T)): void {
  const prev = cache.get(key)?.data as T | undefined;
  const data = typeof value === 'function' ? (value as (p: T | undefined) => T)(prev) : value;
  put(key, { data, error: undefined, loading: false, stale: false });
}

export const getQueryData = <T>(key: string): T | undefined => cache.get(key)?.data as T | undefined;

/** Tests only. */
export function clearQueryCache(): void {
  cache.clear();
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
): QueryState<T> & { refetch: () => Promise<void> } {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!key) return () => {};
      const set = subs.get(key) ?? new Set();
      set.add(fn);
      subs.set(key, set);
      return () => set.delete(fn);
    },
    [key],
  );
  const entry = useSyncExternalStore(subscribe, () => (key ? (cache.get(key) ?? EMPTY) : EMPTY)) as Entry<T>;

  useEffect(() => {
    if (!key) return;
    const cur = cache.get(key);
    if (!cur || cur.stale) void load(key, () => fetcherRef.current());
  }, [key]);

  const refetch = useCallback(() => {
    if (!key) return Promise.resolve();
    put(key, { stale: true });
    return load(key, () => fetcherRef.current());
  }, [key]);

  const missing = key !== null && !cache.has(key);
  return {
    data: entry.data,
    error: entry.error,
    loading: entry.loading || missing,
    fetching: entry.fetching || missing,
    refetch,
  };
}

export type MutationState<R> = { pending: boolean; error: Error | undefined; data: R | undefined };

export function useMutation<V, R>(
  fn: (vars: V) => Promise<R>,
  opts: { invalidate?: string[]; onSuccess?: (data: R, vars: V) => void } = {},
) {
  const [state, setState] = useState<MutationState<R>>({ pending: false, error: undefined, data: undefined });
  const optsRef = useRef({ fn, ...opts });
  optsRef.current = { fn, ...opts };

  /** Throws on failure (use in async handlers that show their own error). */
  const mutateAsync = useCallback(async (vars: V): Promise<R> => {
    const o = optsRef.current;
    setState((s) => ({ ...s, pending: true, error: undefined }));
    try {
      const data = await o.fn(vars);
      setState({ pending: false, error: undefined, data });
      o.onSuccess?.(data, vars);
      await Promise.all((o.invalidate ?? []).map(invalidate));
      return data;
    } catch (error) {
      setState({ pending: false, error: error as Error, data: undefined });
      throw error;
    }
  }, []);
  /** Never rejects: the error lands in `error` (fire-and-forget from onClick). */
  const mutate = useCallback((vars: V) => mutateAsync(vars).catch(() => undefined), [mutateAsync]);
  const reset = useCallback(() => setState({ pending: false, error: undefined, data: undefined }), []);
  return { ...state, mutate, mutateAsync, reset };
}
