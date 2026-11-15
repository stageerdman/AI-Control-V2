import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf } from '../../src/crew/structured.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

/* agent runs play `work`; the follow-up call (contract agent-chat-reply) plays `model` and is recorded */
function studio(work: FakeStep[], model: FakeStep[] = [{ result: '{"reply":"Yes, hello.txt says hi."}' }]) {
  const asked: string[] = [];
  const runner = fakeRunner((spec) => {
    if (contractOf(spec.task)?.name !== 'agent-chat-reply') return work;
    asked.push(spec.task);
    return model;
  });
  const h = testApp({ seed: true, longPollMs: 50, runner });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { ...h, asked };
}

describe('POST /chats/:runId/messages', () => {
  let h: ReturnType<typeof studio>;
  afterEach(() => h.close());

  const finishedChat = async () => {
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'Make hello.txt' });
    expect(r.status).toBe(201);
    await h.runtime.settled(r.body.id);
    return r.body.id as string;
  };
  const send = (runId: string, body: unknown) => h.call('POST', `/chats/${runId}/messages`, body);

  it('saves the message and the reply, and the model sees the earlier chat', async () => {
    h = studio([{ text: 'Writing the file now.' }, { result: 'hello.txt is in place.' }]);
    const runId = await finishedChat();
    const before = (await h.call('GET', `/chats/${runId}/messages`)).body.length as number;

    const r = await send(runId, { text: '  What is in the file?  ' });
    expect(r.status).toBe(200);
    expect(r.body.sent).toMatchObject({
      runId,
      role: 'user',
      text: 'What is in the file?',
      meta: { followUp: true },
    });
    expect(r.body.reply).toMatchObject({
      runId,
      role: 'assistant',
      text: 'Yes, hello.txt says hi.',
      meta: { followUp: true },
    });
    expect(r.body.reply.seq).toBe(r.body.sent.seq + 1);

    expect(h.asked[0]).toContain('Make hello.txt');
    expect(h.asked[0]).toContain('hello.txt is in place.');
    expect(h.asked[0]).toContain('What is in the file?');

    const after = (await h.call('GET', `/chats/${runId}/messages`)).body;
    expect(after).toHaveLength(before + 2);
    expect(after.slice(-2)).toEqual([r.body.sent, r.body.reply]);
  });

  it('an unknown chat is 404', async () => {
    h = studio([{ result: 'ok' }]);
    const r = await send('00000000-0000-4000-8000-000000000000', { text: 'hi' });
    expect(r.status).toBe(404);
    expect(h.asked).toHaveLength(0);
  });

  it('a running chat is 409 chat_running and nothing is saved', async () => {
    h = studio([{ text: 'Starting a long job.' }, { wait: 5000 }, { result: 'never' }]);
    const r0 = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'Long job' });
    const runId = r0.body.id as string;
    await new Promise((r) => setTimeout(r, 30));
    const before = (await h.call('GET', `/chats/${runId}/messages`)).body.length;

    const r = await send(runId, { text: 'Are you done?' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('chat_running');
    expect((await h.call('GET', `/chats/${runId}/messages`)).body).toHaveLength(before);

    await h.call('POST', `/projects/aurora/runs/${runId}/cancel`);
    await h.runtime.settled(runId);
  });

  it('empty or blank text is rejected before anything is saved', async () => {
    h = studio([{ result: 'done' }]);
    const runId = await finishedChat();
    for (const body of [{ text: '   ' }, {}, { text: 'x'.repeat(8001) }]) {
      const r = await send(runId, body);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('invalid');
    }
    expect(h.asked).toHaveLength(0);
  });

  it('a model failure is the crew 502, and the user message stays saved', async () => {
    h = studio([{ result: 'done' }], [{ fail: 'model unavailable' }]);
    const runId = await finishedChat();
    const r = await send(runId, { text: 'Still there?' });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('agent_error');
    const last = (await h.call('GET', `/chats/${runId}/messages`)).body.at(-1);
    expect(last).toMatchObject({ role: 'user', text: 'Still there?', meta: { followUp: true } });
  });
});
