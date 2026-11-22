/* Stall alerts end to end: when work stalls — a task fails, is sent back the maximum number of times, stops as stuck,
   or its goal stops partway — Aurora's orchestrator (Pixel) hears it at once, once per stop, with why it stopped and
   what is already done. A step limit the studio carries on from is not a stall. */
import { afterEach, describe, expect, it } from 'vitest';
import { type Goal, workRepo } from '../../src/db/work.ts';
import { backgroundTimeoutError } from '../../src/runtime/background.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import { turnCapError } from '../../src/runtime/limits.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import type { testApp } from '../helpers.ts';
import { alerts, CHECKED, COLUMBO, commit, isReview, LINT, studio, until, verdict } from './aurora-studio.ts';

type App = ReturnType<typeof testApp>;
const ORCH = 'a-pixel';
const APPROVE = verdict('approve', 'Good.');
const itemText = (s: RunSpec) => /Your checklist item: (.*)/.exec(s.task)?.[1] ?? '';
const LOG = [
  ...Array.from({ length: 30 }, (_, i) => `  ✓ keeps memory ${i}`),
  'FAIL test/pensieve.test.ts > recalls a memory',
  'AssertionError: expected undefined to be "the first flight"',
  'Tests  1 failed | 30 passed',
].join('\n');

/** Aurora: builds answered by `build(spec, n)` (n: the nth build run), reviews in turn from `verdicts`. */
function aurora(build: (s: RunSpec, n: number) => FakeStep[], verdicts: FakeStep[][] = [], plan?: object) {
  let builds = 0;
  return studio((_h, s) => (isReview(s) ? (verdicts.shift() ?? APPROVE) : build(s, ++builds)), plan);
}

/** Start the goal; wait until it stops (or `stopped` says so) and nothing runs, then a moment more for repeats. */
async function run(h: App, stopped: (g: Goal) => boolean = (g) => g.status !== 'running') {
  const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
  const goalId = r.body.items[0].goalId as string;
  const goal = () => workRepo(h.db).goal(goalId) as Goal;
  await until(goal, stopped, 15_000);
  await until(
    () => h.runtime.liveCount(),
    (n) => n === 0,
    15_000,
  );
  await new Promise((r) => setTimeout(r, 150));
  return goal();
}

