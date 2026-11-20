/* An open question survives an app reload and a full studio restart: it stays on the user's screen, and
   answering it carries the same session on with the answer (runtime/parked.ts). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { workRepo } from '../../src/db/work.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { worked } from '../crew/brain.ts';
import { tempDir, testApp } from '../helpers.ts';

type H = ReturnType<typeof testApp>;
type AskView = { id: string; runId: string; status: string; question: string; answer: string | null };

const QUESTION = 'Reload the app — did the fix work?';
const asking: FakeStep[] = [
  { text: 'Fixed it.' },
  { ask: QUESTION, options: ['Yes', 'No'] },
  { result: 'ok' },
];

const boot = (script: (s: RunSpec) => FakeStep[], at?: string, first = true, maxConcurrent?: number) => {
  const h = testApp({
    seed: true,
    runner: fakeRunner(script),
    ...(at ? { at } : {}),
    ...(maxConcurrent === undefined ? {} : { maxConcurrent }),
  });
  if (first) {
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
  }
  return h;
};
const openAsks = async (h: H) => (await h.call('GET', '/projects/aurora/asks?status=open')).body as AskView[];
const answer = (h: H, id: string, text: string) =>
  h.call('POST', `/projects/aurora/asks/${id}/answer`, { answer: text });
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function until<T>(read: () => Promise<T> | T, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const v = await read();
    if (ok(v)) return v;
    await tick(5);
  }
  throw new Error('never happened');
}

describe('open questions survive a reload and a restart', () => {
  let h: H | undefined;
  let dir: ReturnType<typeof tempDir> | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
    dir?.cleanup();
    dir = undefined;
  });

  /** Boot, start a whiteboard item's run that asks, then close the studio while it waits. → the asking run's id.
      (The item is what carries the session on after the restart: dispatch.recover queues its resume.) */
  async function askThenClose(): Promise<string> {
    dir = tempDir();
    h = boot(() => asking, dir.dir);
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'fix it' })).body;
    const work = workRepo(h.db);
    work.insertGoal({ id: 'g1', projectId: 'aurora', text: 'Fix it', summary: 'Fix it' }, [
      { id: 'i1', text: 'Fix it', brief: 'fix it', agentId: 'a-baron', teamId: null },
    ]);
    work.setItem('i1', { status: 'running', runId: run.id });
    await until(
      () => openAsks(h as H),
      (a) => a.length === 1,
    );
    await (h as H).close(); // the studio closes (or restarts) while the question is open
    return run.id;
  }
  /** The open question once the item's resumed session took it over. */
  const resumedAsk = async (first: string) =>
    (
      await until(
        () => openAsks(h as H),
        (a) => a.length === 1 && a[0]?.runId !== first,
      )
    )[0] as AskView;

  it('a reload reads the open question again and answering it finishes the same run', async () => {
    h = boot(() => asking);
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'fix it' })).body;
    // the reloaded app only has what the server says
    const [q] = await until(
      () => openAsks(h as H),
      (a) => a.length === 1,
    );
    expect([q?.question, q?.runId]).toEqual([QUESTION, run.id]);
    expect((await answer(h, q?.id as string, 'Yes')).status).toBe(200);
    expect((await h.runtime.settled(run.id)).status).toBe('succeeded');
  });

  it('a restart keeps the question open; the resumed session waits for the answer, then carries on with it', async () => {
    const first = await askThenClose();
    const specs: RunSpec[] = [];
    h = boot(
      (s) => {
        specs.push(s);
        return [{ result: 'carried on' }];
      },
      dir?.dir,
      false,
    );
    const [q] = await openAsks(h);
    expect([q?.question, q?.runId, q?.status]).toEqual([QUESTION, first, 'open']);

    const still = await resumedAsk(first); // the item resumed its session: same question, now that run's
    await tick();
    expect(specs).toHaveLength(0); // nothing runs before the user answers
    expect(still.id).toBe(q?.id);

    expect((await answer(h, still.id, 'Yes, it works')).status).toBe(200);
    expect((await h.runtime.settled(still.runId)).status).toBe('succeeded');
    // delivered once (later runs — the item's follow-ups — never get it again)
    expect(specs.filter((s) => s.task.includes('The user answered'))).toHaveLength(1);
    expect(specs[0]?.resumeSessionId).toBe(`fake-${first}`);
    expect(specs[0]?.task).toContain(`You asked the user: "${QUESTION}"`);
    expect(specs[0]?.task).toContain('The user answered: "Yes, it works"');

    // closed, and it stays closed across another restart
    await h.close();
    h = boot(() => [{ result: 'never' }], dir?.dir, false);
    expect(await openAsks(h)).toEqual([]);
    const all = (await h.call('GET', '/projects/aurora/asks')).body as AskView[];
    expect(all.map((a) => [a.id, a.status, a.answer])).toEqual([[q?.id, 'answered', 'Yes, it works']]);
  });

  it('an answer given before the session resumes is carried into it', async () => {
    const first = await askThenClose();
    const specs: RunSpec[] = [];
    h = boot(
      (s) => {
        specs.push(s);
        return worked('carried on');
      },
      dir?.dir,
      false,
      0, // the item's resume stays queued (no free slot)
    );
    const [q] = await openAsks(h);
    expect((await answer(h, q?.id as string, 'No')).status).toBe(200); // nothing runs yet: the answer is kept
    const next = (
      await h.call('POST', '/projects/aurora/runs', {
        agentId: 'a-baron',
        task: 'carry on',
        resumeRunId: first,
      })
    ).body;
    await h.runtime.settled(next.id);
    expect(specs[0]?.task).toContain('The user answered: "No"');
    // a later resume of that session does not repeat it
    const again = (
      await h.call('POST', '/projects/aurora/runs', {
        agentId: 'a-baron',
        task: 'more',
        resumeRunId: next.id,
      })
    ).body;
    await h.runtime.settled(again.id);
    expect(specs[1]?.task).toBe('more');
  });

  it('a chat turn cut off while asking carries on after the restart and replies with the answer', async () => {
    dir = tempDir();
    h = boot(() => asking, dir.dir);
    const url = '/projects/aurora/threads/a-pete/messages';
    const r = await h.call('POST', url, { text: 'Is the bug fixed?' });
    await until(
      () => openAsks(h as H),
      (a) => a.length === 1,
    );
    await h.close();

    h = boot(
      (s) => [{ result: `Great — ${s.task.includes('"Yes"') ? 'heard you' : 'no answer'}` }],
      dir.dir,
      false,
    );
    const [q] = await openAsks(h);
    expect(q?.question).toBe(QUESTION);
    expect(q?.runId).not.toBe(r.body.runId); // the continued turn took it over
    expect(((await h.call('GET', url)).body as { busy: boolean }).busy).toBe(true);

    await answer(h, q?.id as string, 'Yes');
    await h.runtime.settled(q?.runId as string);
    const t = (await h.call('GET', url)).body as {
      busy: boolean;
      messages: { from: string; text: string }[];
    };
    expect(t.busy).toBe(false);
    expect(t.messages.at(-1)).toMatchObject({ from: 'a-pete', text: 'Great — heard you' });
    expect(t.messages.some((m) => m.text.includes('restarted before I could answer'))).toBe(false);
  });

  it("the director's chat turn carries on after a restart too (its tools exist by then)", async () => {
    dir = tempDir();
    h = boot(() => asking, dir.dir);
    const url = '/projects/aurora/threads/a-pixel/messages';
    const r = await h.call('POST', url, { text: 'Is the bug fixed?' });
    await until(
      () => openAsks(h as H),
      (a) => a.length === 1,
    );
    await h.close();

    h = boot(() => [{ result: 'Thanks — carrying on.' }], dir.dir, false);
    const [q] = await openAsks(h);
    expect(q?.runId).not.toBe(r.body.runId); // continued, not answered with "the studio restarted"
    await answer(h, q?.id as string, 'Yes');
    await h.runtime.settled(q?.runId as string);
    const t = (await h.call('GET', url)).body as { messages: { from: string; text: string }[] };
    expect(t.messages.at(-1)).toMatchObject({ from: 'a-pixel', text: 'Thanks — carrying on.' });
  });

  it('stopping a run that waits on a parked question withdraws the question', async () => {
    const first = await askThenClose();
    h = boot(() => [{ result: 'never' }], dir?.dir, false);
    const { runId } = await resumedAsk(first);
    await h.call('POST', `/projects/aurora/runs/${runId}/cancel`);
    expect((await h.runtime.settled(runId)).status).toBe('cancelled');
    expect(await openAsks(h)).toEqual([]);
  });
});
