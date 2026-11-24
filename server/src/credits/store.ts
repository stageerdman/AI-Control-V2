/* The readings on record (limit_readings): one row per window, written only when that window's reading changed,
   kept 8 days (older rows go on write). Studio-wide: there is one account. */
import type { Db } from '../db/connection.ts';
import { tx } from '../db/connection.ts';
import { rows } from '../db/util.ts';
import type { LimitReading } from './reading.ts';

export const KEEP_MS = 8 * 86_400_000;

/** One window's reading as stored. */
export type StoredReading = {
  at: string;
  window: string;
  used: number;
  resetsAt: string;
  status: string | null;
  overage: boolean;
};

const same = (a: StoredReading, b: StoredReading) =>
  a.used === b.used && a.resetsAt === b.resetsAt && a.status === b.status && a.overage === b.overage;

export function limitStore(db: Db) {
  const select = (where: string, order: string, ...args: string[]): StoredReading[] =>
    rows<Omit<StoredReading, 'overage'> & { overage: number }>(
      db
        .prepare(
          `SELECT at, window, used, resets_at AS resetsAt, status, overage FROM limit_readings ${where} ORDER BY ${order}`,
        )
        .all(...args),
    ).map((r) => ({ ...r, overage: r.overage === 1 }));
  const latest = (window: string) => select('WHERE window = ?', 'at DESC, rowid DESC LIMIT 1', window)[0];

  return {
    /** Store what changed; true when anything did. */
    record(reading: LimitReading): boolean {
      return tx(db, () => {
        const insert = db.prepare(
          'INSERT INTO limit_readings (at, window, used, resets_at, status, overage) VALUES (?, ?, ?, ?, ?, ?)',
        );
        let changed = false;
        for (const w of reading.windows) {
          const row: StoredReading = { at: reading.at, window: w.name, ...w, overage: reading.overage };
          const last = latest(w.name);
          if (last && same(last, row)) continue;
          insert.run(row.at, row.window, row.used, row.resetsAt, row.status, row.overage ? 1 : 0);
          changed = true;
        }
        if (changed)
          db.prepare('DELETE FROM limit_readings WHERE at < ?').run(
            new Date(Date.parse(reading.at) - KEEP_MS).toISOString(),
          );
        return changed;
      });
    },
    /** Every reading on record, oldest first. */
    all: (): StoredReading[] => select('', 'at, rowid'),
  };
}
export type LimitStore = ReturnType<typeof limitStore>;
