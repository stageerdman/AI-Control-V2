/* Ordered, append-only migrations tracked by PRAGMA user_version.
   Never edit a shipped migration — add a new one. */
import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS: readonly string[] = [
  /* 1 — meta */
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export function migrate(db: DatabaseSync): number {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return MIGRATIONS.length;
}
