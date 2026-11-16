/* Conversation checks: the director chats that went wrong before, played back through the director's chat and the
   fake runner, so they never come back. Each one checks what actually changed (features, board, runs, asks), not
   only what the reply says — the old failures were all replies that promised or claimed something that never
   happened, or a "can't" for something the studio can do.

   Played back:
   - "add dark mode to the features list" — Pixel said it couldn't (it had no features tools).
   - "have you asked Twinkle?" — Pixel said yes; the ask only ran after the reply, and a failure was never told.
   - "stop everything" — the stop ran after the reply, and inside the turn it would have stopped Pixel itself.
   - "stop" four times in a row — each stop must answer plainly, even when nothing is left to stop.
   - "said it stopped but didn't" — the reply must come after the stop really happened.
   - "carry on" — the resume ran after the reply, so "carrying on" could be false.
   - "tell <agent> option 2" — Pixel couldn't answer an agent's question for the user (the real chat named
     Uncle Bob; here it is Professor Prompt, who is on Lumi), and the agent's chat lost the question. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import { workRepo } from '../../src/db/work.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
type Call = { tool: string; args: Record<string, unknown> };
type Line = { from: string; text: string };

/** What a plain agent run does, by its task: wait to be stopped, ask a question, or just finish. */
function agentWork(spec: RunSpec): FakeStep[] {
  if (spec.task === 'long') return [{ wait: 10_000 }, { result: 'never' }];
  if (spec.task === 'paint the logo')
    return [{ ask: 'Blue or green?', options: ['Blue', 'Green'] }, { result: 'Painted it.' }];
  return [{ result: 'Built.' }];
}

/** Lumi (Twinkle and Professor Prompt, director Pixel) with a folder; the director's turns play the scripted tool
    calls, then reply "Done."; a person asked from chat says "The header is half done."; other contracts use the fake brain. */
function studio() {
  const prompts: string[] = [];
  const turns: Call[][] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      if (isChat(spec)) {
        prompts.push(spec.systemPrompt ?? '');
        return [...(turns.shift() ?? []), { result: 'Done.' }];
      }
      if (contractOf(spec.task)?.name === 'help')
        return [{ result: '{"answer":"The header is half done.","say":"half done"}' }];
      if (contractOf(spec.task)) return fakeBrain(spec);
      return agentWork(spec);
    }),
  });
  mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
  h.store.projects.update('lumi', { folder: 'lumi' });
  const director = h.store.projects.require('lumi').orchestratorId;
  const thread = `/projects/lumi/threads/${director}/messages`;

  /** The user says `text`; the director's turn runs `calls` → what each tool answered, and how the turn ended. */
  const say = async (text: string, ...calls: Call[]) => {
    turns.push(calls);
    const r = await h.call('POST', thread, { text });
    const turn = await h.runtime.settled(r.body.runId);
    const said = getChatMessages(h.db, r.body.runId)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text);
    return { tools: said.slice(0, calls.length), reply: said.at(-1), status: turn.status };
  };
  const startRun = async (agentId: string, task: string) =>
    (await h.call('POST', '/projects/lumi/runs', { agentId, task })).body.id as string;
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 300 && !done(); i++) await new Promise((ok) => setTimeout(ok, 10));
  };
  const lines = async (agentId: string) =>
    ((await h.call('GET', `/projects/lumi/threads/${agentId}/messages`)).body.messages as Line[]).map((m) => [
      m.from,
      m.text,
    ]);
  return { h, prompts, director, say, startRun, until, lines };
}

