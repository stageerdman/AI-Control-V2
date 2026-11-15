/* B8: the collaboration design — set / designed by the orchestrator, and dispatch enforcing it:
   build → review gate(s) → done, send-backs with notes (bounded), handoff / review.* events. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { type Answer, scriptedCrew } from './brain.ts';

/* Aurora: ship-it (captain a-semic; a-pete, a-scar) + polish (captain a-lint; a-doc, a-twinkle); specialists a-baron, a-query, a-merge */
const ONE = {
  summary: 'Build it.',
  items: [{ text: 'Build the search page', assignee: 'a-semic', teamId: 'ship-it', brief: 'A page.' }],
};
const DESIGN = {
  orchestratorTalksTo: 'captains',
  gates: [{ after: 'ship-it', reviewer: 'a-lint', kind: 'quality', why: 'Keep it clean.' }],
  maxSendBacks: 1,
  summary: 'Ship-It builds, Lint checks.',
};
const approve = (notes = 'Good.') =>
  [{ result: `Checked.\n{"verdict":"approve","notes":"${notes}"}` }] as FakeStep[];
const changes = (notes: string) => [{ result: `{"verdict":"changes","notes":"${notes}"}` }] as FakeStep[];

function studio(answers: Record<string, Answer[]>, work: (s: RunSpec) => FakeStep[]) {
  const crew = scriptedCrew(answers, work);
  const h = testApp({ seed: true, runner: crew.runner });
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
const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');

describe('collaboration: design + enforcement', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('GET default, PUT by hand (422 malformed, 409 someone not on the project), event', async () => {
    h = studio({}, () => approve()).h;
    expect((await h.call('GET', '/projects/aurora/collaboration')).body).toEqual({
      collaboration: expect.objectContaining({ orchestratorTalksTo: 'captains', gates: [] }),
      designed: false,
    });
    expect((await h.call('PUT', '/projects/aurora/collaboration', { gates: 'x' })).status).toBe(422);
    const bad = await h.call('PUT', '/projects/aurora/collaboration', {
      ...DESIGN,
      gates: [{ after: '*', reviewer: 'a-prof', kind: 'quality', why: 'w' }],
    });
    expect(bad.status).toBe(409);
    expect(bad.body.error.message).toMatch(/'a-prof' is not on this project/);
    const ok = await h.call('PUT', '/projects/aurora/collaboration', DESIGN);
    expect(ok.status).toBe(200);
    expect((await h.call('GET', '/projects/aurora')).body.collaboration).toEqual(DESIGN);
    expect(
      h.events
        .after('project', 'aurora')
        .filter((e) => e.type === 'collaboration.changed')
        .at(-1)?.payload,
    ).toEqual({
      orchestratorTalksTo: 'captains',
      gates: 1,
      summary: DESIGN.summary,
    });
  });

  it('the orchestrator designs it (one crew call, repaired once on a bad reviewer)', async () => {
    const s = studio(
      {
        collaboration: [
          { reply: 'x', collaboration: { ...DESIGN, gates: [{ ...DESIGN.gates[0], reviewer: 'a-ghost' }] } },
          { reply: 'Lint checks Ship-It’s work.', collaboration: DESIGN },
        ],
      },
      () => approve(),
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/collaboration/design', { ask: 'add a quality check' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ reply: 'Lint checks Ship-It’s work.', collaboration: DESIGN });
    const [first, repair] = s.crew.crewCalls();
    expect(first?.tools).toEqual([]);
    expect(first?.task).toContain('The user asks: "add a quality check"');
    expect(repair?.task).toContain("'a-ghost' is not on this project");
    expect(h.store.projects.require('aurora').collaboration?.gates).toHaveLength(1);
  });

  it('build → review → done: the gate is snapshotted on the item, handoff + review.approved events', async () => {
    const s = studio({ dispatch: [ONE] }, (spec) =>
      isReview(spec) ? approve('Tidy.') : [{ result: 'Built it.' }],
    );
    h = s.h;
    h.store.projects.update('aurora', { collaboration: DESIGN as never });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    expect(r.body.items[0].gates).toEqual([{ reviewer: 'a-lint', kind: 'quality', why: 'Keep it clean.' }]);
    expect(s.crew.crewCalls()[0]?.task).toContain('do not add separate review or QA items');
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('done');
    expect(g.items[0]).toMatchObject({
      status: 'done',
      stage: 'review',
      gateIndex: 1,
      sendBacks: 0,
      reviews: [{ reviewer: 'a-lint', gate: 'quality', verdict: 'approve', notes: 'Tidy.' }],
    });
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as {
      agentId: string;
      teamId: string;
      task: string;
    }[];
    const review = runs.find((x) => x.agentId === 'a-lint');
    expect(review?.teamId).toBe('polish');
    expect(review?.task).toMatch(/^You are reviewing Captain Semicolon's work as the quality gate/);
    expect(review?.task).toContain("Captain Semicolon's summary: Built it.");
    const ev = h.events.after('project', 'aurora');
    expect(ev.find((e) => e.type === 'handoff')?.payload).toEqual({
      itemId: g.items[0].id,
      goalId: g.id,
      from: 'a-semic',
      to: 'a-lint',
      kind: 'review',
      gate: 'quality',
    });
    expect(ev.find((e) => e.type === 'review.approved')?.payload).toMatchObject({
      reviewerId: 'a-lint',
      notes: 'Tidy.',
    });
    // the whiteboard line shows who holds it
    const holders = ev
      .filter((e) => e.type === 'checklist.item')
      .map((e) => (e.payload as { holder?: string; stage?: string }).holder);
    expect(holders).toContain('a-lint');
  });

  it('send back with notes → the builder reworks in its own session → approved', async () => {
    let reviews = 0;
    const s = studio({ dispatch: [ONE] }, (spec) => {
      if (isReview(spec)) return ++reviews === 1 ? changes('The empty state crashes.') : approve();
      return [{ result: spec.task.includes('sent it back') ? 'Fixed the empty state.' : 'Built it.' }];
    });
    h = s.h;
    h.store.projects.update('aurora', { collaboration: DESIGN as never });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('done');
    expect(g.items[0].sendBacks).toBe(1);
    expect(g.items[0].reviews.map((x: { verdict: string }) => x.verdict)).toEqual(['changes', 'approve']);
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as {
      id: string;
      agentId: string;
      task: string;
      startedAt: string;
    }[];
    const semic = runs
      .filter((x) => x.agentId === 'a-semic')
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    expect(semic).toHaveLength(2);
    expect(semic[1]?.task).toContain('The empty state crashes.');
    // rework resumed the builder's session
    const resumed = s.crew.calls.filter((c) => c.task.includes('sent it back'));
    expect(resumed[0]?.resumeSessionId).toBe(`fake-${semic[0]?.id}`);
    // the second review knows what it asked for before
    expect(
      runs
        .filter((x) => x.agentId === 'a-lint')
        .map((x) => x.task)
        .join('\n'),
    ).toContain('You sent it back before with these notes');
    const ev = h.events.after('project', 'aurora');
    expect(ev.find((e) => e.type === 'review.changes')?.payload).toMatchObject({
      reviewerId: 'a-lint',
      notes: 'The empty state crashes.',
      sendBacks: 1,
    });
    expect(ev.filter((e) => e.type === 'handoff').map((e) => (e.payload as { kind: string }).kind)).toEqual([
      'review',
      'rework',
      'review',
      'deliver', // done → the builder reports in to the director
    ]);
  });

  it('bounded: past maxSendBacks the item fails for the user, later items are skipped', async () => {
    const two = { ...ONE, items: [...ONE.items, { ...ONE.items[0], text: 'Then the filters' }] };
    const s = studio({ dispatch: [two] }, (spec) =>
      isReview(spec) ? changes('Still broken.') : [{ result: 'Built.' }],
    );
    h = s.h;
    h.store.projects.update('aurora', { collaboration: DESIGN as never }); // maxSendBacks 1
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('failed');
    expect(g.items.map((i: { status: string }) => i.status)).toEqual(['failed', 'cancelled']);
    expect(g.items[0].sendBacks).toBe(2);
    expect(g.items[0].note).toMatch(/Sir Lint-a-lot sent it back 2 times — it needs you/);
    const last = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'review.changes')
      .at(-1);
    expect(last?.payload).toMatchObject({ sendBacks: 2, final: true });
  });

  it('report items skip the gates; "everyone" lets the orchestrator brief team members', async () => {
    const member = {
      summary: 's',
      items: [{ text: 'UI', assignee: 'a-pete', teamId: 'ship-it', brief: 'b' }],
    };
    const s = studio({ dispatch: [member] }, (spec) => (isReview(spec) ? approve() : [{ result: 'ok' }]));
    h = s.h;
    h.store.projects.update('aurora', {
      collaboration: { ...DESIGN, orchestratorTalksTo: 'everyone' } as never,
    });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'UI' });
    expect(r.status).toBe(201);
    expect(s.crew.crewCalls()[0]?.task).toContain('captains or members');
    expect((await settled(h, r.body.id)).status).toBe('done');
  });

  it('setup: the plan carries the design, placeholders resolve on accept, finish puts it on the project', async () => {
    h = testApp({ seed: true }); // the fake crew brain
    const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'Gate Test', about: 'x' })).body;
    await h.call('POST', `/drafts/${d.id}/chat`, {});
    const plan = {
      teams: [{ teamId: 'ship-it', why: 'w' }],
      newTeams: [{ brief: 'A team for testing' }],
      summary: 's',
      collaboration: {
        gates: [{ after: 'ship-it', reviewer: 'new-agent:0', kind: 'quality', why: 'w' }],
        summary: 'c',
      },
    };
    const bad = await h.call('PATCH', `/drafts/${d.id}`, { plan });
    expect(bad.status).toBe(409); // no new agent 0 in this plan
    plan.collaboration.gates = [{ after: 'new-team:0', reviewer: 'a-pete', kind: 'user-test', why: 'w' }];
    expect((await h.call('PATCH', `/drafts/${d.id}`, { plan })).status).toBe(200);
    const acc = await h.call('POST', `/drafts/${d.id}/accept`);
    const team = acc.body.minted.teams[0].id;
    expect(acc.body.plan.collaboration.gates[0]).toMatchObject({ after: team, reviewer: 'a-pete' });
    const fin = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(fin.body.project.collaboration).toMatchObject({
      orchestratorTalksTo: 'captains',
      maxSendBacks: 2,
      gates: [{ after: team, reviewer: 'a-pete', kind: 'user-test' }],
    });
  });
});
