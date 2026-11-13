/* The project lifecycle (F1b): status and overall progress move on their own, from what actually happens.

   Status (a project on set — `draft` / `archived` are the user's and never touched):
     needs = an agent is waiting on the user (an open ask) · live = a run or checklist work is in flight · idle = nothing.
   Overall progress: features shipped / total when the features folder has any; else the current goal's %.
   The current goal = the newest running goal, else the newest. `target` labels what it counts towards ("v1.0").

   Driven by the event log: every run / ask / goal / feature event of a project re-reads the truth from the db,
   writes `projects.status` / `projects.progress` when they changed and announces `project.status` / `project.progress`. */
import type { Db } from '../db/connection.ts';
import { featuresRepo } from '../db/features.ts';
import type { ProjectStatus } from '../db/projects.ts';
import type { Store } from '../db/store.ts';
import { workRepo } from '../db/work.ts';
import type { EventLog } from '../events/log.ts';

const TRIGGERS = new Set([
  'run.started',
  'run.finished',
  'ask.opened',
  'ask.answered',
  'goal.changed',
  'checklist.item',
  'feature.changed',
]);

export type Progress = {
  pct: number;
  shipped: number;
  total: number;
  target: string | null;
  goal: { id: string; text: string; pct: number; status: string } | null;
};

export function createLifecycle(deps: { db: Db; store: Store; events: EventLog }) {
  const { db, store, events } = deps;
  const work = workRepo(db);
  const features = featuresRepo(db);
  const lastProgress = new Map<string, string>();
  const busy = new Set<string>();

  const count = (sql: string, id: string) => (db.prepare(sql).get(id) as { n: number }).n;

  function statusOf(projectId: string): Exclude<ProjectStatus, 'draft' | 'archived'> {
    if (count("SELECT COUNT(*) AS n FROM asks WHERE project_id = ? AND status = 'open'", projectId))
      return 'needs';
    const running =
      count("SELECT COUNT(*) AS n FROM runs WHERE project_id = ? AND status = 'running'", projectId) +
      count(
        "SELECT COUNT(*) AS n FROM checklist_items WHERE project_id = ? AND status IN ('todo', 'running')",
        projectId,
      );
    return running ? 'live' : 'idle';
  }

  function progressOf(projectId: string): Progress {
    const p = store.projects.require(projectId);
    const list = features.list(projectId);
    const shipped = list.filter((f) => f.status === 'shipped').length;
    const goals = work.goals(projectId);
    const g = goals.find((x) => x.status === 'running') ?? goals[0] ?? null;
    const goal = g ? { id: g.id, text: g.text, pct: g.pct, status: g.status } : null;
    const pct = list.length ? Math.round((shipped / list.length) * 100) : (goal?.pct ?? p.progress);
    return { pct, shipped, total: list.length, target: p.target, goal };
  }

  function refresh(projectId: string) {
    const p = store.projects.get(projectId);
    if (!p || busy.has(projectId)) return;
    busy.add(projectId);
    try {
      if (p.status !== 'draft' && p.status !== 'archived') {
        const status = statusOf(projectId);
        if (status !== p.status) {
          store.projects.update(projectId, { status });
          events.append('project', projectId, { type: 'project.status', payload: { status } });
        }
      }
      const pr = progressOf(projectId);
      const key = JSON.stringify([pr.pct, pr.shipped, pr.total, pr.target, pr.goal?.id, pr.goal?.pct]);
      if (lastProgress.get(projectId) === key) return;
      lastProgress.set(projectId, key);
      if (pr.pct !== p.progress) store.projects.update(projectId, { progress: pr.pct });
      events.append('project', projectId, {
        type: 'project.progress',
        payload: {
          pct: pr.pct,
          shipped: pr.shipped,
          total: pr.total,
          ...(pr.target ? { target: pr.target } : {}),
          ...(pr.goal ? { goalId: pr.goal.id, goalPct: pr.goal.pct } : {}),
        },
      });
    } catch {
      /* the lifecycle never breaks the event that triggered it */
    } finally {
      busy.delete(projectId);
    }
  }

  const stop = events.bus.subscribeAll((e) => {
    if (e.scope === 'project' && TRIGGERS.has(e.type)) refresh(e.scopeId);
  });

  return {
    statusOf,
    progressOf,
    refresh,
    /** After a restart (runs marked interrupted): re-read every project that has ever been worked on. */
    recover() {
      const ids = db
        .prepare(
          'SELECT id FROM projects WHERE id IN (SELECT project_id FROM runs UNION SELECT project_id FROM goals)',
        )
        .all() as { id: string }[];
      for (const { id } of ids) refresh(id);
    },
    stop,
  };
}
export type Lifecycle = ReturnType<typeof createLifecycle>;
