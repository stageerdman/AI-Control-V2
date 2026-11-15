/* RUNNING end-to-end on the FakeRunner: runs are on the list exactly while they live (finished, failed,
   cancelled, or a runner that throws on start), per project; agents see and stop their own with
   my_runs / cancel_run. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { createRunning } from '../../src/running/registry.ts';
import { runningTools } from '../../src/running/tools.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { Runner, RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

function studio(runner: Runner) {
  const h = testApp({ seed: true, runner });
  for (const p of ['aurora', 'atlas']) {
    mkdirSync(join(h.config.sandbox, p));
    h.store.projects.update(p, { folder: p });
  }
  return h;
}
const running = async (h: ReturnType<typeof testApp>, project: string, agentId?: string) =>
  (await h.call('GET', `/projects/${project}/running${agentId ? `?agentId=${agentId}` : ''}`)).body as {
    id: string;
    kind: string;
    agentId: string;
    runId?: string;
    label: string;
  }[];
const texts = (h: ReturnType<typeof testApp>, runId: string) =>
  getChatMessages(h.db, runId)
    .filter((m) => m.role === 'assistant')
    .map((m) => m.text);

describe('the running list, end to end', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('a run is listed in its own project while it lives, and gone once it succeeds, fails or is cancelled', async () => {
    const scripts: Record<string, FakeStep[]> = {
      ok: [{ wait: 30 }, { result: 'done' }],
      bad: [{ wait: 30 }, { fail: 'boom' }],
      long: [{ wait: 5000 }, { result: 'never' }],
    };
    h = studio(fakeRunner((s) => scripts[s.task] as FakeStep[]));
    const ok = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'ok' })).body;
    const bad = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-scar', task: 'bad' })).body;
    const long = (await h.call('POST', '/projects/atlas/runs', { agentId: 'a-pete', task: 'long' })).body;

    expect((await running(h, 'aurora')).map((i) => i.runId).sort()).toEqual([ok.id, bad.id].sort());
    expect((await running(h, 'aurora', 'a-pete')).map((i) => i.runId)).toEqual([ok.id]);
    expect((await running(h, 'atlas')).map((i) => [i.kind, i.runId, i.label])).toEqual([
      ['session', long.id, 'long'],
    ]);

    await h.runtime.settled(ok.id);
    await h.runtime.settled(bad.id);
    expect(await running(h, 'aurora')).toEqual([]);

    const item = (await running(h, 'atlas'))[0];
    expect((await h.call('POST', `/projects/aurora/running/${item?.id}/cancel`)).status).toBe(404); // another project's
    expect((await h.call('POST', `/projects/atlas/running/${item?.id}/cancel`)).status).toBe(202);
    expect((await h.runtime.settled(long.id)).status).toBe('cancelled');
    expect(await running(h, 'atlas')).toEqual([]);
    expect((await h.call('POST', `/projects/atlas/running/${item?.id}/cancel`)).status).toBe(404);
  });

  it('a runner that throws on start: the run ends failed and is never left on the list', async () => {
    h = studio({
      name: 'broken',
      start: () => {
        throw new Error('spawn exploded');
      },
    });
    const r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' })).body;
    expect(await h.runtime.settled(r.id)).toMatchObject({ status: 'failed', error: 'spawn exploded' });
    expect(await running(h, 'aurora')).toEqual([]);
    expect(h.runtime.busy('aurora', 'a-pete')).toBe(false);
  });

  it('an agent lists its own runs across projects and cancels another of its sessions — not its current one', async () => {
    const other: { id?: string } = {};
    h = studio(
      fakeRunner((s: RunSpec) =>
        s.task === 'long'
          ? [{ wait: 5000 }, { result: 'never' }]
          : [
              { tool: 'my_runs', args: {} },
              { tool: 'cancel_run', args: { id: 'self' } }, // replaced below once the id is known
              { tool: 'cancel_run', args: other },
              { result: 'ok' },
            ],
      ),
    );
    const long = (await h.call('POST', '/projects/atlas/runs', { agentId: 'a-pete', task: 'long' })).body;
    await h.call('POST', '/projects/aurora/runs', { agentId: 'a-scar', task: 'long' }); // someone else's
    other.id = (await running(h, 'atlas', 'a-pete'))[0]?.id;
    const me = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'tidy up' })).body;
    await h.runtime.settled(me.id);

    const said = texts(h, me.id);
    const listed = (said[0] as string).split('\n').map((l) => JSON.parse(l));
    expect(
      listed.map((i: { project: string; what: string; current?: boolean }) => [
        i.project,
        i.what,
        !!i.current,
      ]),
    ).toEqual([
      ['Atlas Analytics', 'long', false],
      ['Aurora Storefront', 'tidy up', true],
    ]);
    expect(said[1]).toMatch(/cancel_run refused: .*not found/); // 'self' is no id of theirs
    expect(said[2]).toMatch(/Stopping session "long"/);
    expect((await h.runtime.settled(long.id)).status).toBe('cancelled');
    expect((await running(h, 'aurora')).map((i) => i.agentId)).toEqual(['a-scar']); // untouched
  });

  it('cancel_run refuses the calling session itself', async () => {
    h = studio(fakeRunner(() => []));
    const r = createRunning({ procs: () => [] });
    const mine = r.add({
      kind: 'session',
      projectId: 'aurora',
      agentId: 'a-pete',
      label: 'x',
      runId: 'run-1',
      cancel: () => {
        throw new Error('should not cancel');
      },
    });
    const cancel = runningTools(r, { agentId: 'a-pete', runId: 'run-1' }, () => 'Aurora').find(
      (t) => t.name === 'cancel_run',
    );
    await expect(cancel?.run({ id: mine.id })).rejects.toThrow(/your current session/);
  });
});
