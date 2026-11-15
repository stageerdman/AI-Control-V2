import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

function studio(steps: FakeStep[]) {
  const h = testApp({ seed: true, longPollMs: 50, runner: fakeRunner(() => steps) });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return h;
}
type Msg = { seq: number; role: string; text: string; meta: Record<string, unknown> | null };
const lines = (msgs: Msg[]) => msgs.map((m) => [m.role, m.text]);

describe('chat history (runs keep every message)', () => {
  let h: ReturnType<typeof studio>;
  afterEach(() => h.close());

  const start = async (task = 'Make hello.txt') => {
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  const messages = async (runId: string) => (await h.call('GET', `/chats/${runId}/messages`)).body as Msg[];

  it('a run that succeeds keeps its task, words, short tool lines and the end', async () => {
    h = studio([
      { activity: { kind: 'editing', label: 'Writing hello.txt', target: 'hello.txt' }, tool: 'Write' },
      { activity: { kind: 'thinking', label: 'Thinking' } },
      { text: 'Writing the file now.' },
      { result: 'hello.txt is in place.' },
    ]);
    const id = await start();
    await h.runtime.settled(id);
    const msgs = await messages(id);
    expect(msgs.map((m) => m.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(lines(msgs)).toEqual([
      ['user', 'Make hello.txt'],
      ['tool', 'Writing hello.txt'],
      ['assistant', 'Writing the file now.'],
      ['assistant', 'hello.txt is in place.'],
      ['system', 'Finished'],
    ]);
    expect(msgs[1]?.meta).toEqual({ tool: 'Write', summary: 'Writing hello.txt' });

    const chats = await h.call('GET', '/agents/a-pete/chats');
    expect(chats.body).toEqual([
      expect.objectContaining({
        runId: id,
        status: 'succeeded',
        task: 'Make hello.txt',
        sessionId: `fake-${id}`,
        messageCount: 5,
        lastText: 'hello.txt is in place.',
      }),
    ]);
    expect((await h.call('GET', '/agents/a-pete/chats/latest')).body.runId).toBe(id);
  });

  it('a final result the agent already said is not saved twice', async () => {
    h = studio([{ text: 'All done.' }, { result: 'All done.' }]);
    const id = await start();
    await h.runtime.settled(id);
    expect(lines(await messages(id))).toEqual([
      ['user', 'Make hello.txt'],
      ['assistant', 'All done.'],
      ['system', 'Finished'],
    ]);
  });

  it('a run that fails keeps what it said before failing', async () => {
    h = studio([{ text: 'Trying the build.' }, { fail: 'Build broke' }]);
    const id = await start();
    await h.runtime.settled(id);
    expect(lines(await messages(id))).toEqual([
      ['user', 'Make hello.txt'],
      ['assistant', 'Trying the build.'],
      ['system', 'Failed: Build broke'],
    ]);
  });

  it('a cancelled run keeps its messages', async () => {
    h = studio([{ text: 'Starting a long job.' }, { wait: 5000 }, { result: 'never' }]);
    const id = await start();
    await new Promise((r) => setTimeout(r, 30));
    expect((await h.call('POST', `/projects/aurora/runs/${id}/cancel`)).status).toBe(202);
    await h.runtime.settled(id);
    const msgs = await messages(id);
    expect(lines(msgs)).toEqual([
      ['user', 'Make hello.txt'],
      ['assistant', 'Starting a long job.'],
      ['system', 'Cancelled'],
    ]);
    expect(msgs.at(-1)?.meta).toEqual({ kind: 'end', status: 'cancelled' });
  });

  it("keeps the agent's question and the user's answer", async () => {
    h = studio([{ ask: 'Which colour?', options: ['red', 'blue'] }, { result: 'Blue it is.' }]);
    const id = await start();
    let ask: { id: string } | undefined;
    for (let i = 0; i < 50 && !ask; i++) {
      await new Promise((r) => setTimeout(r, 10));
      ask = (await h.call('GET', '/projects/aurora/asks?status=open')).body[0];
    }
    expect((await h.call('POST', `/projects/aurora/asks/${ask?.id}/answer`, { answer: 'blue' })).status).toBe(200);
    await h.runtime.settled(id);
    const msgs = await messages(id);
    expect(lines(msgs)).toEqual([
      ['user', 'Make hello.txt'],
      ['assistant', 'Which colour?'],
      ['user', 'blue'],
      ['assistant', 'User answered: blue'],
      ['assistant', 'Blue it is.'],
      ['system', 'Finished'],
    ]);
    expect(msgs[1]?.meta).toEqual({ kind: 'ask', askId: ask?.id, options: ['red', 'blue'] });
  });

  it('never stores an API key, even one pasted into the task or said by the agent', async () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    h = studio([{ text: `Using ${key}` }, { result: 'ok' }]);
    const id = await start(`Deploy with ${key}`);
    await h.runtime.settled(id);
    const raw = JSON.stringify(await messages(id));
    expect(raw).not.toContain(key);
    expect(raw).toContain('••••');
  });

  it('unknown agents and chats are 404', async () => {
    h = studio([{ result: 'ok' }]);
    expect((await h.call('GET', '/agents/nobody/chats')).status).toBe(404);
    expect((await h.call('GET', '/agents/nobody/chats/latest')).status).toBe(404);
    expect((await h.call('GET', '/chats/00000000-0000-4000-8000-000000000000/messages')).status).toBe(404);
    const latest = await h.call('GET', '/agents/a-pete/chats/latest');
    expect(latest.status).toBe(200);
    expect(latest.body).toBeNull();
  });
});
