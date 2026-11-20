/* End to end, the SuperCut Swift build check (honest task completion, domain/real-work.ts):
   the agent first replies with only a plan, then runs `swift build` and hits the step limit midway, then finishes
   in a fresh session. Played twice: as a whiteboard goal, and handed over face to face with `work: true`.
   Either way the task stays open until real work happened and shows done exactly once, at the very end. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { turnCapError } from '../../src/runtime/limits.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

type App = ReturnType<typeof testApp>;
type Seen = { spec: RunSpec; status?: string; continues?: number };

const PLAN_ONLY = 'First I will run swift build, then swift test, then report the result.';
const GREEN = 'swift build and swift test are green.';

/** The Swift build check's sessions, in order: a plan, then a build cut by the step limit, then the finish.
    `now` reads the task as it is when each session starts. */
function swiftBuildCheck(now: () => ChecklistItem | undefined) {
  const seen: Seen[] = [];
  const play = (spec: RunSpec): FakeStep[] => {
    const it = now();
    seen.push({ spec, status: it?.status, continues: it?.continues });
    if (seen.length === 1) return [{ result: PLAN_ONLY }];
    if (seen.length === 2)
      return [{ activity: { kind: 'running', label: 'swift build' } }, { fail: turnCapError(120) }];
    return [{ activity: { kind: 'running', label: 'swift test' } }, { result: GREEN }];
  };
  return { seen, play };
}

const itemsOf = (h: App, projectId: string) =>
  workRepo(h.db)
    .goals(projectId)
    .flatMap((g) => g.items);

async function until(check: () => boolean) {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((ok) => setTimeout(ok, 10));
  expect(check()).toBe(true);
}

/** Every status the office was shown for one task, in order. */
const shown = (h: App, projectId: string, itemId: string) =>
  h.events
    .after('project', projectId)
    .filter((e) => e.type === 'checklist.item')
    .map((e) => e.payload as { itemId: string; status?: string })
    .filter((p) => p.itemId === itemId)
    .map((p) => p.status);

/** The shared verdict on both cases: one task, three sessions, open until the real work, done once at the end. */
function expectHonestFinish(h: App, projectId: string, task: ChecklistItem | undefined, seen: Seen[]) {
  const [plan, capped, fresh] = seen.map((s) => s.spec);
  expect(seen).toHaveLength(3);
  // never done while it ran: the plan-only reply kept it open and carried on
  expect(seen.map(({ status, continues }) => ({ status, continues }))).toEqual([
    { status: 'running', continues: 0 },
    { status: 'running', continues: 1 },
    { status: 'running', continues: 1 },
  ]);
  // after the plan: back to work in the same session, told the plan was not the work
  expect(capped?.task).toContain('did no work');
  expect(capped?.resumeSessionId).toBe(`fake-${plan?.runId}`);
  // after the step limit: the same run carries on in a fresh session, with the task restated
  expect(fresh?.runId).toBe(capped?.runId);
  expect(fresh?.resumeSessionId).toBeUndefined();
  expect(fresh?.task).toContain('You reached the step limit of a session');
  expect(fresh?.task).toContain('Swift build check');
  // done exactly once, and only as the last thing the office saw
  expect(task).toMatchObject({ status: 'done', note: GREEN, continues: 0 });
  const statuses = shown(h, projectId, task?.id as string);
  expect(statuses.filter((s) => s === 'done')).toHaveLength(1);
  expect(statuses.at(-1)).toBe('done');
}

describe('e2e: the Swift build check finishes honestly', () => {
  let h: App;
  afterEach(() => h.close());

  it('case 1 — a whiteboard task: a plan keeps it open, the build hits the step limit, a fresh session finishes it', async () => {
    const solo = {
      summary: 'Check the Mac build.',
      items: [
        {
          text: 'Swift build check',
          assignee: 'a-baron',
          brief: 'Run swift build and swift test on the sample package; report green or red.',
        },
      ],
    };
    const check = swiftBuildCheck(() => itemsOf(h, 'aurora')[0]);
    h = testApp({ seed: true, runner: scriptedCrew({ dispatch: [solo] }, check.play).runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });

    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Run the Swift build check' });
    expect(r.status).toBe(201);
    await until(() => workRepo(h.db).goal(r.body.id)?.status !== 'running');

    const goal = (await h.call('GET', `/projects/aurora/work/${r.body.id}`)).body;
    expect(goal).toMatchObject({ status: 'done', pct: 100 });
    expectHonestFinish(h, 'aurora', itemsOf(h, 'aurora')[0], check.seen);
  });

  it('case 2 — handed over face to face with `work: true`: a real whiteboard task that runs, never instantly done', async () => {
    const twinkles = () => itemsOf(h, 'lumi').find((i) => i.agentId === 'a-twinkle');
    const check = swiftBuildCheck(twinkles);
    const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
    const handover = {
      tool: 'ask_person',
      args: { to: 'Twinkle', question: 'Run the Swift build check: swift build and swift test.', work: true },
    };
    h = testApp({
      seed: true,
      runner: fakeRunner((spec): FakeStep[] => {
        if (isChat(spec)) return [handover, { result: '{"reply":"Handed over."}' }];
        if (contractOf(spec.task)) return fakeBrain(spec);
        return check.play(spec);
      }),
    });
    mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
    h.store.projects.update('lumi', { folder: 'lumi', teamIds: [], agentIds: ['a-pete'] });
    const orch = h.store.projects.require('lumi').orchestratorId;

    const r = await h.call('POST', `/projects/lumi/threads/${orch}/messages`, {
      text: 'Have Twinkle run the Swift build check',
    });
    await h.runtime.settled(r.body.runId);

    // the handover landed on the whiteboard as Twinkle's task, with the work itself as its brief — and not done
    const landed = twinkles();
    expect(landed?.text).toBe('Run the Swift build check: swift build and swift test.');
    expect(landed?.brief).not.toContain('how you will do it');
    expect(landed?.status).not.toBe('done');

    await until(() => twinkles()?.status === 'done');
    expect(check.seen[0]?.spec.task).toContain('Run the Swift build check');
    expect(check.seen[0]?.spec.task).not.toContain('how you will do it');
    expectHonestFinish(h, 'lumi', twinkles(), check.seen);
  });
});
