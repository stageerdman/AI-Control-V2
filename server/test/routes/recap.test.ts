import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf } from '../../src/crew/structured.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

/* agent runs play `work`; the recap call (contract agent-recap) plays `model` and is counted */
function studio(
  work: FakeStep[],
  model: FakeStep[] = [{ result: '{"recap":"I made hello.txt. It is done."}' }],
) {
  const asked: string[] = [];
  const runner = fakeRunner((spec) => {
    if (contractOf(spec.task)?.name !== 'agent-recap') return work;
    asked.push(spec.task);
    return model;
  });
  const h = testApp({ seed: true, longPollMs: 50, runner });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { ...h, asked };
}

describe('GET /agents/:id/recap', () => {
  let h: ReturnType<typeof studio>;
  afterEach(() => h.close());

  const start = async (task = 'Make hello.txt') => {
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  const recap = () => h.call('GET', '/agents/a-pete/recap');

  it('an agent with no saved chat has nothing to tell (no model call)', async () => {
    h = studio([{ result: 'ok' }]);
    const r = await recap();
    expect(r).toEqual({ status: 200, body: { recap: null, chat: null, cached: false } });
    expect(h.asked).toHaveLength(0);
  });

  it('an unknown agent is 404', async () => {
    h = studio([{ result: 'ok' }]);
    expect((await h.call('GET', '/agents/nobody/recap')).status).toBe(404);
  });

  it('a finished chat is recapped once, then served from the cache', async () => {
    h = studio([{ text: 'Writing the file now.' }, { result: 'hello.txt is in place.' }]);
    const id = await start();
    await h.runtime.settled(id);

    const first = await recap();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      recap: 'I made hello.txt. It is done.',
      cached: false,
      chat: { runId: id, status: 'succeeded', task: 'Make hello.txt' },
    });
    expect(h.asked[0]).toContain('Make hello.txt');
    expect(h.asked[0]).toContain('hello.txt is in place.');

    const again = await recap();
    expect(again.body).toMatchObject({ recap: 'I made hello.txt. It is done.', cached: true });
    expect(h.asked).toHaveLength(1);
  });

  it('a chat that is still running is never cached', async () => {
    h = studio([{ text: 'Starting a long job.' }, { wait: 5000 }, { result: 'never' }]);
    const id = await start();
    await new Promise((r) => setTimeout(r, 30));

    expect((await recap()).body).toMatchObject({ cached: false, chat: { runId: id, status: 'running' } });
    expect((await recap()).body).toMatchObject({ cached: false });
    expect(h.asked).toHaveLength(2);
    await h.call('POST', `/projects/aurora/runs/${id}/cancel`);
    await h.runtime.settled(id);
  });

  it('a model failure is a 502 with a plain message, and nothing is cached', async () => {
    h = studio([{ result: 'done' }], [{ fail: 'model unavailable' }]);
    const id = await start();
    await h.runtime.settled(id);
    const r = await recap();
    expect(r.status).toBe(502);
    expect(r.body.error).toMatchObject({ code: 'agent_error' });
    expect(r.body.error.message).toContain('model unavailable');
    expect((await recap()).status).toBe(502);
    expect(h.asked).toHaveLength(2);
  });
});
