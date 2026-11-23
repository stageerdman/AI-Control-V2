/* Talking to a running agent ("Uncle Bob is already running"): a note for its live run is kept in its chat and
   handed over by the nudge hook after its next tool step — once — instead of a 409. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

describe('a note for a running agent', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('reaches the live run once, through the nudge, and stays in its chat', async () => {
    h = testApp({ seed: true, runner: fakeRunner(() => [{ wait: 5000 }, { result: 'ok' }]) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    expect(h.runtime.tell('aurora', 'a-pete', 'Pixel', 'Use the blue header')).toBeNull(); // not running
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'build' })).body;

    expect(h.runtime.tell('aurora', 'a-pete', 'Pixel', 'Use the blue header')?.id).toBe(run.id);
    const nudge = h.runtime.internal.nudge(run.id);
    expect(nudge).toContain('a note from Pixel while you work: Use the blue header');
    expect(h.runtime.internal.nudge(run.id)).toBeNull(); // delivered once
    expect(getChatMessages(h.db, run.id).some((m) => m.text === 'Use the blue header')).toBe(true);
  });

  it('can be seen while it waits and cleared before it reaches the run', async () => {
    h = testApp({ seed: true, runner: fakeRunner(() => [{ wait: 5000 }, { result: 'ok' }]) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'build' })).body;
    h.runtime.tell('aurora', 'a-pete', 'Pixel', 'Use the blue header');

    const seen = await h.call('GET', '/projects/aurora/notes?agentId=a-pete');
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual([
      expect.objectContaining({ runId: run.id, agentId: 'a-pete', from: 'Pixel', at: expect.any(String) }),
    ]);
    expect(seen.body[0].text).toContain('Use the blue header');
    expect((await h.call('GET', '/projects/aurora/notes?agentId=a-other')).body).toEqual([]);

    const cleared = await h.call('DELETE', '/projects/aurora/agents/a-pete/notes');
    expect(cleared.body).toEqual({ cleared: 1 });
    expect((await h.call('GET', '/projects/aurora/notes')).body).toEqual([]);
    expect(h.runtime.internal.nudge(run.id)).toBeNull(); // never delivered
  });

  it('answers 404 for a project that does not exist', async () => {
    h = testApp({ seed: true });
    expect((await h.call('GET', '/projects/nowhere/notes')).status).toBe(404);
  });
});
