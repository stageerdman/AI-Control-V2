/* Studio-wide on/off settings kept in `meta` (absent = the default). */
import type { Db } from './connection.ts';

/** One switch in `meta` under `key`; reads `defaultOn` until it's set. */
export function metaFlag(db: Db, key: string, defaultOn = true) {
  return {
    get(): boolean {
      const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
      return r ? r.value === '1' : defaultOn;
    },
    set(on: boolean): void {
      db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(key, on ? '1' : '0');
    },
  };
}
export type MetaFlag = ReturnType<typeof metaFlag>;
