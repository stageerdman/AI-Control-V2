/* The whiteboard repository: goals and their checklist items (plain SQL, no rules —
   src/crew/dispatch.ts owns those). */
import type { Db } from './connection.ts';
import { now } from './util.ts';

export type GoalStatus = 'running' | 'done' | 'failed' | 'cancelled';
export type ItemStatus = 'todo' | 'running' | 'done' | 'failed' | 'cancelled';
export type ChecklistItem = {
  id: string;
  goalId: string;
  projectId: string;
  position: number;
  text: string;
  brief: string;
  agentId: string;
  teamId: string | null;
  status: ItemStatus;
  runId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Goal = {
  id: string;
  projectId: string;
  text: string;
  summary: string;
  status: GoalStatus;
  items: ChecklistItem[];
  /** done / total, 0–100. */
  pct: number;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;
const toItem = (r: Row): ChecklistItem => ({
  id: r.id as string,
  goalId: r.goal_id as string,
  projectId: r.project_id as string,
  position: r.position as number,
  text: r.text as string,
  brief: r.brief as string,
  agentId: r.agent_id as string,
  teamId: (r.team_id as string) ?? null,
  status: r.status as ItemStatus,
  runId: (r.run_id as string) ?? null,
  note: (r.note as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function workRepo(db: Db) {
  const items = (goalId: string) =>
    (
      db.prepare('SELECT * FROM checklist_items WHERE goal_id = ? ORDER BY position').all(goalId) as Row[]
    ).map(toItem);
  const toGoal = (r: Row): Goal => {
    const its = items(r.id as string);
    return {
      id: r.id as string,
      projectId: r.project_id as string,
      text: r.text as string,
      summary: r.summary as string,
      status: r.status as GoalStatus,
      items: its,
      pct: its.length ? Math.round((its.filter((i) => i.status === 'done').length / its.length) * 100) : 0,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  };

  const repo = {
    goal(id: string): Goal | null {
      const r = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Row | undefined;
      return r ? toGoal(r) : null;
    },
    goals: (projectId: string): Goal[] =>
      (
        db
          .prepare('SELECT * FROM goals WHERE project_id = ? ORDER BY created_at DESC, rowid DESC')
          .all(projectId) as Row[]
      ).map(toGoal),
    insertGoal(
      g: Pick<Goal, 'id' | 'projectId' | 'text' | 'summary'>,
      list: Pick<ChecklistItem, 'id' | 'text' | 'brief' | 'agentId' | 'teamId'>[],
    ): Goal {
      const t = now();
      db.prepare(
        `INSERT INTO goals (id, project_id, text, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?)`,
      ).run(g.id, g.projectId, g.text, g.summary, t, t);
      const ins = db.prepare(
        `INSERT INTO checklist_items (id, goal_id, project_id, position, text, brief, agent_id, team_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?)`,
      );
      list.forEach((i, n) => {
        ins.run(i.id, g.id, g.projectId, n, i.text, i.brief, i.agentId, i.teamId, t, t);
      });
      return repo.goal(g.id) as Goal;
    },
    setGoalStatus: (id: string, status: GoalStatus) =>
      db.prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id),
    item(id: string): ChecklistItem | null {
      const r = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) as Row | undefined;
      return r ? toItem(r) : null;
    },
    itemByRun(runId: string): ChecklistItem | null {
      const r = db.prepare('SELECT * FROM checklist_items WHERE run_id = ?').get(runId) as Row | undefined;
      return r ? toItem(r) : null;
    },
    /** Items of a project in a status, oldest goal first, then checklist order. */
    projectItems: (projectId: string, status: ItemStatus): ChecklistItem[] =>
      (
        db
          .prepare(
            `SELECT i.* FROM checklist_items i JOIN goals g ON g.id = i.goal_id
             WHERE i.project_id = ? AND i.status = ? ORDER BY g.created_at, g.rowid, i.position`,
          )
          .all(projectId, status) as Row[]
      ).map(toItem),
    setItem(id: string, patch: { status: ItemStatus; runId?: string | null; note?: string | null }) {
      const cur = repo.item(id);
      if (!cur) return;
      db.prepare(
        'UPDATE checklist_items SET status = ?, run_id = ?, note = ?, updated_at = ? WHERE id = ?',
      ).run(
        patch.status,
        patch.runId === undefined ? cur.runId : patch.runId,
        patch.note === undefined ? cur.note : patch.note,
        now(),
        id,
      );
    },
    /** Projects with checklist work in flight or queued. */
    activeProjects: (): string[] =>
      (
        db
          .prepare("SELECT DISTINCT project_id FROM checklist_items WHERE status IN ('todo', 'running')")
          .all() as { project_id: string }[]
      ).map((r) => r.project_id),
  };
  return repo;
}
export type WorkRepo = ReturnType<typeof workRepo>;
