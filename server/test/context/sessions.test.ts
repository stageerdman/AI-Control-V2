/* Every CLI session of a run gets a run_sessions row: how it began, its context (first, peak, last) and its own
   usage. A forget gives two rows (new, then forget); a resume records the gap since its old session ended. The
   office's summary and one run's sessions are served by the API. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const NOTE = { where: 'cart.ts', doing: 'the button', next: 'wire it' };

describe('run sessions', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const app = (script: (spec: RunSpec) => FakeStep[]) => {
    h = testApp({ seed: true, runner: fakeRunner(script) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
  };
  const sessionsOf = async (runId: string) =>
    (await h.call('GET', `/projects/aurora/runs/${runId}/sessions`)).body.sessions;

  it('a forget run has two sessions: new, then forget — each with its own context and usage', async () => {
    app((s) =>
      s.task.startsWith('You chose to forget')
        ? [{ tokens: { input: 9_000, output: 5 } }, { result: 'Wired it.' }]
        : [
            { tokens: { input: 12_000, output: 10 } },
            { tokens: { input: 30_000, output: 10 } },
            { tokens: { input: 25_000, output: 10 } },
            { tool: 'forget', args: NOTE },
            { wait: 5000 },
          ],
    );
    const r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'Build.' })).body;
    await h.runtime.settled(r.id);
    const [first, second, ...rest] = await sessionsOf(r.id);
    expect(rest).toEqual([]);
    expect(first).toMatchObject({
      n: 1,
      startedBy: 'new',
      turns: 3,
      firstContext: 12_000,
      peakContext: 30_000,
      lastContext: 25_000,
      endedBy: 'forget',
    });
    expect(first.usage.input).toBe(67_000);
    expect(second).toMatchObject({
      n: 2,
      startedBy: 'forget',
      why: 'Fresh start from my note',
      turns: 1,
      firstContext: 9_000,
      endedBy: 'succeeded',
    });

    const sum = (await h.call('GET', '/projects/aurora/context?range=all')).body;
    expect(sum.agents[0]).toMatchObject({ agentId: 'a-pete', sessions: 2, turns: 4, peakContext: 30_000 });
    expect(sum.agents[0].starts).toMatchObject({ new: 1, forget: 1 });
    expect(sum.coldStart).toBe(10_500);
  });

  it('a resumed run records why it began and the gap since its old session ended', async () => {
    app(() => [{ tokens: { input: 1_000, output: 5 } }, { result: 'ok' }]);
    const a = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'one' })).body;
    await h.runtime.settled(a.id);
    const b = (
      await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'two', resumeRunId: a.id })
    ).body;
    await h.runtime.settled(b.id);
    const [s] = await sessionsOf(b.id);
    expect(s).toMatchObject({ startedBy: 'resume', turns: 1 });
    expect(s.resumedGapMs).toBeGreaterThanOrEqual(0);
    expect(s.resumedGapMs).toBeLessThan(60_000);
  });

  it("another project's run is not served", async () => {
    app(() => [{ result: 'ok' }]);
    const r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go' })).body;
    await h.runtime.settled(r.id);
    const other = h.store.projects.list().find((p) => p.id !== 'aurora');
    if (!other) return;
    expect((await h.call('GET', `/projects/${other.id}/runs/${r.id}/sessions`)).status).toBe(404);
  });
});
