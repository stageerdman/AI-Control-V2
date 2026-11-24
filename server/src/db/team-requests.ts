/* Team requests (One-Step Team Building): work a director handed to the Agent Creator after the user's yes in chat.
   The yes is kept word for word with its time; once built, the request links to everything made from it (the team,
   its new agents and roles), so the user can find it, change it, or undo the whole build. */
import { randomUUID } from 'node:crypto';
import type { UserYes } from '../office/user-yes.ts';
import type { Db } from './connection.ts';
import { now, row, rows } from './util.ts';

/** What one request built. `restoreTokens`: the trash tokens of an undo (to bring it all back). */
export type Built = { teamId: string; agentIds: string[]; roleIds: string[]; restoreTokens?: string[] };
export type TeamRequest = {
  id: string;
  projectId: string;
  directorId: string;
  work: string;
  yes: UserYes;
  createdAt: string;
  built: Built | null;
  builtAt: string | null;
  undoneAt: string | null;
};
type Row = {
  id: string;
  project_id: string;
  director_id: string;
  work: string;
  yes_words: string;
  yes_at: string;
  yes_message_id: string;
  created_at: string;
  built: string | null;
  built_at: string | null;
  undone_at: string | null;
};
const toRequest = (r: Row): TeamRequest => ({
  id: r.id,
  projectId: r.project_id,
  directorId: r.director_id,
  work: r.work,
  yes: { words: r.yes_words, at: r.yes_at, messageId: r.yes_message_id },
  createdAt: r.created_at,
  built: r.built ? (JSON.parse(r.built) as Built) : null,
  builtAt: r.built_at,
  undoneAt: r.undone_at,
});

export function teamRequestsRepo(db: Db) {
  const get = (id: string): TeamRequest | null => {
    const r = row<Row>(db.prepare('SELECT * FROM team_requests WHERE id = ?').get(id));
    return r ? toRequest(r) : null;
  };
  return {
    get,
    list: (projectId: string): TeamRequest[] =>
      rows<Row>(
        db.prepare('SELECT * FROM team_requests WHERE project_id = ? ORDER BY created_at, rowid').all(projectId),
      ).map(toRequest),
    create(a: { projectId: string; directorId: string; work: string; yes: UserYes }): TeamRequest {
      const id = `tr-${randomUUID().slice(0, 8)}`;
      db.prepare(
        `INSERT INTO team_requests (id, project_id, director_id, work, yes_words, yes_at, yes_message_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, a.projectId, a.directorId, a.work, a.yes.words, a.yes.at, a.yes.messageId, now());
      return get(id) as TeamRequest;
    },
    markBuilt(id: string, built: Built): void {
      db.prepare('UPDATE team_requests SET built = ?, built_at = ?, undone_at = NULL WHERE id = ?').run(
        JSON.stringify(built),
        now(),
        id,
      );
    },
    markUndone(id: string, built: Built): void {
      db.prepare('UPDATE team_requests SET built = ?, undone_at = ? WHERE id = ?').run(
        JSON.stringify(built),
        now(),
        id,
      );
    },
  };
}
export type TeamRequestsRepo = ReturnType<typeof teamRequestsRepo>;
