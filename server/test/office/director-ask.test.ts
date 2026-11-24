/* The director asks someone on the project from chat (`ask_person`) and continues stopped goals (`resume_goal`):
   both run during its turn, so it reads their answer — or why not — before it replies. Its summary says who is
   waiting on which step, so it can explain a queued owner instead of guessing. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import { workRepo } from '../../src/db/work.ts';
import { waitsFor } from '../../src/office/threads.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { worked } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
type Call = { tool: string; args: Record<string, unknown> };

/** A studio where the director's turns play `turns` (tool calls, then a plain reply); `help` plays `helper`,
    whiteboard builds play `build`. */
function studio(
  helper: (spec: RunSpec) => FakeStep[] = fakeBrain,
  build: (spec: RunSpec) => FakeStep[] = () => worked('Built.'),
) {
  const calls: RunSpec[] = [];
  const turns: Call[][] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      calls.push(spec);
      if (isChat(spec)) return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
      if (contractOf(spec.task)?.name === 'help') return helper(spec);
      if (contractOf(spec.task)) return fakeBrain(spec);
      return build(spec);
    }),
  });
  mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
  h.store.projects.update('lumi', { folder: 'lumi', teamIds: [], agentIds: ['a-pete'] });
  const orch = h.store.projects.require('lumi').orchestratorId;
  /** One director turn running `call` → what the tool answered. */
  const turn = async (text: string, call: Call) => {
    turns.push([call]);
    const r = await h.call('POST', `/projects/lumi/threads/${orch}/messages`, { text });
    await h.runtime.settled(r.body.runId);
    return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text;
  };
  return { h, calls, turn };
}

