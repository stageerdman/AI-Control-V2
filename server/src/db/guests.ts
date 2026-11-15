/* Guests (STUDIO LIFE): Cast agents the user brought into a project themselves, with their own brief.
   `orchestratorMay` = the director may also give them work; otherwise only the user directs them. */
import type { Db } from './connection.ts';
import { rows } from './util.ts';

export type Guest = {
  projectId: string;
  agentId: string;
  brief: string;
  orchestratorMay: boolean;
  addedAt: string;
};
type Row = {
  project_id: string;
  agent_id: string;
  brief: string;
  orchestrator_may: number;
  added_at: string;
};
const toGuest = (r: Row): Guest => ({
  projectId: r.project_id,
  agentId: r.agent_id,
  brief: r.brief,
  orchestratorMay: !!r.orchestrator_may,
  addedAt: r.added_at,
});

/* A guest whose agent sits in the trash is kept (it comes back on restore) but not seen. */
const LIVE = 'agent_id NOT IN (SELECT id FROM agents WHERE deleted_at IS NOT NULL)';

export function guestsRepo(db: Db) {
  return {
    list: (projectId: string): Guest[] =>
      rows<Row>(
        db
          .prepare(`SELECT * FROM project_guests WHERE project_id = ? AND ${LIVE} ORDER BY added_at, rowid`)
          .all(projectId),
      ).map(toGuest),
    get(projectId: string, agentId: string): Guest | null {
      const r = db
        .prepare(`SELECT * FROM project_guests WHERE project_id = ? AND agent_id = ? AND ${LIVE}`)
        .get(projectId, agentId) as Row | undefined;
      return r ? toGuest(r) : null;
    },
    /** The ids the director may plan with (only guests it's allowed to use), or every guest. */
    ids: (projectId: string, onlyOrchestratorMay = false): string[] =>
      rows<{ agent_id: string }>(
        db
          .prepare(
            `SELECT agent_id FROM project_guests WHERE project_id = ? AND ${LIVE}${onlyOrchestratorMay ? ' AND orchestrator_may = 1' : ''} ORDER BY added_at, rowid`,
          )
          .all(projectId),
      ).map((r) => r.agent_id),
    put(g: Omit<Guest, 'addedAt'>): Guest {
      db.prepare(
        `INSERT INTO project_guests (project_id, agent_id, brief, orchestrator_may, added_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id, agent_id) DO UPDATE SET brief = excluded.brief, orchestrator_may = excluded.orchestrator_may`,
      ).run(g.projectId, g.agentId, g.brief, g.orchestratorMay ? 1 : 0, new Date().toISOString());
      return this.get(g.projectId, g.agentId) as Guest;
    },
    remove: (projectId: string, agentId: string): boolean =>
      db.prepare('DELETE FROM project_guests WHERE project_id = ? AND agent_id = ?').run(projectId, agentId)
        .changes > 0,
  };
}
export type GuestsRepo = ReturnType<typeof guestsRepo>;
