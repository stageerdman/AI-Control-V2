/* Handovers end to end (the Pensieve case): a builder hands its item to someone else mid-build with
   `call_agent` handover: true, or the director reassigns it with edit_task. The item, its branch and its reviews
   follow the new owner; nothing goes back to the old one. */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import type { testApp } from '../helpers.ts';
import {
  BOB,
  COLUMBO,
  commit,
  type Ev,
  git,
  isChat,
  isReview,
  isRunOf,
  LINT,
  studio,
  until,
} from './aurora-studio.ts';
import { worked } from './brain.ts';

describe('handovers: the item, its branch and its reviews follow the new owner', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('Pensieve: Columbo hands it to Bob mid-build; Lint reviews Bob’s work; nothing goes back to Columbo', async () => {
    const specs: RunSpec[] = [];
    const s = studio((app, spec) => {
      specs.push(spec);
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      if (isRunOf(app, spec, COLUMBO))
        return [
          {
            tool: 'call_agent',
            args: {
              agent: 'Baron',
              request: 'Take the Pensieve, it is backend work.',
              why: 'hand over',
              handover: true,
            },
          },
          { result: 'Handed it to Baron.' },
        ];
      return commit(spec, 'pensieve.txt');
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    expect(r.status).toBe(201);
    const work = workRepo(h.db);
    const it = await until(
      () => work.item(r.body.items[0].id) as ChecklistItem,
      (i) => i.status === 'done' || i.status === 'failed',
    );

    expect(it).toMatchObject({ status: 'done', agentId: BOB, teamId: null });
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as { id: string; agentId: string }[];
    const bobRun = runs.find((x) => x.agentId === BOB);
    expect(it.buildRunId).toBe(bobRun?.id);
    expect(runs.filter((x) => x.agentId === COLUMBO)).toHaveLength(1); // never sent back to Columbo

    /* one review, of Bob's work, on the item's own branch (the checkout Columbo started) */
    const builds = specs.filter((x) => !isReview(x) && !isChat(x) && x.task.includes('Your checklist item'));
    const reviews = specs.filter(isReview);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.task).toMatch(/^You are reviewing Baron von Backup's work/);
    expect(reviews[0]?.task).not.toContain('Captain Semicolon');
    expect(reviews[0]?.task).toMatch(/Their work is on branch \S+ in this checkout/);
    expect(new Set([...builds, ...reviews].map((x) => x.cwd)).size).toBe(1);
    expect(builds[1]?.task).toContain('Handed over by Captain Semicolon: Take the Pensieve');
    expect(git(join(h.config.sandbox, 'aurora'), 'log', '--format=%s', 'main')).toContain('pensieve.txt');

    /* the story: handed over once, then only Bob ↔ Lint */
    const handoffs = (h.events.after('project', 'aurora') as Ev[])
      .filter((e) => e.type === 'handoff')
      .map((e) => `${e.payload.kind}:${e.payload.from}→${e.payload.to}`);
    const at = handoffs.indexOf(`handover:${COLUMBO}→${BOB}`);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(handoffs.slice(at + 1).some((x) => x.endsWith(`→${COLUMBO}`))).toBe(false);
    expect(handoffs.slice(at + 1)).toContain(`review:${BOB}→${LINT}`);
  }, 20_000);

  /* Regression (the real Pensieve bug): after the handover the reviewer kept sending the item back to Columbo,
     whose branch had nothing on it. Every review must see Bob's commits, and the send-back must reach Bob. */
  it('Pensieve send-back: Lint asks for changes on Bob’s branch, Bob reworks in his own session, never Columbo', async () => {
    const specs: RunSpec[] = [];
    const reviewed: { branch: string; commits: string[] }[] = [];
    const s = studio((app, spec) => {
      specs.push(spec);
      if (isReview(spec)) {
        const branch = /Their work is on branch (\S+) in this checkout/.exec(spec.task)?.[1] ?? '';
        const log = branch ? git(spec.cwd, 'log', '--format=%s', `main..${branch}`) : '';
        reviewed.push({ branch, commits: log ? log.split('\n') : [] });
        return reviewed.length === 1
          ? [{ result: '{"verdict":"changes","notes":"Memories need a timestamp."}' }]
          : [{ result: '{"verdict":"approve","notes":"Good."}' }];
      }
      if (isRunOf(app, spec, COLUMBO))
        return [
          {
            tool: 'call_agent',
            args: {
              agent: 'Baron',
              request: 'Take the Pensieve, it is backend work.',
              why: 'hand over',
              handover: true,
            },
          },
          { result: 'Handed it to Baron.' },
        ];
      return commit(
        spec,
        spec.task.includes('Memories need a timestamp.') ? 'timestamps.txt' : 'pensieve.txt',
      );
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const it = await until(
      () => work.item(r.body.items[0].id) as ChecklistItem,
      (i) => i.status === 'done' || i.status === 'failed',
    );
    expect(it).toMatchObject({ status: 'done', agentId: BOB, sendBacks: 1 });
    expect(it.reviews.map((x) => x.verdict)).toEqual(['changes', 'approve']);

    /* both reviews were of Bob's work, on one non-empty branch that grew with the rework */
    const reviews = specs.filter(isReview);
    expect(reviews.map((x) => x.task.match(/^You are reviewing (.+?)'s work/)?.[1])).toEqual([
      'Baron von Backup',
      'Baron von Backup',
    ]);
    expect(reviews.some((x) => x.task.includes('Captain Semicolon'))).toBe(false);
    expect(new Set(reviewed.map((x) => x.branch)).size).toBe(1);
    expect(reviewed[0]?.commits).toEqual(['pensieve.txt']);
    expect(reviewed[1]?.commits).toEqual(['timestamps.txt', 'pensieve.txt']);

    /* the send-back went to Bob: his session resumed with the notes; Columbo ran once and never again */
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as {
      id: string;
      agentId: string;
      task: string;
      startedAt: string;
    }[];
    const byStart = (a: { startedAt: string }, b: { startedAt: string }) =>
      a.startedAt.localeCompare(b.startedAt);
    const bob = runs.filter((x) => x.agentId === BOB).sort(byStart);
    expect(runs.filter((x) => x.agentId === COLUMBO)).toHaveLength(1);
    expect(bob).toHaveLength(2);
    expect(bob[1]?.task).toContain('Memories need a timestamp.');
    const rework = s.crew.calls.filter((c) => !isReview(c) && c.task.includes('sent it back'));
    expect(rework).toHaveLength(1);
    expect(rework[0]?.resumeSessionId).toBe(`fake-${bob[0]?.id}`);
    expect(it.buildRunId).toBe(bob[1]?.id);

    const ev = h.events.after('project', 'aurora') as Ev[];
    const handoffs = ev
      .filter((e) => e.type === 'handoff')
      .map((e) => `${e.payload.kind}:${e.payload.from}→${e.payload.to}`);
    const at = handoffs.indexOf(`handover:${COLUMBO}→${BOB}`);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(handoffs.slice(at + 1).filter((x) => !x.startsWith('deliver:'))).toEqual([
      `review:${BOB}→${LINT}`,
      `rework:${LINT}→${BOB}`,
      `review:${BOB}→${LINT}`,
    ]);
    expect(handoffs.slice(at + 1).some((x) => x.endsWith(`→${COLUMBO}`))).toBe(false);
    expect(git(join(h.config.sandbox, 'aurora'), 'log', '--format=%s', 'main')).toContain('timestamps.txt');
  }, 20_000);

  it('plain work: true from a build is side work: the caller keeps its item', async () => {
    const s = studio((app, spec) =>
      isRunOf(app, spec, COLUMBO) && spec.task.includes('Your checklist item: Build the Pensieve')
        ? [
            {
              tool: 'call_agent',
              args: { agent: 'Baron', request: 'Back up the memories too.', why: 'back up', work: true },
            },
            ...worked('Built it.'),
          ]
        : isReview(spec)
          ? [{ result: '{"verdict":"approve","notes":"Good."}' }]
          : worked('Done.'),
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const it = await until(
      () => work.item(r.body.items[0].id) as ChecklistItem,
      (i) => i.status !== 'todo' && i.status !== 'running',
    );
    expect(it).toMatchObject({ status: 'done', agentId: COLUMBO });
    /* the side quest runs too: let it finish before the app closes */
    const goals = await until(
      () => work.goals('aurora'),
      (gs) => gs.length === 2 && gs.every((g) => g.status !== 'running'),
    );
    expect(goals.find((g) => g.text === 'Back up the memories too.')?.quest).toBe('side');
    await new Promise((x) => setTimeout(x, 100));
  }, 20_000);

  it.each([
    ['handover: true', { handover: true }],
    ['work: true', { work: true }],
  ])(
    'a declined item (%s) comes back to the orchestrator: it waits for a new owner, they give it to Bob',
    async (_, flag) => {
      const s = studio((app, spec) => {
        if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
        if (!isRunOf(app, spec, COLUMBO)) return commit(spec, 'pensieve.txt');
        return [
          {
            tool: 'call_agent',
            args: { agent: 'Pixel', request: 'Not mine, please re-plan it.', why: 'decline', ...flag },
          },
          { result: 'Gave it back.' },
        ];
      });
      h = s.h;
      const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
      const work = workRepo(h.db);
      const id = r.body.items[0].id as string;
      const runs = async () =>
        (await h.call('GET', '/projects/aurora/runs')).body as { id: string; agentId: string }[];
      await until(
        () => work.item(id) as ChecklistItem,
        (i) => i.agentId === 'a-pixel' && i.status === 'todo',
      );
      await until(
        () => h.runtime.liveCount(),
        (n) => n === 0,
      );
      await new Promise((x) => setTimeout(x, 50)); // let Columbo's run wrap up
      expect(work.item(id)).toMatchObject({ agentId: 'a-pixel', status: 'todo', buildRunId: null });
      expect((await runs()).length).toBe(1); // only Columbo's: the director doesn't build it
      const calls = (h.events.after('project', 'aurora') as Ev[])
        .filter((e) => e.type === 'room.call')
        .map((e) => e.payload.status);
      expect(calls).toContain('answered');
      expect(calls).not.toContain('failed');

      /* the director sees it waiting for a new owner and gives it one: Bob builds it on the same branch */
      expect(await s.director('whiteboard', {})).toMatch(
        /\[waiting for a new owner\] Build the Pensieve — Pixel/,
      );
      expect(await s.director('edit_task', { task: id, owner: 'Baron' })).toContain('Now Baron von Backup');
      const done = await until(
        () => work.item(id) as ChecklistItem,
        (i) => i.status === 'done' || i.status === 'failed',
      );
      expect(done).toMatchObject({ status: 'done', agentId: BOB });
      expect((await runs()).find((x) => x.id === done.buildRunId)?.agentId).toBe(BOB);
    },
    20_000,
  );

  it('work: true to the orchestrator from outside a build waits with them as a side quest', async () => {
    let asked = false;
    const s = studio((_app, spec) => {
      if (isReview(spec) && !asked) {
        asked = true;
        return [
          {
            tool: 'call_agent',
            args: { agent: 'Pixel', request: 'Add backups for the Pensieve.', why: 'flag it', work: true },
          },
          { result: '{"verdict":"approve","notes":"Good."}' },
        ];
      }
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      return commit(spec, `${spec.runId}.txt`);
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const goals = await until(
      () => work.goals('aurora'),
      (gs) => gs.length === 2 && work.item(r.body.items[0].id)?.status === 'done',
    );
    /* the reviewed item stays its builder's; the new work waits with the director, never started */
    expect(work.item(r.body.items[0].id)).toMatchObject({ status: 'done', agentId: COLUMBO });
    const side = goals.find((g) => g.id !== r.body.id) as (typeof goals)[number];
    expect(side.quest).toBe('side');
    expect(side.items[0]).toMatchObject({ agentId: 'a-pixel', status: 'todo', runId: null });
    expect(await s.director('whiteboard', {})).toMatch(/\[waiting for a new owner\] Add backups/);
    await h.call('POST', `/projects/aurora/work/${side.id}/cancel`);
    await until(
      () => work.goal(side.id)?.items[0]?.status,
      (st) => st === 'cancelled',
    );
  }, 20_000);

  it('the director reassigns with edit_task: done work stays done; a failed item is rebuilt by the new owner', async () => {
    const s = studio((_app, spec) => {
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      return commit(spec, `${spec.runId}.txt`);
    });
    h = s.h;
    const turn = (args: Record<string, unknown>) => s.director('edit_task', args);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const id = r.body.items[0].id as string;
    const done = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done',
    );

    /* done: the finished work changes hands as it is, nothing reruns */
    expect(await turn({ task: id, owner: 'Baron' })).toContain('it was done, so their finished work stays');
    expect(work.item(id)).toMatchObject({ status: 'done', agentId: BOB, buildRunId: done.buildRunId });

    /* failed in review: the next owner (back to Columbo here) gets a fresh build, and the review is of theirs */
    work.setItem(id, { status: 'failed', stage: 'review', gateIndex: 0 });
    expect(await turn({ task: id, owner: 'Captain', team: 'ship-it' })).toContain(
      'they build it on the same branch',
    );
    const rebuilt = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done' && i.buildRunId !== done.buildRunId,
    );
    expect(rebuilt).toMatchObject({ agentId: COLUMBO, teamId: 'ship-it' });
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as { id: string; agentId: string }[];
    expect(runs.find((x) => x.id === rebuilt.buildRunId)?.agentId).toBe(COLUMBO);
  }, 20_000);
});
