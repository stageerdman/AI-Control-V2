/* Restart a task fresh from main (No Silent Stuck Tasks): retries that carry on in the same session and checkout
   can keep going nowhere (Sea GPS). A fresh restart retires the checkout — unmerged work kept on a renamed
   branch — and the next build starts from main's tip in a new session. */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import type { testApp } from '../helpers.ts';
import { commit, git, isReview, studio, until, verdict } from './aurora-studio.ts';

const LONG: FakeStep[] = [{ wait: 10_000 }, { result: 'never' }];

/** The builder commits `first.txt` and is sent back until it fails; any later build is approved. */
function failsThenFresh() {
  const builds: { spec: RunSpec; sawFirst: boolean; sawMain: boolean }[] = [];
  let failedOnce = false;
  let reviews = 0;
  const s = studio((_h, spec) => {
    if (isReview(spec))
      return failedOnce ? verdict('approve', 'Good.') : verdict('changes', `Not yet (${++reviews}).`);
    builds.push({
      spec,
      sawFirst: existsSync(join(spec.cwd, 'first.txt')),
      sawMain: existsSync(join(spec.cwd, 'main.txt')),
    });
    return commit(spec, builds.length === 1 ? 'first.txt' : `again-${builds.length}.txt`);
  });
  return { s, builds, failNoMore: () => (failedOnce = true) };
}

async function failedItem(h: ReturnType<typeof testApp>) {
  const work = workRepo(h.db);
  const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
  const id = r.body.items[0].id as string;
  const failed = await until(
    () => work.item(id) as ChecklistItem,
    (i) => i.status === 'failed',
  );
  return { work, id, goalId: r.body.id as string, failed };
}

describe('restart a task fresh from main', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('keeps the old work on a renamed branch and builds again from main in a new session', async () => {
    const { s, builds, failNoMore } = failsThenFresh();
    h = s.h;
    const { work, id, failed } = await failedItem(h);
    const branch = failed.workspace?.branch as string;
    const repo = join(h.config.sandbox, 'aurora');
    /* main moved on meanwhile */
    writeFileSync(join(repo, 'main.txt'), 'main\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'main moved');
    failNoMore();

    const r = await h.call('POST', `/projects/aurora/tasks/${id}/restart-fresh`);
    expect(r.status).toBe(202);
    expect(r.body.keptOn).toBe(`${branch}-before-restart-1`);
    expect(git(repo, 'log', '--format=%s', r.body.keptOn)).toContain('first.txt');

    const done = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done' || (i.status === 'failed' && builds.length > 1),
    );
    expect(done.status, done.note ?? '').toBe('done');
    const fresh = builds.at(-1) as (typeof builds)[number];
    expect(fresh.spec.resumeSessionId).toBeUndefined();
    expect(fresh).toMatchObject({ sawMain: true, sawFirst: false });
    expect(fresh.spec.task).toContain('Your checklist item'); // a first brief, not a carry-on
  }, 20_000);

  it('Pixel can do it with edit_task fresh: true', async () => {
    const { s, builds, failNoMore } = failsThenFresh();
    h = s.h;
    const { work, id } = await failedItem(h);
    failNoMore();
    const said = await s.director('edit_task', { task: id, fresh: true });
    expect(said).toContain('starts over from main');
    const done = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done',
    );
    expect(done.sendBacks).toBe(0);
    expect(builds.at(-1)?.sawFirst).toBe(false);
  }, 20_000);

  it('is refused while the task runs', async () => {
    const s = studio(() => LONG);
    h = s.h;
    const work = workRepo(h.db);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const id = r.body.items[0].id as string;
    await until(
      () => work.item(id)?.runId,
      (x) => Boolean(x),
    );
    const refused = await h.call('POST', `/projects/aurora/tasks/${id}/restart-fresh`);
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.body)).toMatch(/stop it first/);
  }, 20_000);
});
