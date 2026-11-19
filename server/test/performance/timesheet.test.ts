/* GET /projects/:id/timesheet and /estimate: each task, goal and feature with its real times, and a guess for new
   work from finished ones. Migration 43 links older runs to their items. */
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { testApp } from '../helpers.ts';

const T0 = Date.parse('2026-11-19T09:00:00.000Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

describe('GET /projects/:id/timesheet', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const goal = (id: string, status: string, featureId: string | null = null) =>
    h.db
      .prepare(
        `INSERT INTO goals (id, project_id, text, status, feature_id, created_at, updated_at)
         VALUES (?, 'aurora', ?, ?, ?, ?, ?)`,
      )
      .run(id, `Goal ${id}`, status, featureId, at(0), at(0));
  const item = (id: string, goalId: string, agentId: string, status: string) =>
    h.db
      .prepare(
        `INSERT INTO checklist_items (id, goal_id, project_id, position, text, brief, agent_id, status, created_at, updated_at)
         VALUES (?, ?, 'aurora', 1, ?, 'b', ?, ?, ?, ?)`,
      )
      .run(id, goalId, `Task ${id}`, agentId, status, at(0), at(0));
  const run = (id: string, itemId: string | null, agentId: string, from: number, to: number) =>
    h.db
      .prepare(
        `INSERT INTO runs (id, project_id, agent_id, task, status, runner, caps, turns, started_at, ended_at, item_id,
                           input_tokens, output_tokens)
         VALUES (?, 'aurora', ?, 't', 'succeeded', 'fake', '{}', 1, ?, ?, ?, 1000, 100)`,
      )
      .run(id, agentId, at(from), at(to), itemId);

  it('an office with no work: empty lists, no guesses; unknown office → 404', async () => {
    h = testApp({ seed: true });
    const r = await h.call('GET', '/projects/aurora/timesheet');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      tasks: [],
      goals: [],
      estimates: { task: null, goal: null, feature: null },
    });
    expect((await h.call('GET', '/projects/nope/timesheet')).status).toBe(404);
    expect((await h.call('GET', '/projects/nope/estimate')).status).toBe(404);
  });

  it('finished goals roll up and feed the guess for a new goal, task and feature', async () => {
    h = testApp({ seed: true });
    h.db
      .prepare(
        `INSERT INTO features (id, project_id, name, status, position, created_at, updated_at)
         VALUES ('f1', 'aurora', 'Search', 'shipped', 1, ?, ?)`,
      )
      .run(at(0), at(0));
    for (const [n, min] of [
      [1, 10],
      [2, 20],
      [3, 30],
    ] as const) {
      goal(`g${n}`, 'done', 'f1');
      item(`i${n}`, `g${n}`, 'a-semic', 'done');
      run(`r${n}`, `i${n}`, 'a-semic', n * 100, n * 100 + min);
    }
    run('chat', null, 'a-pixel', 0, 5); // not a task's work
    const sheet = (await h.call('GET', '/projects/aurora/timesheet')).body;
    expect(sheet.tasks).toHaveLength(3);
    expect(sheet.goals[1]).toMatchObject({
      goalId: 'g2',
      featureId: 'f1',
      status: 'done',
      tasks: 1,
      time: { startedAt: at(200), endedAt: at(220), activeMs: 20 * 60_000, tokens: 1100, runs: 1 },
    });
    expect(sheet.features[0]).toMatchObject({ featureId: 'f1', goals: 3, time: { activeMs: 60 * 60_000 } });
    expect(sheet.estimates.goal).toMatchObject({ basis: 3, ms: { typical: 20 * 60_000 } });
    expect(sheet.estimates.feature).toBeNull(); // one shipped feature is not enough to guess from

    const e = (await h.call('GET', '/projects/aurora/estimate?agentId=a-semic')).body;
    expect(e.task).toMatchObject({ from: 'agent', basis: 3, tokens: { typical: 1100 } });
    expect((await h.call('GET', '/projects/aurora/estimate?agentId=a-lint')).body.task.from).toBe('office');
  });
});

describe('migration 43', () => {
  it('links an older run to the item that points at it', () => {
    // plain rows only: no project or agent needed to check the back-fill
    const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
    const before = MIGRATIONS.findIndex((sql) => sql.includes('ALTER TABLE runs ADD COLUMN item_id'));
    for (const sql of MIGRATIONS.slice(0, before)) db.exec(sql);
    db.exec(`PRAGMA user_version = ${before}`);
    db.exec(`INSERT INTO goals (id, project_id, text, status, created_at, updated_at)
             VALUES ('g', 'p', 'G', 'done', '${at(0)}', '${at(0)}')`);
    for (const id of ['built', 'reviewed', 'loose'])
      db.exec(`INSERT INTO runs (id, project_id, agent_id, task, status, runner, caps, started_at)
               VALUES ('${id}', 'p', 'a', 't', 'succeeded', 'fake', '{}', '${at(0)}')`);
    db.exec(`INSERT INTO checklist_items (id, goal_id, project_id, position, text, brief, agent_id, status,
                                          run_id, build_run_id, created_at, updated_at)
             VALUES ('i', 'g', 'p', 1, 'x', 'b', 'a', 'done', 'reviewed', 'built', '${at(0)}', '${at(0)}')`);
    migrate(db);
    expect(db.prepare('SELECT id, item_id FROM runs ORDER BY id').all()).toEqual([
      { id: 'built', item_id: 'i' },
      { id: 'loose', item_id: null },
      { id: 'reviewed', item_id: 'i' },
    ]);
    db.close();
  });
});
