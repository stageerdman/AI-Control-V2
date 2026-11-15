/* The director asks someone on the project from chat (`ask`) and relays their answer; its summary says who is
   waiting on which step, so it can explain a queued owner instead of guessing. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { waitsFor } from '../../src/office/threads.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const wait = async (fn: () => Promise<boolean>) => {
  for (let i = 0; i < 200 && !(await fn()); i++) await new Promise((ok) => setTimeout(ok, 20));
};
type Msg = { from: string; kind: string; text: string };

describe('the director asks someone from chat', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const setup = (director: object) => {
    const calls: RunSpec[] = [];
    h = testApp({
      seed: true,
      runner: fakeRunner((spec): FakeStep[] => {
        calls.push(spec);
        if (!contractOf(spec.task) && spec.tools?.length === 0) return [{ result: JSON.stringify(director) }];
        return fakeBrain(spec);
      }),
    });
    mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
    h.store.projects.update('lumi', { folder: 'lumi', teamIds: [], agentIds: ['a-pete'] });
    return calls;
  };
  const orch = () => h.store.projects.require('lumi').orchestratorId;
  const thread = async (): Promise<Msg[]> =>
    (await h.call('GET', `/projects/lumi/threads/${orch()}/messages`)).body.messages;
  const say = (text: string) => h.call('POST', `/projects/lumi/threads/${orch()}/messages`, { text });

  it('asks them right away, the office sees the call, and their answer lands in the chat', async () => {
    const calls = setup({
      reply: 'Asking Pete now.',
      work: null,
      ask: { to: 'Pete', question: 'How is the header going?' },
    });
    await say('Have you asked Pete?');
    await wait(async () => (await thread()).some((m) => m.text.startsWith('Pete: “')));
    const msgs = await thread();
    expect(msgs.map((m) => m.text)).toEqual([
      'Have you asked Pete?',
      'Asking Pete now.',
      expect.stringMatching(/^Pete: “Costume: .*”$/),
    ]);
    // the director's prompt says it can ask, and how
    expect(calls[0]?.task).toContain('"ask"');
    expect(calls[0]?.systemPrompt).toContain('ask anyone on the project');
    // Pete got the question with his steps, from the director (no approval asked)
    const help = calls.find((c) => contractOf(c.task)?.name === 'help');
    expect(help?.task).toContain('How is the header going?');
    expect(help?.task).toContain('Your steps on the whiteboard now');
    const steps = h.events
      .after('project', 'lumi')
      .filter((e) => e.type === 'room.call')
      .map((e) => (e.payload as { status: string; from: string; to: string }).status);
    expect(steps).toEqual(['working', 'answered']);
  });

  it('someone not on the project is an honest line, not a call', async () => {
    setup({ reply: 'Asking Ivy.', work: null, ask: { to: 'Ivy', question: 'Status?' } });
    await say('Ask Ivy');
    await wait(async () => (await thread()).some((m) => m.kind === 'error'));
    expect((await thread()).find((m) => m.kind === 'error')?.text).toBe(
      'I couldn’t ask Ivy: nobody by that name is on Lumi Health.',
    );
    expect(h.events.after('project', 'lumi').some((e) => e.type === 'room.call')).toBe(false);
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
