/* Builder preflight in the flow (No Silent Stuck Tasks): a fresh build whose checkout can't be built or tested
   never starts a session — it goes back to the orchestrator at once, with why. */
import { afterEach, describe, expect, it } from 'vitest';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import type { testApp } from '../helpers.ts';
import { alerts, commit, isReview, studio, until, verdict } from './aurora-studio.ts';

describe('builder preflight', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it("a checkout that can't build stops before any run and goes to the orchestrator with why", async () => {
    const checked: string[] = [];
    let builds = 0;
    const s = studio(
      (_h, spec) => {
        if (isReview(spec)) return verdict('approve', 'Good.');
        builds++;
        return commit(spec, 'x.txt');
      },
      undefined,
      undefined,
      {
        preflight: async (cwd) => {
          checked.push(cwd);
          return ["package.json needs npm, but it isn't on PATH."];
        },
      },
    );
    h = s.h;
    const work = workRepo(h.db);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const id = r.body.items[0].id as string;
    const back = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.agentId === 'a-pixel',
    );
    expect(back).toMatchObject({ status: 'todo', runId: null });
    expect(back.note).toContain("package.json needs npm, but it isn't on PATH.");
    expect(checked).toEqual([back.workspace?.cwd]);
    expect(builds).toBe(0);
    /* the alert goes out just after the handover settles (background.soon) */
    const sent = await until(
      () => alerts(h),
      (a) => a.length > 0,
    );
    expect(sent).toContainEqual(
      expect.objectContaining({ kind: 'stuck', itemId: id, text: expect.stringContaining('needs npm') }),
    );
  }, 20_000);

  it('a checkout with no problems builds as usual', async () => {
    const s = studio(
      (_h, spec) => (isReview(spec) ? verdict('approve', 'Good.') : commit(spec, 'x.txt')),
      undefined,
      undefined,
      { preflight: async () => [] },
    );
    h = s.h;
    const work = workRepo(h.db);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const id = r.body.items[0].id as string;
    const done = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done' || i.status === 'failed',
    );
    expect(done.status, done.note ?? '').toBe('done');
  }, 20_000);
});