describe('the director asks someone from chat', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('asks them during the turn, the office sees the call, and the director reads their answer', async () => {
    const s = studio();
    h = s.h;
    const said = await s.turn('Have you asked Pete?', {
      tool: 'ask_person',
      args: { to: 'Pete', question: 'How is the header going?' },
    });
    // the answer is for the director to act on, not to relay
    expect(said).toMatch(
      /^Pete’s answer, for you to act on \(tell the user the outcome, not who said what\): “Costume: .*”$/,
    );
    // the director's prompt says it can ask, and to resolve rather than relay
    expect(s.calls[0]?.systemPrompt).toContain('`ask_person`');
    expect(s.calls[0]?.systemPrompt).toContain('tell the user the result, not who said what');
    // Pete got the question with his steps, from the director (no approval asked)
    const help = s.calls.find((c) => contractOf(c.task)?.name === 'help');
    expect(help?.task).toContain('How is the header going?');
    expect(help?.task).toContain('Your steps on the whiteboard now');
    // every agent knows only leaders stop or interrupt, and to wait for them
    expect(help?.systemPrompt).toContain('Only leaders stop or interrupt others');
    const steps = h.events
      .after('project', 'lumi')
      .filter((e) => e.type === 'room.call')
      .map((e) => (e.payload as { status: string }).status);
    expect(steps).toEqual(['working', 'answered']);
  });

  it('someone nowhere in the studio is an honest refusal, not a call', async () => {
    const s = studio();
    h = s.h;
    const said = await s.turn('Ask Ivy', { tool: 'ask_person', args: { to: 'Ivy', question: 'Status?' } });
    expect(said).toBe(
      'ask_person refused: Nobody called Ivy is in the studio — use a name from the summary’s people or the Cast.',
    );
    expect(h.events.after('project', 'lumi').some((e) => e.type === 'room.call')).toBe(false);
  });

  it('someone off the project is asked directly: they join the room and answer', async () => {
    const s = studio();
    h = s.h;
    const said = await s.turn('Ask Twinkle directly', {
      tool: 'ask_person',
      args: { to: 'Twinkle', question: 'Can you check the docs?' },
    });
    expect(said).toMatch(/^Twinkle’s answer, for you to act on/);
    const joined = h.events.after('project', 'lumi').filter((e) => e.type === 'room.joined');
    expect(joined.map((e) => (e.payload as { agentId: string }).agentId)).toEqual(['a-twinkle']);
  });

  /* "build me a team": ask_person said nobody called Tinker or Agent Creator exists */
  it.each(['Tinker', 'Agent Creator', 'agent creator'])('reaches the Agent Creator as “%s”', async (to) => {
    const s = studio();
    h = s.h;
    const said = await s.turn(`Ask ${to} to design a storyteller`, {
      tool: 'ask_person',
      args: { to, question: 'Could you design a storyteller agent?' },
    });
    expect(said).toMatch(/^Tinker’s answer, for you to act on/);
    const joined = h.events.after('project', 'lumi').filter((e) => e.type === 'room.joined');
    expect(joined.map((e) => (e.payload as { agentId: string }).agentId)).toEqual(['a-creator']);
    // the director's summary names who designs new agents
    expect(s.calls[0]?.task).toContain('"agentCreator":"Tinker"');
  });

  it('`work: true` hands them a side quest: it goes on the whiteboard as their task', async () => {
    const s = studio();
    h = s.h;
    const said = await s.turn('Have Twinkle write the docs', {
      tool: 'ask_person',
      args: { to: 'Twinkle', question: 'Write the setup docs', work: true },
    });
    expect(said).toContain('On the whiteboard as Twinkle’s task');
    const help = s.calls.find((c) => contractOf(c.task)?.name === 'help');
    expect(help?.task).toContain('hands you this work');
    const mine = workRepo(h.db)
      .goals('lumi')
      .flatMap((g) => g.items)
      .filter((i) => i.agentId === 'a-twinkle');
    expect(mine).toHaveLength(1);
    // …and it queues on Twinkle's own to-do list, asked by the director
    const orch = h.store.projects.require('lumi').orchestratorId;
    const listed = await h.call('GET', '/projects/lumi/todos?agentId=a-twinkle');
    expect(listed.body.todos).toEqual([
      expect.objectContaining({
        text: expect.stringContaining('Write the setup docs'),
        fromId: orch,
        status: 'open',
      }),
    ]);
    // the object-use log saw the director use ask_person, and the how-to page shows it
    const used = await h.call('GET', '/projects/lumi/tool-use');
    expect(used.body.uses).toContainEqual(
      expect.objectContaining({ tool: 'ask_person', agentId: orch, uses: 1 }),
    );
    const page = await h.app.inject({ method: 'GET', url: '/projects/lumi/how-to' });
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.body).toMatch(/<code>ask_person<\/code><\/td><td>the director<\/td><td>1 — /);
  });

  it('`work: true` is a real task: it runs, stays open on a plan, closes only after real work', async () => {
    /* SuperCut: the board brief was the call's "say how you will do it", so the build only replied with a plan
       and the side quest showed done, 100% */
    const builds: { brief: string; status?: string; continues?: number }[] = [];
    const mineNow = () =>
      workRepo(h.db)
        .goals('lumi')
        .flatMap((g) => g.items)
        .find((i) => i.agentId === 'a-twinkle');
    const s = studio(fakeBrain, (spec) => {
      const it = mineNow();
      builds.push({ brief: spec.task, status: it?.status, continues: it?.continues });
      return builds.length === 1
        ? [{ result: 'First I will run swift build and swift test, then file the verdict.' }]
        : [{ activity: { kind: 'running', label: 'swift build' } }, { result: 'Green.' }];
    });
    h = s.h;
    await s.turn('Have Twinkle run the Swift build check', {
      tool: 'ask_person',
      args: { to: 'Twinkle', question: 'Run the Swift build check: swift build and test.', work: true },
    });
    const task = mineNow();
    expect(task?.text).toBe('Run the Swift build check: swift build and test.');
    // the board brief is the work itself, never the call's framing
    expect(task?.brief).not.toContain('how you will do it');
    for (let i = 0; i < 200 && mineNow()?.status !== 'done'; i++)
      await new Promise((ok) => setTimeout(ok, 20));
    // it ran; the plan-only reply kept it open (running again, carrying on), and only the real work closed it
    expect(builds.map(({ status, continues }) => ({ status, continues }))).toEqual([
      { status: 'running', continues: 0 },
      { status: 'running', continues: 1 },
    ]);
    expect(builds[0]?.brief).toContain('Run the Swift build check');
    expect(builds[0]?.brief).not.toContain('how you will do it');
    expect(builds[1]?.brief).toContain('did no work');
    expect(mineNow()).toMatchObject({ status: 'done', note: 'Green.' });
  });

  it('a `work: true` task that only ever replies with a plan never shows as done', async () => {
    const s = studio(fakeBrain, () => [{ result: 'Here is my plan.' }]);
    h = s.h;
    await s.turn('Have Twinkle run the Swift build check', {
      tool: 'ask_person',
      args: { to: 'Twinkle', question: 'Run the Swift build check.', work: true },
    });
    const mine = () =>
      workRepo(h.db)
        .goals('lumi')
        .flatMap((g) => g.items)
        .find((i) => i.agentId === 'a-twinkle');
    for (let i = 0; i < 200 && mine()?.status !== 'failed'; i++)
      await new Promise((ok) => setTimeout(ok, 20));
    expect(mine()?.status).toBe('failed');
    expect(mine()?.note).toMatch(/without doing the work/);
  });

  it('a call that fails comes back to the director in the same turn', async () => {
    const s = studio(() => [{ fail: 'brain offline' }]);
    h = s.h;
    const said = await s.turn('Ask Pete', { tool: 'ask_person', args: { to: 'Pete', question: 'Status?' } });
    expect(said).toMatch(/^ask_person refused: Couldn’t reach Pete: /);
  });
});

