/* Tasks wait for the tasks they depend on, end to end: a dependent task never starts while its dependency is still
   building, in review or merging; it starts once that lands; when the dependency fails or stops as stuck it stays on
   hold and the orchestrator's stall alert names it and what it waits on. Independent tasks still run side by side. */
import { afterEach, describe, expect, it } from 'vitest';
import { type Goal, workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import type { testApp } from '../helpers.ts';
import { alerts, BOB, CHECKED, COLUMBO, commit, isReview, studio, until, verdict } from './aurora-studio.ts';

type App = ReturnType<typeof testApp>;
const ORCH = 'a-pixel';
const itemText = (s: RunSpec) => /Your checklist item: (.*)/.exec(s.task)?.[1] ?? '';
const task = (text: string, assignee: string, parallel = false) => ({
  text,
  assignee,
  ...(assignee === COLUMBO ? { teamId: 'ship-it' } : {}),
  brief: text,
  parallel,
});

/** Aurora with these tasks; `build` answers each build run, reviews take `verdicts` in turn (else approve).
    `seen`: each task's status, when each build started. */
function aurora(
  items: object[],
  build: (text: string, s: RunSpec) => FakeStep[],
  verdicts: FakeStep[][] = [],
) {
  const seen: Record<string, Record<string, string>> = {};
  const s = studio(
    (h, spec) => {
      if (isReview(spec)) return verdicts.shift() ?? verdict('approve', 'Good.');
      const text = itemText(spec);
      const all = ['todo', 'running', 'done', 'failed', 'cancelled'] as const;
      seen[text] = Object.fromEntries(
        all.flatMap((st) =>
          workRepo(h.db)
            .projectItems('aurora', st)
            .map((i) => [i.text, st]),
        ),
      );
      return build(text, spec);
    },
    { summary: 'In order.', items },
  );
  return { h: s.h, seen };
}

/** Start the goal → a fresh read of it. */
async function start(h: App) {
  const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
  return () => workRepo(h.db).goal(r.body.items[0].goalId as string) as Goal;
}
/** Wait until the goal stops (or `stopped` says so) and nothing runs, then a moment more for repeats. */
async function settled(h: App, goal: () => Goal, stopped = (g: Goal) => g.status !== 'running') {
  await until(goal, stopped, 15_000);
  await until(
    () => h.runtime.liveCount(),
    (n) => n === 0,
    15_000,
  );
  await new Promise((r) => setTimeout(r, 150));
  return goal();
}

describe('tasks wait for the tasks they depend on', () => {
  let h: App;
  afterEach(() => h.close());

  it('never starts while its dependency builds, is reviewed or merges; starts once it has landed', async () => {
    const s = aurora([task('Make the vault', COLUMBO), task('Make the memories', BOB)], (text, spec) =>
      text === 'Make the vault'
        ? [{ wait: 300 }, ...commit(spec, 'vault.txt')]
        : commit(spec, 'memories.txt'),
    );
    h = s.h;
    const g = await settled(h, await start(h));
    expect(g.items.map((i) => i.status)).toEqual(['done', 'done']);
    expect(s.seen['Make the memories']?.['Make the vault']).toBe('done');
    const merged = (h.events.after('project', 'aurora') as { type: string; payload: { itemId?: string } }[])
      .filter((e) => e.type === 'item.merged')
      .map((e) => e.payload.itemId);
    expect(merged).toEqual(g.items.map((i) => i.id)); // the vault merged first, then the memories
  }, 30_000);

  it('tasks that depend on nothing still run side by side', async () => {
    const s = aurora([task('Make the vault', COLUMBO), task('Make the vial', BOB, true)], (text, spec) =>
      text === 'Make the vault' ? [{ wait: 400 }, ...commit(spec, 'vault.txt')] : commit(spec, 'vial.txt'),
    );
    h = s.h;
    s.h.store.projects.update('aurora', { workflows: [{ ...CHECKED, gates: [] }] });
    const g = await settled(h, await start(h));
    expect(g.items.map((i) => i.status)).toEqual(['done', 'done']);
    expect(s.seen['Make the vial']?.['Make the vault']).toBe('running');
  }, 30_000);

  it('its dependency fails: it is held at once (even while its agent is busy), never starts, and the alert names it', async () => {
    const s = aurora(
      [task('Make the vault', COLUMBO), task('Polish the vial', BOB, true), task('Make the memories', BOB)],
      (text, spec) =>
        text === 'Make the vault'
          ? [{ fail: 'npm test: vault.test.ts failed' }]
          : [{ wait: 600 }, ...commit(spec, 'vial.txt')],
    );
    h = s.h;
    s.h.store.projects.update('aurora', { workflows: [{ ...CHECKED, gates: [] }] });
    const goal = await start(h);
    await until(
      () => alerts(h),
      (a) => a.length > 0,
      15_000,
    );
    /* the vial still builds with Bob, yet the memories are already on hold */
    expect(goal().items.map((i) => i.status)).toEqual(['failed', 'running', 'cancelled']);
    const g = await settled(h, goal);
    expect(g.items.map((i) => i.status)).toEqual(['failed', 'done', 'cancelled']);
    expect(s.seen['Make the memories']).toBeUndefined();
    const [first] = alerts(h);
    expect(first).toMatchObject({ orchestratorId: ORCH, kind: 'failed' });
    expect(String(first?.text)).toContain(
      "On hold, because a task they depend on didn't finish: “Make the memories” (waits on “Make the vault”).",
    );
  }, 30_000);

  it('its dependency stops as stuck: it stays waiting, never starts, and the stuck alert names it', async () => {
    const SQLITE = 'The vault needs sqlite, but it is not installed.';
    const s = aurora(
      [task('Make the vault', COLUMBO), task('Make the memories', BOB)],
      (text, spec) => commit(spec, `${text.split(' ').at(-1)}-${Date.now()}.txt`),
      [verdict('changes', SQLITE), verdict('changes', SQLITE)],
    );
    h = s.h;
    s.h.store.projects.update('aurora', { workflows: [{ ...CHECKED, maxSendBacks: 2 }] });
    const g = await settled(h, await start(h), (x) => x.items[0]?.agentId === ORCH);
    expect(g.status).toBe('running');
    expect(g.items[1]?.status).toBe('todo');
    expect(s.seen['Make the memories']).toBeUndefined();
    const [a, ...more] = alerts(h);
    expect(more).toEqual([]);
    expect(a).toMatchObject({ orchestratorId: ORCH, kind: 'stuck' });
    expect(String(a?.text)).toContain(
      "On hold, because a task they depend on didn't finish: “Make the memories” (waits on “Make the vault”).",
    );
  }, 30_000);
});
