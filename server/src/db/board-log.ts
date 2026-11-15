/* The whiteboard's change log (plain SQL): who changed the board, what, when. A removal files the rows it took
   off; they can be put back for UNDO_MS, after which the snapshot is dropped and only the log line stays. */
import { randomUUID } from 'node:crypto';
import type { Db } from './connection.ts';
import { now, type Row, rows } from './util.ts';
import type { BoardSnapshot } from './work.ts';

export const UNDO_MS = 24 * 3600 * 1000;

export type BoardChange = {
  id: string;
  projectId: string;
  /** Who made the change (an agent id). */
  actor: string;
  action: string;
  summary: string;
  at: string;
  /** A removal that can still be put back. */
  undoable: boolean;
  /** When it was put back (null: it wasn't). */
  undoneAt: string | null;
};
export type NewChange = Pick<BoardChange, 'projectId' | 'actor' | 'action' | 'summary'> & {
  snapshot?: BoardSnapshot;
};

const toChange = (r: Row): BoardChange => ({
  id: r.id as string,
  projectId: r.project_id as string,
  actor: r.actor as string,
  action: r.action as string,
  summary: r.summary as string,
  at: r.created_at as string,
  undoable: !!r.snapshot && !r.undone_at,
  undoneAt: (r.undone_at as string | null) ?? null,
});

export function boardLog(db: Db) {
  /** Snapshots past their undo time go; the log lines stay. */
  const expire = () =>
    db
      .prepare('UPDATE board_changes SET snapshot = NULL WHERE snapshot IS NOT NULL AND created_at < ?')
      .run(new Date(Date.now() - UNDO_MS).toISOString());

  const log = {
    record(c: NewChange): BoardChange {
      expire();
      const id = randomUUID();
      db.prepare(
        'INSERT INTO board_changes (id, project_id, actor, action, summary, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id,
        c.projectId,
        c.actor,
        c.action,
        c.summary,
        c.snapshot ? JSON.stringify(c.snapshot) : null,
        now(),
      );
      return log.get(id) as BoardChange;
    },
    get(id: string): BoardChange | null {
      const r = db.prepare('SELECT * FROM board_changes WHERE id = ?').get(id) as Row | undefined;
      return r ? toChange(r) : null;
    },
    /** Newest first. */
    list(projectId: string, limit = 20): BoardChange[] {
      expire();
      return rows<Row>(
        db
          .prepare(
            'SELECT * FROM board_changes WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
          )
          .all(projectId, limit),
      ).map(toChange);
    },
    /** The rows a removal took off, while it can still be undone. */
    snapshotOf(id: string): BoardSnapshot | null {
      expire();
      const r = db.prepare('SELECT snapshot FROM board_changes WHERE id = ? AND undone_at IS NULL').get(id) as
        | { snapshot: string | null }
        | undefined;
      return r?.snapshot ? (JSON.parse(r.snapshot) as BoardSnapshot) : null;
    },
    markUndone: (id: string) =>
      db.prepare('UPDATE board_changes SET undone_at = ?, snapshot = NULL WHERE id = ?').run(now(), id),
  };
  return log;
}
export type BoardLog = ReturnType<typeof boardLog>;
