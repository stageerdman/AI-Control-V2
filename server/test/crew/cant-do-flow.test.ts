/* `cant_do` end to end: a builder that lacks a tool, access or permission says so once, and its item stops and goes
   straight back to the orchestrator with the reason — no review round, no resubmitting work that can never pass. */
import { afterEach, describe, expect, it } from 'vitest';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import type { testApp } from '../helpers.ts';
import { BOB, COLUMBO, commit, type Ev, isReview, isRunOf, studio, until } from './aurora-studio.ts';

const REFUSED = {
  lacks: 'permission',
  reason: 'npm install is refused in my shell, and the Pensieve needs sqlite.',
};

describe('cant_do: a builder without what its item needs stops at once', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('one attempt, no review: the item is back with Pixel, who sees why and gives it to Bob', async () => {
    const specs: RunSpec[] = [];
    const s = studio((app, spec) => {
      specs.push(spec);
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      if (!isRunOf(app, spec, COLUMBO)) return commit(spec, 'pensieve.txt');
      return [{ tool: 'cant_do', args: REFUSED }, { result: 'I lack the permission; handed it back.' }];
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const id = r.body.items[0].id as string;
    await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.agentId === 'a-pixel' && i.status === 'todo',
    );
    await until(
      () => h.runtime.liveCount(),
      (n) => n === 0,
    );
    await new Promise((x) => setTimeout(x, 50)); // let Columbo's run wrap up

    /* stopped after Columbo's one run: nothing went to review, nobody rebuilt it */
    expect(work.item(id)).toMatchObject({
      agentId: 'a-pixel',
      status: 'todo',
      buildRunId: null,
      sendBacks: 0,
    });
    expect(specs.filter(isReview)).toHaveLength(0);
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as { id: string; agentId: string }[];
    expect(runs.map((x) => x.agentId)).toEqual([COLUMBO]);
    const why = "Captain Semicolon can't do it — no permission: npm install is refused in my shell";
    const handoffs = (h.events.after('project', 'aurora') as Ev[]).filter((e) => e.type === 'handoff');
    expect(handoffs.map((e) => `${e.payload.kind}:${e.payload.from}→${e.payload.to}`)).toEqual([
      `handover:${COLUMBO}→a-pixel`,
    ]);
    expect(String(handoffs[0]?.payload.note)).toContain(why);

    /* Pixel sees why: on the whiteboard and in its chat */
    const thread = await h.call('GET', '/projects/aurora/threads/a-pixel/messages');
    expect(JSON.stringify(thread.body)).toContain(why);
    const board = await s.director('whiteboard', {});
    expect(board).toMatch(/\[waiting for a new owner\] Build the Pensieve — Pixel/);
    expect(board).toContain(`Why: ${why}`);

    /* and gives it a new owner, who builds it on the same branch and goes to review as usual */
    expect(await s.director('edit_task', { task: id, owner: 'Baron' })).toContain('Now Baron von Backup');
    const done = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done' || i.status === 'failed',
    );
    expect(done).toMatchObject({ status: 'done', agentId: BOB });
    expect(specs.filter(isReview)).toHaveLength(1);
  }, 20_000);

  it('is refused outside one’s own build: a reviewer’s cant_do leaves the item alone', async () => {
    const s = studio((_app, spec) =>
      isReview(spec)
        ? [{ tool: 'cant_do', args: REFUSED }, { result: '{"verdict":"approve","notes":"Good."}' }]
        : commit(spec, 'pensieve.txt'),
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const done = await until(
      () => workRepo(h.db).item(r.body.items[0].id) as ChecklistItem,
      (i) => i.status === 'done' || i.status === 'failed',
    );
    expect(done).toMatchObject({ status: 'done', agentId: COLUMBO });
  }, 20_000);
});
