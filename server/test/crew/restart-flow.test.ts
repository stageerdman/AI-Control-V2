/* Restarts deliver the new brief (the Sea GPS timeline): the director stopped the work with stop_work (the goal
   showed "cancelled"), a task failed after too many review send-backs, then edit_task set it back to todo with a
   new brief — and the reviewer re-ran and failed it again within a minute; the builder never saw the brief. */
import { afterEach, describe, expect, it } from 'vitest';
import { type ChecklistItem, resumable, workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import type { testApp } from '../helpers.ts';
import { commit, isReview, studio, until, verdict } from './aurora-studio.ts';

const NEW_BRIEF = 'Store memories with a timestamp, and test the empty state.';
const LONG: FakeStep[] = [{ text: 'Starting the long e2e run.' }, { wait: 10_000 }, { result: 'never' }];

describe('restarts: the agent gets the new brief, the board keeps the true status', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('failed after too many send-backs → edit_task todo + new brief: the builder reworks it, not the reviewer', async () => {
    const builds: RunSpec[] = [];
    let reviews = 0;
    const s = studio((_app, spec) => {
      if (isReview(spec)) {
        reviews++;
        if (reviews === 1) return verdict('changes', 'Memories need a timestamp.');
        if (reviews === 2) return verdict('changes', 'The empty state crashes.');
        return verdict('approve', 'Good.');
      }
      builds.push(spec);
      return commit(spec, `${spec.runId}.txt`);
    });
    h = s.h;
    const work = workRepo(h.db);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const id = r.body.items[0].id as string;
    const failed = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'failed',
    );
    expect(failed).toMatchObject({ stage: 'review', sendBacks: 2 });
    expect(reviews).toBe(2);

    await s.director('edit_task', { task: id, status: 'todo', brief: NEW_BRIEF });
    const done = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done' || (i.status === 'failed' && reviews > 2),
    );
    expect(done).toMatchObject({ status: 'done', sendBacks: 0, brief: NEW_BRIEF });
    expect(reviews).toBe(3); // the reviewer ran once more, after the rework — not straight away

    const restart = builds.at(-1) as RunSpec;
    expect(restart.resumeSessionId).toBe(`fake-${failed.buildRunId}`);
    expect(restart.task).toContain(`Your brief now (follow this one, it may have changed): ${NEW_BRIEF}`);
    expect(restart.task).toContain('The last review notes on it: ');
    expect(restart.task).toContain('The empty state crashes.');
    expect(work.goal(r.body.id)?.status).toBe('done');
  }, 20_000);

  it('stop_work → the goal shows stopped (not cancelled), can be resumed, and its agent carries on', async () => {
    const s = studio((_app, spec) => {
      if (isReview(spec)) return verdict('approve', 'Good.');
      return spec.resumeSessionId ? commit(spec, 'pensieve.txt') : LONG;
    });
    h = s.h;
    const work = workRepo(h.db);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const goalId = r.body.id as string;
    await until(
      () => work.goal(goalId)?.items[0]?.runId,
      (id) => Boolean(id),
    );

    const owner = work.goal(goalId)?.items[0]?.agentId as string;
    expect(h.runtime.tell('aurora', owner, 'Pixel', 'Skip the tests for now')).not.toBeNull();
    await h.call('POST', '/projects/aurora/stop');
    const stopped = await until(
      () => work.goal(goalId),
      (g) => g?.status !== 'running',
    );
    expect(stopped?.status).toBe('stopped');
    expect(stopped?.items[0]?.status).toBe('cancelled');
    expect(resumable('stopped')).toBe(true);

    expect((await h.call('POST', `/projects/aurora/work/${goalId}/resume`)).status).toBe(202);
    const done = await until(
      () => work.goal(goalId),
      (g) => g?.status === 'done' || g?.status === 'failed',
    );
    expect(done?.status, done?.items[0]?.note ?? '').toBe('done');
    const resumed = s.crew.calls.find((c) => c.resumeSessionId && !isReview(c));
    expect(resumed?.task).toContain('the user stopped you, and has now asked you to continue');
    expect(resumed?.task).toContain('Your brief now (follow this one, it may have changed): Store memories.');
    /* the note sent to the stopped run is void: the resumed session is told so, and nothing still waits */
    expect(resumed?.task).toContain(
      'Notes the user or a leader sent you during earlier runs no longer apply',
    );
    expect(h.runtime.notesFor('aurora')).toEqual([]);
  }, 20_000);

  /* Regression: the stop landed while the first checkout was being made, the resume made it a second time
     ("a branch named … already exists") and the item failed. */
  it('stopped and resumed while its checkout is still being made: it starts once, on that checkout', async () => {
    const s = studio((_app, spec) => (isReview(spec) ? verdict('approve', 'Good.') : commit(spec, 'p.txt')));
    h = s.h;
    const work = workRepo(h.db);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const goalId = r.body.id as string;
    await until(
      () => work.goal(goalId)?.items[0]?.status,
      (st) => st === 'running',
    );
    await h.call('POST', '/projects/aurora/stop');
    expect(work.goal(goalId)?.status).toBe('stopped');
    expect((await h.call('POST', `/projects/aurora/work/${goalId}/resume`)).status).toBe(202);
    const done = await until(
      () => work.goal(goalId),
      (g) => g?.status === 'done' || g?.status === 'failed',
    );
    expect(done?.status, done?.items[0]?.note ?? '').toBe('done');
    expect(s.crew.calls.filter((c) => !isReview(c) && c.task.includes('Your checklist item'))).toHaveLength(
      1,
    );
  }, 20_000);

  it('cancelling a goal by hand still shows cancelled', async () => {
    const s = studio(() => LONG);
    h = s.h;
    const work = workRepo(h.db);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    await until(
      () => work.goal(r.body.id)?.items[0]?.runId,
      (id) => Boolean(id),
    );
    await h.call('POST', `/projects/aurora/work/${r.body.id}/cancel`);
    const g = await until(
      () => work.goal(r.body.id),
      (x) => x?.status !== 'running',
    );
    expect(g?.status).toBe('cancelled');
  }, 20_000);
});
