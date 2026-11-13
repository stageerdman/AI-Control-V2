/* SQLite via built-in node:sqlite. One connection per process; foreign keys on. */
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.ts';

export type Db = DatabaseSync;

/** Open (and migrate) a database. Pass ':memory:' in tests. */
export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

/** Run fn in a transaction; rolls back on throw. Not re-entrant (nested calls just join). */
export function tx<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function dbHealthy(db: Db): boolean {
  try {
    return (db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined)?.ok === 1;
  } catch {
    return false;
  }
}
