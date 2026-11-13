/* In-process fan-out. Publishers (the event log; later B5's runner via the log)
   push stored events to whoever watches a stream. Synchronous and tiny on purpose;
   swap the implementation behind this interface if we ever go multi-process. */

export type Scope = 'project' | 'draft';
export type StreamKey = `${Scope}:${string}`;
export const streamKey = (scope: Scope, id: string): StreamKey => `${scope}:${id}`;

export type StoredEvent = {
  id: number;
  scope: Scope;
  scopeId: string;
  type: string;
  payload: unknown;
  at: string;
};
export type Listener = (e: StoredEvent) => void;

export interface EventBus {
  publish(e: StoredEvent): void;
  /** Returns the unsubscribe function. */
  subscribe(key: StreamKey, fn: Listener): () => void;
  listenerCount(key: StreamKey): number;
  /** Every event of every stream (in-process services, e.g. the project lifecycle). Returns the unsubscribe function. */
  subscribeAll(fn: Listener): () => void;
}

export function createBus(): EventBus {
  const subs = new Map<StreamKey, Set<Listener>>();
  const all = new Set<Listener>();
  return {
    publish(e) {
      for (const fn of [...(subs.get(streamKey(e.scope, e.scopeId)) ?? []), ...all]) {
        try {
          fn(e);
        } catch {
          /* one broken subscriber never stops the others */
        }
      }
    },
    subscribe(key, fn) {
      const set = subs.get(key) ?? new Set<Listener>();
      set.add(fn);
      subs.set(key, set);
      return () => {
        set.delete(fn);
        if (set.size === 0) subs.delete(key);
      };
    },
    listenerCount: (key) => subs.get(key)?.size ?? 0,
    subscribeAll(fn) {
      all.add(fn);
      return () => all.delete(fn);
    },
  };
}
