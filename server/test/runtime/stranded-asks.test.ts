/* A question nobody will read the answer to never stays open: after a restart only work that resumes the
   asking session keeps it; the rest is withdrawn (with an `ask.withdrawn` event so cards leave), and an answer
   to one is refused instead of being stored where no agent reads it. Typed words then go out as a message. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { workRepo } from '../../src/db/work.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { tempDir, testApp } from '../helpers.ts';

type H = ReturnType<typeof testApp>;
type AskView = { id: string; runId: string; status: string };

const asking: FakeStep[] = [{ ask: 'Which colour?', options: ['Red', 'Blue'] }, { result: 'ok' }];
const boot = (
  script: (s: RunSpec) => FakeStep[],
  at: string,
  opts: { first?: boolean; max?: number } = {},
) => {
  const h = testApp({
    seed: true,
    runner: fakeRunner(script),
    at,
    ...(opts.max === undefined ? {} : { maxConcurrent: opts.max }),
  });
  if (opts.first) {
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
  }
  return h;
};
const asksOf = async (h: H, status = '') =>
  (await h.call('GET', `/projects/aurora/asks${status ? `?status=${status}` : ''}`)).body as AskView[];
const withdrawn = (h: H) =>
  h.events
    .after('project', 'aurora')
    .filter((e) => e.type === 'ask.withdrawn')
    .map((e) => (e.payload as { askId: string }).askId);
async function until<T>(read: () => Promise<T> | T, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const v = await read();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('never happened');
}

describe('a question nobody waits on is withdrawn, never left open', () => {
  let h: H | undefined;
  let dir: ReturnType<typeof tempDir> | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
    dir?.cleanup();
    dir = undefined;
  });

  /** A hand-started run asks, the studio closes. `asItem`: a whiteboard item owns the run. → the ask's id. */
  async function askThenClose(asItem: boolean): Promise<{ askId: string; runId: string }> {
    dir = tempDir();
    h = boot(() => asking, dir.dir, { first: true });
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'paint' })).body;
    if (asItem) {
      const work = workRepo(h.db);
      work.insertGoal({ id: 'g1', projectId: 'aurora', text: 'Paint', summary: 'Paint' }, [
        { id: 'i1', text: 'Paint', brief: 'paint', agentId: 'a-baron', teamId: null },
      ]);
      work.setItem('i1', { status: 'running', runId: run.id });
    }
    const [q] = await until(
      () => asksOf(h as H, 'open'),
      (a) => a.length === 1,
    );
    await h.close();
    return { askId: q?.id as string, runId: run.id };
  }

  it('after a restart, a hand-started run’s question is withdrawn: nothing will resume it', async () => {
    const { askId } = await askThenClose(false);
    h = boot(() => [{ result: 'never' }], dir?.dir as string);
    expect(await asksOf(h, 'open')).toEqual([]);
    expect((await asksOf(h)).map((a) => [a.id, a.status])).toEqual([[askId, 'cancelled']]);
    expect(withdrawn(h)).toEqual([askId]); // the card leaves every open screen
  });

  it('answering a question whose work was stopped meanwhile is refused (409) and closes it for good', async () => {
    const { askId } = await askThenClose(true);
    h = boot(() => [{ result: 'never' }], dir?.dir as string, { max: 0 }); // the resume stays queued
    expect((await asksOf(h, 'open')).map((a) => a.id)).toEqual([askId]); // kept: its item will resume
    workRepo(h.db).setItem('i1', { status: 'cancelled' }); // the user stops that work

    const r = await h.call('POST', `/projects/aurora/asks/${askId}/answer`, { answer: 'Red' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Nobody is waiting for this answer/);
    expect(await asksOf(h, 'open')).toEqual([]);
    expect(withdrawn(h)).toEqual([askId]);
    // and a second try says it is closed, never "open" again
    const again = await h.call('POST', `/projects/aurora/asks/${askId}/answer`, { answer: 'Red' });
    expect(again.status).toBe(409);
  });

  it('typed in the chat while only a stranded question is open, the words go out as a message and get a reply', async () => {
    const { askId } = await askThenClose(true);
    const specs: RunSpec[] = [];
    h = boot(
      (s) => {
        specs.push(s);
        return [{ result: 'Got your message.' }];
      },
      dir?.dir as string,
      { max: 0 },
    );
    workRepo(h.db).setItem('i1', { status: 'cancelled' });
    const url = '/projects/aurora/threads/a-baron/messages';
    const sent = await h.call('POST', url, { text: 'Blue, please' });
    expect(sent.status).toBe(202);
    expect(sent.body.message.runId).toBeTruthy(); // a chat turn, not an answer nobody reads
    await h.runtime.settled(sent.body.message.runId);
    const t = (await h.call('GET', url)).body as { messages: { from: string; text: string }[] };
    expect(t.messages.at(-1)).toMatchObject({ from: 'a-baron', text: 'Got your message.' });
    expect(specs[0]?.task).toContain('Blue, please');
    expect((await asksOf(h)).map((a) => [a.id, a.status])).toEqual([[askId, 'cancelled']]);
  });

  it('a run ending with its question open withdraws it with an event (not only in the db)', async () => {
    dir = tempDir();
    h = boot(() => asking, dir.dir, { first: true });
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'paint' })).body;
    const [q] = await until(
      () => asksOf(h as H, 'open'),
      (a) => a.length === 1,
    );
    await h.call('POST', `/projects/aurora/runs/${run.id}/cancel`);
    await h.runtime.settled(run.id);
    expect(withdrawn(h)).toEqual([q?.id]);
  });
});
