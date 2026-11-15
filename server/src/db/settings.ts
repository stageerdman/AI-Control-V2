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

/** A free-text meta value (e.g. 'hq_project'); null when unset. */
export function metaValue(db: Db, key: string) {
  return {
    get(): string | null {
      const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
      return r?.value || null;
    },
    set(value: string | null): void {
      if (value === null) db.prepare('DELETE FROM meta WHERE key = ?').run(key);
      else
        db.prepare(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ).run(key, value);
    },
  };
}
