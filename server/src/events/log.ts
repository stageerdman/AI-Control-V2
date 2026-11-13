/* The append-only event log: validate → redact secrets → insert → fan out.
   Everything that wants the office to know something goes through append(). */
import type { Db } from '../db/connection.ts';
import { type EventInput, parseEventInput } from '../domain/events.ts';
import type { EventBus, Scope, StoredEvent } from './bus.ts';
import { redactSecrets } from './redact.ts';

type Row = { id: number; scope: Scope; scope_id: string; type: string; payload: string; at: string };
const hasStrings = (v: unknown): boolean =>
  typeof v === 'string' || (v !== null && typeof v === 'object' && Object.values(v).some(hasStrings));
const toEvent = (r: Row): StoredEvent => ({
  id: r.id,
  scope: r.scope,
  scopeId: r.scope_id,
  type: r.type,
  payload: JSON.parse(r.payload),
  at: r.at,
});

export function eventLog(db: Db, bus: EventBus, secretValues: () => string[] = () => []) {
  const insert = (scope: Scope, scopeId: string, type: string, payload: unknown, at: string) => {
    const r = db
      .prepare('INSERT INTO events (scope, scope_id, type, payload, at) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .get(scope, scopeId, type, JSON.stringify(payload), at) as { id: number };
    return { id: r.id, scope, scopeId, type, payload, at } satisfies StoredEvent;
  };

  const log = {
    bus,
    /** Append and publish. Do NOT call inside a transaction that may roll back (subscribers would see a ghost). */
    append(scope: Scope, scopeId: string, input: EventInput): StoredEvent {
      const { type, payload } = parseEventInput(input);
      /* only read the secret store when there is text that could hold a secret */
      const clean = hasStrings(payload) ? redactSecrets(payload, secretValues()).value : payload;
      const e = insert(scope, scopeId, type, clean, new Date().toISOString());
      bus.publish(e);
      return e;
    },
    /** Events of one stream with id > after, oldest first. */
    after(scope: Scope, scopeId: string, after = 0, limit = 1000): StoredEvent[] {
      return (
        db
          .prepare('SELECT * FROM events WHERE scope = ? AND scope_id = ? AND id > ? ORDER BY id LIMIT ?')
          .all(scope, scopeId, after, limit) as Row[]
      ).map(toEvent);
    },
    /** Re-file a stream's events under another (draft → project at finish); new ids, same order. Tx-safe: no publish. */
    copy(from: { scope: Scope; id: string }, to: { scope: Scope; id: string }): number {
      let n = 0;
      for (const e of log.after(from.scope, from.id, 0, 100_000)) {
        insert(to.scope, to.id, e.type, e.payload, e.at);
        n++;
      }
      return n;
    },
  };
  return log;
}
export type EventLog = ReturnType<typeof eventLog>;
