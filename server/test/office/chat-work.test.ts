/* A reply in an agent's chat can start work: the user asks for work in a past chat, the reply offers it, and
   "Start it" puts it on the whiteboard for that agent, whose run is briefed with the user's words and the chat.
   A question gets a plain answer, with nothing to start. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf } from '../../src/crew/structured.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

type Item = { agentId: string; text: string; brief: string; status: string };
type Goal = { id: string; text: string; status: string; items: Item[] };

/** Aurora with a folder; Pete's first run plays `first`, the chat reply plays `answer`, later runs are briefed. */
function studio(answer: string) {
  const briefs: string[] = [];
  let runs = 0;
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      if (contractOf(spec.task)?.name === 'agent-chat-reply') return [{ result: answer }];
      if (contractOf(spec.task)) return [{ result: '{"verdict":"approve","notes":""}' }];
      if (runs++ > 0) briefs.push(spec.task);
      return [{ result: runs === 1 ? 'hello.txt is in place.' : 'Added the footer.' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  const pastChat = async () => {
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-semic', task: 'Make hello.txt' });
    await h.runtime.settled(r.body.id);
    return r.body.id as string;
  };
  const goals = async () => (await h.call('GET', '/projects/aurora/work')).body as Goal[];
  const finished = async () => {
    for (let i = 0; i < 300 && (await goals())[0]?.status === 'running'; i++)
      await new Promise((ok) => setTimeout(ok, 10));
    return (await goals())[0] as Goal;
  };
  return { h, briefs, pastChat, goals, finished };
}

describe('a reply in an agent’s chat can start work', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('a request is offered; Start it puts it on the whiteboard for the same agent, briefed from the chat', async () => {
    const s = studio('{"reply":"I would add a footer to hello.txt.","work":"Add a footer to hello.txt"}');
    h = s.h;
    const runId = await s.pastChat();
    const r = await h.call('POST', `/chats/${runId}/messages`, { text: 'Please add a footer too' });
    expect(r.body.reply.meta).toEqual({ followUp: true, offer: { work: 'Add a footer to hello.txt' } });
    expect(await s.goals()).toHaveLength(0);

    const start = await h.call('POST', `/chats/${runId}/start`, { seq: r.body.reply.seq });
    expect(start.status).toBe(201);
    expect(start.body.message).toMatchObject({
      role: 'assistant',
      meta: { started: { goalId: start.body.goalId, offer: r.body.reply.seq } },
    });
    const goal = await s.finished();
    expect(goal).toMatchObject({ id: start.body.goalId, text: 'Add a footer to hello.txt', status: 'done' });
    expect(goal.items).toHaveLength(1);
    expect(goal.items[0]?.agentId).toBe('a-semic');

    const brief = s.briefs.find((b) => b.includes('Your checklist item: Add a footer to hello.txt')) ?? '';
    expect(brief).toContain('Please add a footer too');
    expect(brief).toContain(`my_history (runId ${runId})`);
    expect(brief).toContain('I would add a footer to hello.txt.');

    /* the chat keeps the started line after a reload, and a second tap is refused */
    const chat = (await h.call('GET', `/chats/${runId}/messages`)).body as { meta: unknown }[];
    expect(chat.at(-1)?.meta).toMatchObject({ started: { goalId: goal.id } });
    const again = await h.call('POST', `/chats/${runId}/start`, { seq: r.body.reply.seq });
    expect(again.status).toBe(409);
    expect(await s.goals()).toHaveLength(1);
  });

  it('a question gets a plain answer and nothing to start', async () => {
    const s = studio('{"reply":"It says hi."}');
    h = s.h;
    const runId = await s.pastChat();
    const r = await h.call('POST', `/chats/${runId}/messages`, { text: 'What is in the file?' });
    expect(r.body.reply.meta).toEqual({ followUp: true });
    const start = await h.call('POST', `/chats/${runId}/start`, { seq: r.body.reply.seq });
    expect(start.status).toBe(422);
    expect(start.body.error.message).toContain('offers no work');
    expect(await s.goals()).toHaveLength(0);
  });

  it('the director’s own chats never offer work', async () => {
    const s = studio('{"reply":"Sure.","work":"Add a footer"}');
    h = s.h;
    const orch = h.store.projects.require('aurora').orchestratorId;
    const r0 = await h.call('POST', '/projects/aurora/runs', { agentId: orch, task: 'Plan' });
    await h.runtime.settled(r0.body.id);
    const r = await h.call('POST', `/chats/${r0.body.id}/messages`, { text: 'Add a footer' });
    expect(r.body.reply.meta).toEqual({ followUp: true });
  });
});