describe('conversation checks: the chats that went wrong before', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('"add dark mode to the features list" adds it under Planned, and puts nothing on the whiteboard', async () => {
    const s = studio();
    h = s.h;
    const { tools, reply } = await s.say('add dark mode to the features list', {
      tool: 'add_feature',
      args: { name: 'Dark mode' },
    });
    expect(s.prompts[0]).toContain('`add_feature`');
    expect(s.prompts[0]).not.toContain('as a feature'); // the old "on the whiteboard as a feature" mix-up
    expect(tools[0]).toMatch(/^Added to the features list: f-dark-mode — Dark mode \[planned #/);
    expect(reply).toBe('Done.');
    const features = (await h.call('GET', '/projects/lumi/features')).body as {
      id: string;
      status: string;
    }[];
    expect(features).toContainEqual(expect.objectContaining({ id: 'f-dark-mode', status: 'planned' }));
    expect(workRepo(h.db).goals('lumi')).toEqual([]);
  });

  it('"have you asked Twinkle?" really asks during the turn, and the director reads the answer first', async () => {
    const s = studio();
    h = s.h;
    const { tools } = await s.say('have you asked Twinkle?', {
      tool: 'ask_person',
      args: { to: 'Twinkle', question: 'How is the header going?' },
    });
    // the answer comes back to act on, not to relay as "Twinkle said…"
    expect(tools[0]).toBe(
      'Twinkle’s answer, for you to act on (tell the user the outcome, not who said what): “The header is half done.”',
    );
    const calls = h.events.after('project', 'lumi').filter((e) => e.type === 'room.call');
    expect(calls.map((e) => (e.payload as { status: string }).status)).toEqual(['working', 'answered']);

    // someone who isn't in the studio is refused in the turn, and nobody is called
    const nobody = await s.say('have you asked Ivy?', {
      tool: 'ask_person',
      args: { to: 'Ivy', question: 'Hi?' },
    });
    expect(nobody.tools[0]).toMatch(/^ask_person refused: Nobody called Ivy is in the studio/);
    expect(h.events.after('project', 'lumi').filter((e) => e.type === 'room.call')).toHaveLength(2);
  });

  it('"stop everything" stops every run but the director’s own turn', async () => {
    const s = studio();
    h = s.h;
    const runs = [await s.startRun('a-twinkle', 'long'), await s.startRun('a-prof', 'long')];
    const { tools, status } = await s.say('stop everything', { tool: 'stop_work', args: { everyone: true } });
    expect(tools[0]).toBe('Stopped everything: 2 sessions.');
    expect(status).toBe('succeeded');
    for (const run of runs) expect((await h.runtime.settled(run)).status).toBe('cancelled');
    expect((await h.call('GET', '/projects/lumi/running')).body).toEqual([]);
  });

  it('"stop" four times in a row: the first stops, the rest say all quiet, every turn ends well', async () => {
    const s = studio();
    h = s.h;
    const run = await s.startRun('a-twinkle', 'long');
    const said: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      const { tools, status } = await s.say('stop', { tool: 'stop_work', args: { everyone: true } });
      expect(status).toBe('succeeded');
      said.push(tools[0]);
    }
    expect(said).toEqual([
      'Stopped everything: 1 session.',
      'Nothing was running — all quiet.',
      'Nothing was running — all quiet.',
      'Nothing was running — all quiet.',
    ]);
    expect((await h.runtime.settled(run)).status).toBe('cancelled');
  });

  it('"said it stopped but didn’t": the stop has happened before the reply is written', async () => {
    const s = studio();
    h = s.h;
    const run = await s.startRun('a-prof', 'long');
    const { tools, reply } = await s.say('stop Professor', {
      tool: 'stop_work',
      args: { agents: ['Professor Prompt'] },
    });
    expect(tools[0]).toMatch(/^Stopped Professor Prompt: 1 session\./);
    expect(reply).toBe('Done.'); // the reply comes after the tool's answer, in the same turn
    expect(h.runtime.get('lumi', run).status).not.toBe('running'); // already stopped when the turn ends
    expect((await h.runtime.settled(run)).status).toBe('cancelled');
  });

  it('"carry on" puts the stopped goal back on, and it runs to done', async () => {
    const s = studio();
    h = s.h;
    const work = workRepo(h.db);
    work.insertGoal(
      { id: 'g1', projectId: 'lumi', text: 'Chat history', summary: 'Agents keep their chats.' },
      [{ id: 'i1', text: 'Build the history view', brief: 'b', agentId: 'a-twinkle', teamId: null }],
    );
    work.setItem('i1', { status: 'failed', note: 'Stopped' });
    work.setGoalStatus('g1', 'failed');

    const { tools } = await s.say('carry on', { tool: 'resume_goal', args: { goals: [1] } });
    expect(tools[0]).toBe('Back on the whiteboard: Agents keep their chats.');
    await s.until(() => work.goal('g1')?.status === 'done');
    expect(work.goal('g1')?.status).toBe('done');
  });

  it('"tell Professor option 2" answers his question: his run carries on and his chat shows question and answer', async () => {
    const s = studio();
    h = s.h;
    const run = await s.startRun('a-prof', 'paint the logo');
    await s.until(() => h.runtime.asks('lumi', 'open').length > 0);
    const ask = h.runtime.asks('lumi', 'open')[0] as { id: string };

    const { tools } = await s.say('tell Professor to use option 2', {
      tool: 'answer_question',
      args: { id: ask.id, option: 2 },
    });
    expect(tools[0]).toBe('Answered Professor: “Green” — their work carries on.');
    expect((await h.runtime.settled(run)).status).toBe('succeeded');
    expect(h.runtime.asks('lumi', 'open')).toEqual([]);
    expect(await s.lines('a-prof')).toEqual([
      ['a-prof', 'Blue or green?'],
      ['user', 'Green'],
    ]);
  });
});