describe('the director continues stopped work from chat', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('sees stopped goals, `resume_goal` puts them back on, and an asked agent sees its stopped steps', async () => {
    const s = studio();
    h = s.h;
    const work = workRepo(h.db);
    work.insertGoal(
      { id: 'g1', projectId: 'lumi', text: 'Chat history', summary: 'Agents keep their chats.' },
      [{ id: 'i1', text: 'Build the history view', brief: 'b', agentId: 'a-pete', teamId: null }],
    );
    work.setItem('i1', { status: 'failed', note: 'Stopped' });
    work.setGoalStatus('g1', 'failed');

    // asked about it first: Pete is told about his stopped step (not an empty whiteboard)
    await s.turn('Ask Pete to continue', {
      tool: 'ask_person',
      args: { to: 'Pete', question: 'Can you continue?' },
    });
    const help = s.calls.find((c) => contractOf(c.task)?.name === 'help');
    expect(help?.task).toContain('Build the history view');
    expect(help?.task).toContain('stopped partway');
    // the director's summary lists it under "stopped", and it can continue it
    expect(s.calls[0]?.task).toContain('"stopped":[{"n":1,"goal":"Chat history"');
    expect(s.calls[0]?.systemPrompt).toContain('`resume_goal`');

    const said = await s.turn('Continue it', { tool: 'resume_goal', args: { goals: [1, 3] } });
    expect(said).toBe(
      'Back on the whiteboard: Agents keep their chats.\nNo stopped goal 3 — the summary lists 1.',
    );
    for (let i = 0; i < 200 && work.goal('g1')?.status !== 'done'; i++)
      await new Promise((ok) => setTimeout(ok, 20));
    expect(work.goal('g1')?.status).toBe('done');
  });
});

describe('waitsFor (checklist order, as dispatch runs it)', () => {
  const it3 = (a: string, b: string, c: string, parallel = [false, false, false]) =>
    [a, b, c].map((status, i) => ({ status, parallel: parallel[i] as boolean, n: i }));
  it('a todo item waits on the first unfinished item before its parallel group', () => {
    expect(waitsFor(it3('running', 'todo', 'todo'), 1)?.n).toBe(0);
    expect(waitsFor(it3('done', 'running', 'todo'), 2)?.n).toBe(1);
    expect(waitsFor(it3('running', 'todo', 'todo', [false, false, true]), 2)?.n).toBe(0); // runs with item 1
    expect(waitsFor(it3('done', 'done', 'todo'), 2)).toBeNull();
    expect(waitsFor(it3('todo', 'todo', 'todo'), 0)).toBeNull();
  });
});
