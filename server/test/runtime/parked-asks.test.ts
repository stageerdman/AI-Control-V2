/* An open question survives an app reload and a full studio restart: it stays on the user's screen, and
   answering it carries the same session on with the answer (runtime/parked.ts). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { tempDir, testApp } from '../helpers.ts';

type H = ReturnType<typeof testApp>;
type AskView = { id: string; runId: string; status: string; question: string; answer: string | null };

const QUESTION = 'Reload the app — did the fix work?';
const asking: FakeStep[] = [
  { text: 'Fixed it.' },
  { ask: QUESTION, options: ['Yes', 'No'] },
  { result: 'ok' },
];

const boot = (script: (s: RunSpec) => FakeStep[], at?: string, first = true) => {
  const h = testApp({ seed: true, runner: fakeRunner(script), ...(at ? { at } : {}) });
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

  /** Boot, start a run that asks, then close the studio while it waits. → the asking run's id. */
  async function askThenClose(): Promise<string> {
    dir = tempDir();
    h = boot(() => asking, dir.dir);
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'fix it' })).body;
    await until(
      () => openAsks(h as H),
      (a) => a.length === 1,
    );
    await (h as H).close(); // the studio closes (or restarts) while the question is open
    return run.id;
  }

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

    const next = (
      await h.call('POST', '/projects/aurora/runs', {
        agentId: 'a-baron',
        task: 'carry on',
        resumeRunId: first,
      })
    ).body;
    await tick();
    expect(specs).toHaveLength(0); // nothing runs before the user answers
    const [still] = await openAsks(h);
    expect([still?.id, still?.runId]).toEqual([q?.id, next.id]); // same question, now the resumed run's

    await answer(h, q?.id as string, 'Yes, it works');
    expect((await h.runtime.settled(next.id)).status).toBe('succeeded');
    expect(specs).toHaveLength(1);
    expect(specs[0]?.resumeSessionId).toBe(`fake-${first}`);
    expect(specs[0]?.task).toContain(`You asked the user: "${QUESTION}"`);
    expect(specs[0]?.task).toContain('The user answered: "Yes, it works"');
    expect(specs[0]?.task.endsWith('carry on')).toBe(true);
  });

  it('an answer given before the session resumes is carried into it', async () => {
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

  it('stopping a run that waits on a parked question withdraws the question', async () => {
    const first = await askThenClose();
    h = boot(() => [{ result: 'never' }], dir?.dir, false);
    const next = (
      await h.call('POST', '/projects/aurora/runs', {
        agentId: 'a-baron',
        task: 'carry on',
        resumeRunId: first,
      })
    ).body;
    await h.call('POST', `/projects/aurora/runs/${next.id}/cancel`);
    expect((await h.runtime.settled(next.id)).status).toBe('cancelled');
    expect(await openAsks(h)).toEqual([]);
  });
});
