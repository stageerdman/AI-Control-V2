/* Small shared helpers for the repositories. */
import type { Db } from './connection.ts';

export const now = () => new Date().toISOString();

/** Next append position in an ordered table (whitelisted names only — never user input). */
export function nextPosition(db: Db, table: 'roles' | 'agents' | 'teams' | 'projects'): number {
  const r = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${table}`).get() as { p: number };
  return r.p;
}

export function exists(
  db: Db,
  table: 'roles' | 'agents' | 'teams' | 'projects' | 'drafts',
  id: string,
): boolean {
  return db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id) !== undefined;
}

/** Stored JSON that no longer parses reads as none: an old shape must never break a read. */
export function readJson<T>(
  raw: string | null | undefined,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): T | null {
  if (!raw) return null;
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? (r.data as T) : null;
  } catch {
    return null;
  }
}

export type Row = Record<string, unknown>;
export const rows = <T>(r: unknown) => r as T[];
export const row = <T>(r: unknown) => r as T | undefined;
