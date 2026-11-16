/* The director answers an agent's open question for the user ("tell Pete to use option 2"): `answer_question` goes
   through the user's own answer path, so the waiting run carries on and Pete's chat shows the question and the
   answer like any user answer. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
type Call = { tool: string; args: Record<string, unknown> };

/** Lumi with Pete, whose work asks "Blue or green?"; the director's turns play `turns`, then a plain reply. */
function studio() {
  const calls: RunSpec[] = [];
  const turns: Call[][] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      if (isChat(spec)) {
        calls.push(spec);
        return [...(turns.shift() ?? []), { result: 'Done.' }];
      }
      return [{ ask: 'Blue or green?', options: ['Blue', 'Green'] }, { result: 'Painted it.' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
  h.store.projects.update('lumi', { folder: 'lumi', teamIds: [], agentIds: ['a-pete'] });
  const orch = h.store.projects.require('lumi').orchestratorId;
  const turn = async (text: string, call: Call) => {
    turns.push([call]);
    const r = await h.call('POST', `/projects/lumi/threads/${orch}/messages`, { text });
    await h.runtime.settled(r.body.runId);
    return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text;
  };
  /** Pete starts work and waits on his question → the run and the open ask. */
  const peteAsks = async () => {
    const run = (await h.call('POST', '/projects/lumi/runs', { agentId: 'a-pete', task: 'paint the logo' }))
      .body as { id: string };
    for (let i = 0; i < 200 && !h.runtime.asks('lumi', 'open').length; i++)
      await new Promise((ok) => setTimeout(ok, 10));
    return { run, ask: h.runtime.asks('lumi', 'open')[0] as { id: string } };
  };
  return { h, calls, turn, peteAsks };
}

describe('the director answers agents’ questions for the user', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('“tell Pete option 2”: the run gets the answer and Pete’s chat shows it like a user answer', async () => {
    const s = studio();
    h = s.h;
    const { run, ask } = await s.peteAsks();

    const listed = await s.turn('What is Pete waiting on?', { tool: 'open_questions', args: {} });
    expect(JSON.parse(listed as string)).toEqual([
      { id: ask.id, from: 'Pixel Pete', question: 'Blue or green?', options: ['1. Blue', '2. Green'] },
    ]);
    // the summary carries the id and options too, and the prompt says the director can answer
    expect(s.calls[0]?.task).toContain(`"openQuestions":[{"id":"${ask.id}","from":"Pixel Pete"`);
    expect(s.calls[0]?.systemPrompt).toContain('`answer_question`');

    const said = await s.turn('Tell Pete to use option 2', {
      tool: 'answer_question',
      args: { id: ask.id, option: 2 },
    });
    expect(said).toBe('Answered Pete: “Green” — their work carries on.');
    const done = await h.runtime.settled(run.id);
    expect(done.status).toBe('succeeded');
    expect(getChatMessages(h.db, run.id).map((m) => m.text)).toContain('Green');
    expect(h.runtime.asks('lumi', 'answered')[0]).toMatchObject({ id: ask.id, answer: 'Green' });
    const pete = (await h.call('GET', '/projects/lumi/threads/a-pete/messages')).body.messages as {
      from: string;
      text: string;
    }[];
    expect(pete.map((m) => [m.from, m.text])).toEqual([
      ['a-pete', 'Blue or green?'],
      ['user', 'Green'],
    ]);
  });

  it('a missing option, a gone question or no answer is refused, and the run keeps waiting', async () => {
    const s = studio();
    h = s.h;
    const { ask } = await s.peteAsks();
    expect(await s.turn('Option 3', { tool: 'answer_question', args: { id: ask.id, option: 3 } })).toBe(
      'answer_question refused: Option 3 doesn’t exist — this question has 2 (1–2).',
    );
    expect(await s.turn('Say it', { tool: 'answer_question', args: { id: ask.id } })).toBe(
      'answer_question refused: Give "answer" (the user’s words) or "option" (its number).',
    );
    expect(await s.turn('Answer it', { tool: 'answer_question', args: { id: 'nope', answer: 'Blue' } })).toMatch(
      /^answer_question refused: No open question nope/,
    );
    expect(h.runtime.asks('lumi', 'open').map((a) => a.id)).toEqual([ask.id]);

    // the user's own words, with an option, pass through as one answer
    await s.turn('Blue, but lighter', {
      tool: 'answer_question',
      args: { id: ask.id, option: 1, answer: 'make it lighter' },
    });
    expect(h.runtime.asks('lumi', 'answered')[0]?.answer).toBe('Blue — make it lighter');
  });
});
