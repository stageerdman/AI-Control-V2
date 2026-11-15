/* RUNNING stop, end to end on the FakeRunner: stop one agent in a project (its other projects and other agents
   carry on), and stop everything in a project (its goal queue too — nothing starts after; other projects carry
   on). Both take effect at once, not after the turn. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { Runner, RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const LONG: FakeStep[] = [{ wait: 10_000 }, { result: 'never' }];

function studio(runner: Runner) {
  const h = testApp({ seed: true, runner });
  for (const p of ['aurora', 'atlas']) {
    mkdirSync(join(h.config.sandbox, p));
    h.store.projects.update(p, { folder: p });
  }
  return h;
}
const start = async (h: ReturnType<typeof testApp>, project: string, agentId: string) =>
  (await h.call('POST', `/projects/${project}/runs`, { agentId, task: 'long' })).body.id as string;
const statusIn = (h: ReturnType<typeof testApp>, project: string, runId: string) =>
  h.runtime.get(project, runId).status;
/** Resolves with how long the run took to end after `since`. */
const endedWithin = async (h: ReturnType<typeof testApp>, runId: string, since: number) => {
  await h.runtime.settled(runId);
  return Date.now() - since;
};

describe('stopping agents', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('stops one agent in a project at once; its other project and other agents carry on', async () => {
    h = studio(fakeRunner(() => LONG));
    const mine = await start(h, 'aurora', 'a-pete');
    const theirs = await start(h, 'aurora', 'a-scar');
    const elsewhere = await start(h, 'atlas', 'a-pete');

    const t0 = Date.now();
    const r = await h.call('POST', '/projects/aurora/agents/a-pete/stop');
    expect(r.status).toBe(202);
    expect(r.body.stopped.map((i: { runId: string }) => i.runId)).toEqual([mine]);
    expect(await endedWithin(h, mine, t0)).toBeLessThan(1000); // not the 10 s turn
    expect(statusIn(h, 'aurora', mine)).toBe('cancelled');
    expect(statusIn(h, 'aurora', theirs)).toBe('running');
    expect(statusIn(h, 'atlas', elsewhere)).toBe('running');
    expect((await h.call('GET', '/projects/aurora/running?agentId=a-pete')).body).toEqual([]);

    expect((await h.call('POST', '/projects/aurora/agents/a-pete/stop')).body.stopped).toEqual([]); // nothing left
    expect((await h.call('POST', '/projects/aurora/agents/nobody/stop')).status).toBe(404);
  });

  it('stops everything in a project at once — its goal queue too — and leaves other projects running', async () => {
    const crew = scriptedCrew(
      {
        dispatch: [
          {
            summary: 'Two steps.',
            items: [
              { text: 'Step one', assignee: 'a-baron', brief: 'One.' },
              { text: 'Step two', assignee: 'a-query', brief: 'Two.' },
            ],
          },
        ],
      },
      (_: RunSpec) => LONG,
    );
    h = studio(crew.runner);
    const goal = (await h.call('POST', '/projects/aurora/work', { goal: 'Do two things' })).body;
    const byHand = await start(h, 'aurora', 'a-pete');
    const elsewhere = await start(h, 'atlas', 'a-pete');
    let live = (await h.call('GET', '/projects/aurora/running')).body as { runId: string }[];
    for (let i = 0; i < 100 && live.length < 2; i++) {
      await new Promise((x) => setTimeout(x, 5));
      live = (await h.call('GET', '/projects/aurora/running')).body;
    }
    expect(live).toHaveLength(2); // the goal's first item + the hand-started run

    const t0 = Date.now();
    const r = await h.call('POST', '/projects/aurora/stop');
    expect(r.status).toBe(202);
    expect(r.body.stopped).toHaveLength(2);
    for (const { runId } of live) expect(await endedWithin(h, runId, t0)).toBeLessThan(1000);
    expect(statusIn(h, 'aurora', byHand)).toBe('cancelled');

    /* nothing starts after: the queued second step never runs, the goal is stopped */
    await new Promise((x) => setTimeout(x, 50));
    const g = (await h.call('GET', `/projects/aurora/work/${goal.id}`)).body;
    expect(g.status).not.toBe('running');
    expect(g.items.map((i: { status: string }) => i.status)).toEqual(['cancelled', 'cancelled']);
    expect((await h.call('GET', '/projects/aurora/running')).body).toEqual([]);
    expect((await h.call('GET', '/projects/aurora/runs')).body).toHaveLength(2);

    expect(statusIn(h, 'atlas', elsewhere)).toBe('running'); // another project: untouched
  });
});
