/* STUDIO LIFE: willing forget — the note goes on the desk, the SAME run starts again with a fresh session and the
   note as its brief (the run id, its item and its total usage carry on); the nudge fires once past the threshold. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const NOTE = {
  where: 'cart.ts done, tests green',
  doing: 'the checkout button',
  next: 'wire the button to POST /orders',
};

describe('willing forget', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const app = (script: (spec: RunSpec) => FakeStep[]) => {
    const specs: RunSpec[] = [];
    h = testApp({ seed: true, runner: fakeRunner((s) => (specs.push(s), script(s))) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    return specs;
  };

  it('leaves the note on the desk and the same run continues fresh from it', async () => {
    const specs = app((s) =>
      s.task.startsWith('You chose to forget')
        ? [{ tokens: { input: 50, output: 5 } }, { result: 'Wired the button.' }]
        : [
            { tokens: { input: 900, output: 10 } },
            { tool: 'forget', args: NOTE },
            { wait: 5000 },
            { result: 'never' },
          ],
    );
    const started = (
      await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'Build checkout.' })
    ).body;
    const run = await h.runtime.settled(started.id);
    expect(run).toMatchObject({ id: started.id, status: 'succeeded', result: 'Wired the button.' });
    expect(run.turns).toBe(2); // both memories counted
    expect(specs).toHaveLength(2);
    expect(specs[1]?.runId).toBe(started.id);
    expect(specs[1]?.sessionId).toBeTruthy();
    expect(specs[1]?.sessionId).not.toBe(started.id); // a fresh session…
    expect(specs[1]?.resumeSessionId).toBeUndefined(); // …nothing resumed
    expect(specs[1]?.task).toContain('Next step: wire the button to POST /orders');
    expect(specs[1]?.task).toContain('Build checkout.'); // the original brief, for reference

    const { notes } = (await h.call('GET', '/projects/aurora/desk-notes?agentId=a-pete')).body;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ agentId: 'a-pete', runId: started.id, ...NOTE });
    expect((await h.call('GET', `/projects/aurora/desk-notes/${notes[0].id}`)).body.next).toBe(NOTE.next);
    const evs = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'desk.note' || e.type === 'run.finished');
    expect(evs.map((e) => e.type)).toEqual(['desk.note', 'run.finished']); // one finish, after the fresh start
    const comms = (await h.call('GET', '/projects/aurora/comms')).body.comms;
    expect(comms.at(-1)).toMatchObject({ kind: 'desk-note', from: 'a-pete', to: 'a-pete' });
  });

  it('a note without the next step is refused, and cancelling during a forget does not restart', async () => {
    const specs = app(() => [
      { tool: 'forget', args: { where: 'x' } },
      { tool: 'forget', args: NOTE },
      { wait: 5000 },
    ]);
    const r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go' })).body;
    await h.call('POST', `/projects/aurora/runs/${r.id}/cancel`);
    const run = await h.runtime.settled(r.id);
    expect(run.status).toBe('cancelled');
    expect(specs.length).toBeLessThanOrEqual(1);
  });

  it('nudges once when the context passes the threshold, and the CLI gets the PostToolUse hook', async () => {
    const specs = app(() => [{ tokens: { input: 130_000, output: 5 } }, { wait: 5000 }]);
    const base = await h.app.listen({ port: 0, host: '127.0.0.1' });
    const r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go' })).body;
    await new Promise((ok) => setTimeout(ok, 30));
    const spec = specs[0] as RunSpec;
    expect(spec.env.AI_STUDIO_NUDGE_URL).toBe(`${base}/internal/runs/${r.id}/nudge`);
    const ask = () =>
      fetch(spec.env.AI_STUDIO_NUDGE_URL as string, {
        headers: { 'x-run-token': spec.env.AI_STUDIO_RUN_TOKEN as string },
      }).then((x) => x.json());
    expect((await ask()).nudge).toMatch(/call `forget`/);
    expect((await ask()).nudge).toBeNull(); // once
    const args = cliArgs(spec, { askServer: 'x', nudgeHook: 'node nudge-hook.ts' });
    const settings = JSON.parse(args[args.indexOf('--settings') + 1] as string);
    expect(settings.hooks.PostToolUse[0]).toMatchObject({
      matcher: '*',
      hooks: [{ command: 'node nudge-hook.ts' }],
    });
    await h.call('POST', `/projects/aurora/runs/${r.id}/cancel`);
  });
});
