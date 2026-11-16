/* Calls inside a project (Elon's check, section C): the orchestrator answers calls, a callee answers from its
   own notes, `work: true` puts the request on the whiteboard as the callee's task, and a callee takes one call at a time. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesk } from '../../src/office/desk.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { type Answer, scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

type Ev = { type: string; payload: Record<string, unknown> };
const callSteps = (h: ReturnType<typeof testApp>) =>
  (h.events.after('project', 'aurora') as Ev[])
    .filter((e) => e.type === 'room.call')
    .map((e) => `${e.payload.from}→${e.payload.to}:${e.payload.status}`);

describe('calls inside a project', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const project = (work: (spec: RunSpec) => FakeStep[], answers: Record<string, Answer[]>) => {
    const s = scriptedCrew(answers, work);
    h = testApp({ seed: true, runner: s.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    return s;
  };
  const start = async (agentId: string) =>
    (await h.call('POST', '/projects/aurora/runs', { agentId, task: 'go' })).body.id as string;
  /** Whose run this is: the agent's own prompt opens with `# <name>`. */
  const isRunOf = (spec: RunSpec, agentId: string) =>
    spec.systemPrompt.startsWith(`# ${h.store.agents.require(agentId).name}\n`);
  const callOnce = (agent: string, args: Record<string, unknown>) => (spec: RunSpec): FakeStep[] =>
    isRunOf(spec, agent)
      ? [{ tool: 'call_agent', args }, { result: 'ok' }]
      : [{ result: 'Done.' }];

  it('an agent calls the orchestrator by name and gets an answer, no refusal', async () => {
    const s = project(callOnce('a-pete', { agent: 'Pixel', request: 'Is checkout in scope?', why: 'check scope' }), {
      help: [{ answer: 'Yes, checkout is in scope.', say: 'in scope' }],
    });
    const run = await h.runtime.settled(await start('a-pete'));
    expect(run.status).toBe('succeeded');
    expect(s.crewCalls().map((c) => c.systemPrompt?.split('\n')[0])).toEqual(['# Pixel']);
    expect(callSteps(h)).toEqual(['a-pete→a-pixel:working', 'a-pete→a-pixel:answered']);
  });

  it("the callee's help task carries its latest desk note", async () => {
    const s = project(callOnce('a-pete', { agent: 'Twinkle', request: 'Where is the button?', why: 'ask' }), {
      help: [{ answer: 'Top right.', say: 'top right' }],
    });
    createDesk({ db: h.db, events: h.events }).save('aurora', 'a-twinkle', null, {
      where: 'header done',
      doing: 'the checkout button',
      next: 'tone it down',
    });
    await h.runtime.settled(await start('a-pete'));
    const task = s.crewCalls()[0]?.task ?? '';
    expect(task).toContain('Your notes on this project');
    expect(task).toContain('doing the checkout button');
  });

  it('work: true puts the request on the whiteboard as the callee’s task', async () => {
    project(
      callOnce('a-pete', { agent: 'Twinkle', request: 'Restyle the checkout button.', why: 'restyle', work: true }),
      { help: [{ answer: 'On it.', say: 'on it' }] },
    );
    await h.runtime.settled(await start('a-pete'));
    const goals = (await h.call('GET', '/projects/aurora/work')).body as {
      text: string;
      items: { agentId: string }[];
    }[];
    const goal = goals.find((g) => g.text === 'Restyle the checkout button.');
    expect(goal?.items.map((i) => i.agentId)).toEqual(['a-twinkle']);
  });

  it('two calls to the same callee run one after the other', async () => {
    const slow = (answer: string) => (): FakeStep[] => [
      { wait: 40 },
      { result: JSON.stringify({ answer, say: answer }) },
    ];
    project(
      (spec) =>
        isRunOf(spec, 'a-pete') || isRunOf(spec, 'a-semic')
          ? [{ tool: 'call_agent', args: { agent: 'Twinkle', request: 'Quick look?', why: 'look' } }, { result: 'ok' }]
          : [{ result: 'Done.' }],
      { help: [slow('first'), slow('second')] },
    );
    const runs = [await start('a-pete'), await start('a-semic')];
    await Promise.all(runs.map((id) => h.runtime.settled(id)));
    const toTwinkle = callSteps(h)
      .filter((l) => l.includes('→a-twinkle:working') || l.includes('→a-twinkle:answered'))
      .map((l) => l.split(':')[1]);
    expect(toTwinkle).toEqual(['working', 'answered', 'working', 'answered']);
  });
});
