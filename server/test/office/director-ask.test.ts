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
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
type Call = { tool: string; args: Record<string, unknown> };

/** A studio where the director's turns play `turns` (tool calls, then a plain reply); `help` plays `helper`. */
function studio(helper: (spec: RunSpec) => FakeStep[] = fakeBrain) {
  const calls: RunSpec[] = [];
  const turns: Call[][] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      calls.push(spec);
      if (isChat(spec)) return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
      if (contractOf(spec.task)?.name === 'help') return helper(spec);
      if (contractOf(spec.task)) return fakeBrain(spec);
      return [{ result: 'Built.' }];
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
    expect(said).toMatch(/^Pete answered: “Costume: .*”$/);
    // the director's prompt says it can ask
    expect(s.calls[0]?.systemPrompt).toContain('`ask_person`');
    // Pete got the question with his steps, from the director (no approval asked)
    const help = s.calls.find((c) => contractOf(c.task)?.name === 'help');
    expect(help?.task).toContain('How is the header going?');
    expect(help?.task).toContain('Your steps on the whiteboard now');
    const steps = h.events
      .after('project', 'lumi')
      .filter((e) => e.type === 'room.call')
      .map((e) => (e.payload as { status: string }).status);
    expect(steps).toEqual(['working', 'answered']);
  });

  it('someone not on the project is an honest refusal, not a call', async () => {
    const s = studio();
    h = s.h;
    const said = await s.turn('Ask Ivy', { tool: 'ask_person', args: { to: 'Ivy', question: 'Status?' } });
    expect(said).toBe(
      'ask_person refused: Nobody called Ivy is on Lumi Health — use a name from the summary’s people.',
    );
    expect(h.events.after('project', 'lumi').some((e) => e.type === 'room.call')).toBe(false);
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