describe('stall alerts reach the orchestrator', () => {
  let h: App;
  afterEach(() => h.close());

  it('a task fails: one alert to Pixel with the failing test output, trimmed, and the kept branch', async () => {
    const s = aurora((spec) => {
      commit(spec, 'pensieve.txt');
      return [{ fail: LOG }];
    });
    h = s.h;
    const g = await run(h);
    expect(g.status).toBe('failed');
    const [a, ...more] = alerts(h);
    expect(more).toEqual([]);
    expect(a).toMatchObject({ orchestratorId: ORCH, kind: 'failed', itemId: g.items[0]?.id });
    const text = String(a?.text);
    expect(text).toContain('The task “Build the Pensieve” on the goal “Build the Pensieve” failed.');
    expect(text).toContain('AssertionError: expected undefined to be "the first flight"');
    expect(text).not.toContain('keeps memory 3');
    expect(text).toContain('The goal stopped with it.');
    expect(text).toMatch(
      /Done so far: Nothing is finished yet\. Stopped work is kept on branch studio\/\S+\./,
    );
  }, 30_000);

  it('sent back the maximum number of times: the alert carries the reviewer’s last notes', async () => {
    const s = aurora(
      (spec, n) => commit(spec, `pensieve-${n}.txt`),
      [
        verdict('changes', 'Add a test for empty memories.'),
        verdict('changes', 'Name the store module by its job.'),
      ],
    );
    h = s.h;
    const g = await run(h);
    expect(g.status).toBe('failed');
    const [a, ...more] = alerts(h);
    expect(more).toEqual([]);
    expect(a).toMatchObject({ orchestratorId: ORCH, kind: 'sent-back' });
    const text = String(a?.text);
    expect(text).toContain('was sent back the maximum number of times.');
    expect(text).toContain(
      "Why: Sent back 2 times (the limit is 1). The reviewer's last notes: Name the store module by its job.",
    );
    expect(text).toMatch(
      /Done so far: Nothing is finished yet\. Stopped work is kept on branch studio\/\S+\./,
    );
  }, 30_000);

  it('stops as stuck at the step limit: the alert names the limit that was hit', async () => {
    const s = aurora(() => [{ fail: turnCapError(40) }]);
    h = s.h;
    const g = await run(h);
    expect(g.status).toBe('failed');
    const [a, ...more] = alerts(h);
    expect(more).toEqual([]);
    expect(a).toMatchObject({ orchestratorId: ORCH, kind: 'stuck' });
    const text = String(a?.text);
    expect(text).toContain('stopped as stuck.');
    expect(text).toContain('Why: A limit was hit: Stopped: no new work (a commit, a report or a desk note)');
    expect(text).toContain('Done so far: Nothing is finished yet.');
  }, 30_000);

  it('Sea GPS: background tests that never finish stop the task once, as stuck, telling Pixel why', async () => {
    const waited = backgroundTimeoutError(45 * 60_000, [{ id: 'b1', description: 'npm run e2e' }]);
    const s = aurora(() => [{ fail: waited }]);
    h = s.h;
    const g = await run(h);
    expect(g.status).toBe('failed');
    expect(g.items[0]?.sendBacks).toBe(0); // never sent to review on a "still running" answer
    const [a, ...more] = alerts(h);
    expect(more).toEqual([]);
    expect(a).toMatchObject({ orchestratorId: ORCH, kind: 'stuck' });
    expect(String(a?.text)).toContain(
      'Why: A limit was hit: Stopped: waited 45 minutes for its background command (npm run e2e) to finish; they never did.',
    );
  }, 30_000);

  it('stops as stuck on the same review note twice: the alert has both notes; the goal waits for a new owner', async () => {
    const SQLITE = 'The Pensieve needs sqlite, but it is not installed.';
    const s = aurora(
      (spec, n) => commit(spec, `pensieve-${n}.txt`),
      [verdict('changes', SQLITE), verdict('changes', SQLITE)],
    );
    h = s.h;
    s.h.store.projects.update('aurora', { workflows: [{ ...CHECKED, maxSendBacks: 2 }] });
    const g = await run(h, (x) => x.items[0]?.agentId === ORCH);
    expect(g.status).toBe('running');
    const [a, ...more] = alerts(h);
    expect(more).toEqual([]);
    expect(a).toMatchObject({ orchestratorId: ORCH, kind: 'stuck' });
    const text = String(a?.text);
    expect(text).toContain(`First: ${SQLITE}`);
    expect(text).toContain(`Second: ${SQLITE}`);
    expect(text).not.toContain('The goal stopped with it.');
    expect(text).toContain('Done so far: Nothing is finished yet.');
  }, 30_000);

  it('a goal stops partway: the task’s alert at once, then the goal’s with what finished, merged and never started', async () => {
    const item = (text: string, assignee: string, teamId: string, parallel = false) => ({
      text,
      assignee,
      teamId,
      brief: text,
      parallel,
    });
    const plan = {
      summary: 'Four steps.',
      items: [
        item('Make the vault', COLUMBO, 'ship-it'),
        item('Make the memories', COLUMBO, 'ship-it'),
        item('Make the vial', LINT, 'polish', true),
        item('Make the recall', COLUMBO, 'ship-it'),
      ],
    };
    const s = aurora(
      (spec) => {
        const t = itemText(spec);
        if (t === 'Make the memories') return [{ fail: 'npm test: 2 failed — memories.test.ts' }];
        const file = `${t.split(' ').at(-1)}.txt`;
        return t === 'Make the vial' ? [{ wait: 400 }, ...commit(spec, file)] : commit(spec, file);
      },
      [],
      plan,
    );
    h = s.h;
    s.h.store.projects.update('aurora', { workflows: [{ ...CHECKED, gates: [] }] });
    const g = await run(h);
    expect(g.items.map((i) => i.status)).toEqual(['done', 'failed', 'done', 'cancelled']);
    const [task, goal, ...more] = alerts(h);
    expect(more).toEqual([]);
    expect(task).toMatchObject({ orchestratorId: ORCH, kind: 'failed', itemId: g.items[1]?.id });
    expect(String(task?.text)).toContain('Why: npm test: 2 failed — memories.test.ts');
    expect(String(task?.text)).toContain('Done so far: Finished: “Make the vault”.');
    expect(String(task?.text)).toContain(
      "On hold, because a task they depend on didn't finish: “Make the recall” (waits on “Make the memories”).",
    );
    expect(goal).toMatchObject({ orchestratorId: ORCH, kind: 'goal-stopped' });
    expect(goal?.itemId).toBeUndefined();
    const text = String(goal?.text);
    expect(text).toContain('The goal “Build the Pensieve” stopped partway.');
    expect(text).toContain('Why: “Make the memories” failed: npm test: 2 failed — memories.test.ts');
    expect(text).toContain(
      "On hold, because a task they depend on didn't finish: “Make the recall” (waits on “Make the memories”).",
    );
    expect(text).toContain('Finished: “Make the vault”, “Make the vial”.');
    expect(text).toMatch(/Merged into main: “Make the vault” \(\S+\), “Make the vial” \(\S+\)\./);
  }, 30_000);

  it('a step limit that carries on in a fresh session sends no alert', async () => {
    const s = aurora((spec, n) => {
      commit(spec, `pensieve-${n}.txt`);
      return n === 1 ? [{ fail: turnCapError(40) }] : [{ result: 'Built it.' }];
    });
    h = s.h;
    const g = await run(h);
    expect(g.status).toBe('done');
    expect(alerts(h)).toEqual([]);
  }, 30_000);
});
