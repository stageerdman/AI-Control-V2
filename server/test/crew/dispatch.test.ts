import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDispatch } from '../../src/crew/dispatch.ts';
import { workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { type Answer, scriptedCrew } from './brain.ts';

/* Aurora: teams ship-it (captain a-semic) + polish (captain a-lint); specialists a-baron, a-query, a-merge */
const PLAN = {
  summary: 'API first, then tidy, then deploy.',
  items: [
    {
      text: 'Build the /search endpoint',
      assignee: 'a-semic',
      teamId: 'ship-it',
      brief: 'Typed endpoint + tests.',
    },
    {
      text: 'Build the /checkout endpoint',
      assignee: 'a-semic',
      teamId: 'ship-it',
      brief: 'Typed endpoint + tests.',
    },
    { text: 'Tidy the storefront code', assignee: 'a-lint', teamId: 'polish', brief: 'Dead code out.' },
    { text: 'Prepare a preview deploy', assignee: 'a-baron', brief: 'Preview with rollback.' },
  ],
};

function studio(
  answers: Record<string, Answer[]>,
  work?: (s: RunSpec) => FakeStep[],
  maxConcurrent?: number,
) {
  const crew = scriptedCrew(answers, work);
  const h = testApp({ seed: true, runner: crew.runner, ...(maxConcurrent ? { maxConcurrent } : {}) });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { h, crew };
}
async function settled(h: ReturnType<typeof testApp>, goalId: string) {
  for (let i = 0; i < 400; i++) {
    const g = (await h.call('GET', `/projects/aurora/work/${goalId}`)).body;
    if (g.status !== 'running') return g;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('goal never settled');
}

describe('dispatch: goal → checklist → runs', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('briefs captains/specialists, runs ≤ 2 at a time and one per agent, ticks items off, settles the goal', async () => {
    let peak = 0;
    const s = studio({ dispatch: [PLAN] }, (spec) => {
      peak = Math.max(peak, h.runtime.liveCount());
      return [
        { wait: 20 },
        { tokens: { input: 10, output: 5 } },
        { result: `Did: ${spec.task.split('\n')[2]}` },
      ];
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Ship search and checkout' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      text: 'Ship search and checkout',
      summary: PLAN.summary,
      status: 'running',
    });
    expect(r.body.items.map((i: { status: string }) => i.status)).toEqual([
      'running',
      'todo',
      'running',
      'todo',
    ]);
    const done = await settled(h, r.body.id);
    expect(done.status).toBe('done');
    expect(done.pct).toBe(100);
    expect(done.items.every((i: { status: string; runId: string }) => i.status === 'done' && i.runId)).toBe(
      true,
    );
    expect(done.items[0].note).toBe('Did: Your checklist item: Build the /search endpoint');
    expect(peak).toBe(2);
    expect(h.store.projects.require('aurora').progress).toBe(100);

    // runs went through the B5 runtime with the captain's team context; Semicolon's two items ran one after the other
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as {
      agentId: string;
      teamId: string | null;
      startedAt: string;
      endedAt: string;
      task: string;
    }[];
    expect(runs).toHaveLength(4);
    const semic = runs
      .filter((x) => x.agentId === 'a-semic')
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    expect(semic.map((x) => x.teamId)).toEqual(['ship-it', 'ship-it']);
    expect((semic[1]?.startedAt as string) >= (semic[0]?.endedAt as string)).toBe(true);
    expect(semic[0]?.task).toMatch(
      /^Goal from Pixel \(your orchestrator\): Ship search and checkout[\s\S]*You are the captain of The Ship-It Squad/,
    );
    expect(runs.find((x) => x.agentId === 'a-baron')?.teamId).toBeNull();

    // the orchestrator planned without tools, from the project's staffing
    const [plan] = s.crew.crewCalls();
    expect(plan?.tools).toEqual([]);
    expect(plan?.task).toContain('"captain":{"id":"a-semic","name":"Captain Semicolon"}');
    expect(plan?.task).toContain('"specialists":[{"id":"a-baron"');

    // the office saw it: goal, items, progress, then the goal settling
    const ev = h.events.after('project', 'aurora');
    const types = ev.map((e) => e.type);
    expect(types.filter((t) => t === 'checklist.item').length).toBe(4 + 4 + 4); // todo, running, done
    expect(types.indexOf('goal.changed')).toBeLessThan(types.indexOf('checklist.item'));
    expect(ev.filter((e) => e.type === 'progress').at(-1)?.payload).toEqual({
      pct: 100,
      label: PLAN.summary,
    });
    expect(ev.filter((e) => e.type === 'goal.changed').at(-1)?.payload).toEqual({
      goalId: r.body.id,
      status: 'done',
    });
    expect((await h.call('GET', '/projects/aurora/work')).body).toHaveLength(1);
  });

  it('only captains and specialists: an item for a plain team member is sent back once, then refused', async () => {
    const member = {
      ...PLAN,
      items: [{ text: 'UI', assignee: 'a-pete', teamId: 'ship-it', brief: 'Build it.' }],
    };
    const noTeam = { ...PLAN, items: [{ text: 'API', assignee: 'a-semic', brief: 'Build it.' }] };
    const s = studio({ dispatch: [member, PLAN, member, noTeam] });
    h = s.h;
    const ok = await h.call('POST', '/projects/aurora/work', { goal: 'Ship it' });
    expect(ok.status).toBe(201);
    expect(s.crew.crewCalls()[1]?.task).toContain(
      "Pixel Pete is not the captain of team 'ship-it' on this project — brief a team through its captain",
    );
    await settled(h, ok.body.id);
    const bad = await h.call('POST', '/projects/aurora/work', { goal: 'Again' });
    expect(bad.status).toBe(502);
    expect(bad.body.error.details.issues).toEqual([
      'items.0: Captain Semicolon captains ship-it — set "teamId"',
    ]);
    expect((await h.call('GET', '/projects/aurora/work')).body).toHaveLength(1);
  });

  it('a failed run fails its item; the rest still run; the goal ends failed', async () => {
    const s = studio({ dispatch: [PLAN] }, (spec) =>
      spec.task.includes('/checkout') ? [{ fail: 'tests are red' }] : [{ result: 'ok' }],
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Ship', caps: { maxTurns: 8 } });
    expect(r.body.caps).toEqual({ maxTurns: 8 });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('failed');
    expect(g.items.map((i: { status: string }) => i.status)).toEqual(['done', 'failed', 'done', 'done']);
    expect(g.items[1].note).toBe('tests are red');
    expect(g.pct).toBe(75);
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as { caps: { maxTurns: number } }[];
    expect(runs.every((x) => x.caps.maxTurns === 8)).toBe(true);
  });

  it('cancel: queued items are cancelled, live runs stopped', async () => {
    const s = studio({ dispatch: [PLAN] }, () => [{ wait: 5000 }, { result: 'never' }], 1);
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Ship' });
    expect(r.body.items.map((i: { status: string }) => i.status)).toEqual([
      'running',
      'todo',
      'todo',
      'todo',
    ]);
    expect((await h.call('POST', `/projects/aurora/work/${r.body.id}/cancel`)).status).toBe(202);
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('cancelled');
    expect(g.items.every((i: { status: string }) => i.status === 'cancelled')).toBe(true);
    expect((await h.call('POST', `/projects/aurora/work/${r.body.id}/cancel`)).status).toBe(409);
  });

  it('refuses early (before paying for a plan): no folder, nobody staffed, unknown project', async () => {
    const s = studio({ dispatch: [] });
    h = s.h;
    expect((await h.call('POST', '/projects/atlas/work', { goal: 'x' })).status).toBe(409); // no folder
    h.store.projects.update('aurora', { teamIds: [], agentIds: [] });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'x' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Nobody staffs this project/);
    expect((await h.call('POST', '/projects/ghost/work', { goal: 'x' })).status).toBe(404);
    expect((await h.call('POST', '/projects/aurora/work', { goal: '' })).status).toBe(422);
    expect(s.crew.crewCalls()).toHaveLength(0);
  });

  it('after a restart nothing is restarted on its own: running → failed, queued → cancelled', async () => {
    h = testApp({ seed: true });
    const work = workRepo(h.db);
    const g = work.insertGoal({ id: 'g1', projectId: 'aurora', text: 't', summary: 's' }, [
      { id: 'i1', text: 'a', brief: 'b', agentId: 'a-semic', teamId: 'ship-it' },
      { id: 'i2', text: 'c', brief: 'd', agentId: 'a-baron', teamId: null },
    ]);
    work.setItem('i1', { status: 'running', runId: 'r1' });
    const crew = { call: async () => ({}) } as never;
    createDispatch({ db: h.db, store: h.store, events: h.events, crew, runtime: h.runtime }).recover();
    const after = work.goal(g.id);
    expect(after?.status).toBe('failed');
    expect(after?.items.map((i) => [i.status, i.note])).toEqual([
      ['failed', 'Interrupted: the studio restarted'],
      ['cancelled', 'Interrupted: the studio restarted'],
    ]);
  });
});
