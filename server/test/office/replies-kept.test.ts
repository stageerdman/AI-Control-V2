/* STUCK ANSWERS: a reply is never lost. It is stored whether or not anyone is in the office, a message to an
   agent already at work is answered when that work ends, and a turn cut off by a restart is answered after it. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { tempDir, testApp } from '../helpers.ts';

type H = ReturnType<typeof testApp>;
type Line = { from: string; kind: string; text: string; runId: string | null };

const boot = (script: (s: RunSpec) => FakeStep[], at?: string, first = true) => {
  const h = testApp({ seed: true, runner: fakeRunner(script), ...(at ? { at } : {}) });
  if (first) {
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
  }
  return h;
};
const url = (agentId: string) => `/projects/aurora/threads/${agentId}/messages`;
const thread = async (h: H, agentId: string) =>
  (await h.call('GET', url(agentId))).body as { busy: boolean; messages: Line[] };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('replies are kept while the user is away', () => {
  let h: H | undefined;
  let dir: ReturnType<typeof tempDir> | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
    dir?.cleanup();
    dir = undefined;
  });

  it('a reply that lands with nobody listening is stored and shown on the next visit', async () => {
    h = boot(() => [{ wait: 50 }, { result: 'The voice bar is done.' }]);
    const r = await h.call('POST', url('a-pete'), { text: 'How is the voice bar?' });
    // the user leaves the office: nobody reads the stream until the run is over
    await h.runtime.settled(r.body.runId);
    const t = await thread(h, 'a-pete');
    expect(t.busy).toBe(false);
    expect(t.messages.map((m) => [m.from, m.text])).toEqual([
      ['user', 'How is the voice bar?'],
      ['a-pete', 'The voice bar is done.'],
    ]);
  });

  it('a message to an agent at work is answered once, when the work ends', async () => {
    h = boot(() => [{ wait: 100 }, { result: 'Deployed to staging.' }]);
    const work = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'deploy' })).body;
    const a = await h.call('POST', url('a-baron'), { text: 'hello?' });
    const b = await h.call('POST', url('a-baron'), { text: 'are you there?' });
    expect([a.body.runId, b.body.runId]).toEqual([work.id, work.id]);
    await h.runtime.settled(work.id);
    expect((await thread(h, 'a-baron')).messages.map((m) => [m.from, m.text, m.runId])).toEqual([
      ['user', 'hello?', work.id],
      ['user', 'are you there?', work.id],
      ['a-baron', 'Deployed to staging.', work.id],
    ]);
  });

  it('a turn cut off by a restart is answered after it, once', async () => {
    dir = tempDir();
    h = boot(() => [{ text: 'Thinking…' }, { wait: 10_000 }, { result: 'never' }], dir.dir);
    const r = await h.call('POST', url('a-pete'), { text: 'Long question' });
    await tick();
    await h.close(); // the studio closes mid-answer: the run is left 'running' for the next boot
    for (const n of [1, 2]) {
      h = boot(() => [{ result: 'ok' }], dir.dir, false);
      const t = await thread(h, 'a-pete');
      expect(t.busy).toBe(false);
      expect(t.messages.map((m) => [m.from, m.kind, m.text, m.runId])).toEqual([
        ['user', 'text', 'Long question', r.body.runId],
        [
          'a-pete',
          'error',
          'The studio restarted before I could answer. Ask me again any time.',
          r.body.runId,
        ],
      ]);
      if (n === 1) {
        await h.close();
        h = undefined;
      }
    }
  });
});
