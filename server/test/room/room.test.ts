/* AGENT MCP: the room — the Agent Creator joins on accept, calls a fellow agent (the orchestrator OKs it),
   and project agents call each other (a member's captain OKs someone new). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeStep } from '../../src/runtime/fake.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

type Ev = { type: string; payload: Record<string, unknown> };
const of = (evs: Ev[], type: string) => evs.filter((e) => e.type === type).map((e) => e.payload);

async function acceptedDraft(h: ReturnType<typeof testApp>) {
  const d = (
    await h.call('POST', '/drafts', { mode: 'new', name: 'Pocket Shop', about: 'A shop with apps.' })
  ).body;
  await h.call('POST', `/drafts/${d.id}/chat`, {});
  await h.call('POST', `/drafts/${d.id}/chat`, { text: 'and design a new team for mobile' });
  const r = await h.call('POST', `/drafts/${d.id}/accept`);
  return { d, r };
}

describe('the setup room (free runner)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('the orchestrator calls Tinker in; Tinker asks to bring in Twinkle, Pixel says yes, Twinkle joins and answers', async () => {
    h = testApp({ seed: true });
    const { d, r } = await acceptedDraft(h);
    expect(r.status).toBe(200);
    expect(r.body.minted.teams).toHaveLength(1); // still minted — through create_team

    const evs = h.events.after('draft', d.id) as Ev[];
    expect(of(evs, 'room.joined')).toEqual([
      { agentId: 'a-creator', by: 'a-pixel', why: 'design a new team' },
      { agentId: 'a-twinkle', by: 'a-creator', why: 'design the costume' },
    ]);
    expect(of(evs, 'room.call').map((c) => c.status)).toEqual(['asking', 'approved', 'working', 'answered']);
    expect(of(evs, 'room.call')[0]).toMatchObject({
      from: 'a-creator',
      to: 'a-twinkle',
      approver: 'a-pixel',
    });

    const chat = (await h.call('GET', `/drafts/${d.id}/chat`)).body.chat as {
      from: string;
      agentId?: string;
      text: string;
    }[];
    const room = chat.slice(-5);
    expect(room).toEqual([
      {
        from: 'orchestrator',
        to: 'a-creator',
        text: 'Tinker, could you design a new team for this project?',
      },
      { from: 'creator', to: 'a-pixel', text: 'Pixel, may I bring in Twinkle to design the costume?' },
      { from: 'orchestrator', to: 'a-creator', text: 'Yes — go ahead.' },
      {
        from: 'agent',
        agentId: 'a-twinkle',
        to: 'a-creator',
        text: 'Done — a beret, a palette and a rose finish',
      },
      { from: 'creator', text: expect.stringMatching(/^Here's The Night Shift/) },
    ]);
  });

  it('a no is final: nobody joins, Tinker does it himself, and the design still lands', async () => {
    const mintSteps = (spec: { task: string }): FakeStep[] => [
      {
        tool: 'call_agent',
        args: { agent: 'Twinkle', request: 'A costume for Nova, please.', why: 'design the costume' },
      },
      {
        tool: 'create_agent',
        args: {
          name: 'Nova',
          role: 'Mobile',
          prompt:
            'You are Nova, the mobile specialist. Build small, test on both platforms, and keep it simple.',
          look: { hat: 'goggles', tool: 'cog', body: 'lanky', antenna: 'bob', face: 'freckles', hue: 'mint' },
        },
      },
      { tokens: { input: 10, output: 5 } },
      { result: spec.task ? 'all done' : '' }, // not JSON — the staged design wins
    ];
    const s = scriptedCrew({
      'mint-agent': [mintSteps],
      'allow-call': [{ allow: false, reply: 'No, Tinker can dress them from the brief.' }],
    });
    h = testApp({ seed: true, runner: s.runner });
    const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'Shop', about: 'x' })).body;
    await h.call('PATCH', `/drafts/${d.id}`, {
      orchestratorId: 'a-pixel',
      plan: {
        teams: [],
        specialists: [],
        newAgents: [{ brief: 'A specialist for mobile' }],
        newTeams: [],
        summary: 'One new specialist.',
      },
    });
    const r = await h.call('POST', `/drafts/${d.id}/accept`);
    expect(r.body.error).toBeUndefined();
    expect(r.body.minted.agents.map((a: { name: string }) => a.name)).toEqual(['Nova']);
    expect(s.crewCalls().filter((c) => c.task.startsWith('AI Studio contract: mint-agent'))).toHaveLength(1); // no repair
    const evs = h.events.after('draft', d.id) as Ev[];
    expect(of(evs, 'room.joined').map((j) => j.agentId)).toEqual(['a-creator']);
    expect(of(evs, 'room.call').map((c) => c.status)).toEqual(['asking', 'declined']);
    const texts = (await h.call('GET', `/drafts/${d.id}/chat`)).body.chat.map(
      (m: { text: string }) => m.text,
    );
    expect(texts).toContain('Not this time — Tinker can dress them from the brief.');
    expect(texts).toContain('Okay — I’ll do it myself.');
  });

  it('create_agent checks the design at once and lists what to fix', async () => {
    const seen: string[] = [];
    const s = scriptedCrew({
      'mint-agent': [
        (): FakeStep[] => [
          { tool: 'create_agent', args: { name: 'Twinkle', role: 'X', prompt: 'short', look: {} } },
          { tokens: { input: 1, output: 1 } },
          { result: '{}' },
        ],
        (): FakeStep[] => [{ result: '{}' }],
      ],
    });
    h = testApp({ seed: true, runner: s.runner });
    const origStart = s.runner.start.bind(s.runner);
    s.runner.start = (spec, io) =>
      origStart(spec, { ...io, emit: (e) => (e.kind === 'text' && seen.push(e.text), io.emit(e)) });
    const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'Shop', about: 'x' })).body;
    await h.call('PATCH', `/drafts/${d.id}`, {
      orchestratorId: 'a-pixel',
      plan: {
        teams: [],
        specialists: [],
        newAgents: [{ brief: 'A specialist for mobile' }],
        newTeams: [],
        summary: 'x',
      },
    });
    expect((await h.call('POST', `/drafts/${d.id}/accept`)).status).toBe(502); // nothing valid staged or answered
    expect(seen[0]).toMatch(/^create_agent refused: Not yet — fix this and call again:\n- /);
    expect(seen[0]).toMatch(/prompt/);
  });
});

describe('calls inside a project', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const project = (work: () => FakeStep[], answers: Record<string, object[]>) => {
    const s = scriptedCrew(answers, () => work());
    h = testApp({ seed: true, runner: s.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    return s;
  };
  const runOf = async (agentId: string) => {
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId, task: 'go' })).body;
    return h.runtime.settled(run.id);
  };

  it('a member bringing in someone new asks their captain; someone already in the room is called right away', async () => {
    const s = project(
      () => [
        {
          tool: 'call_agent',
          args: {
            agent: 'Professor Prompt',
            request: 'Find two sources on checkout UX.',
            why: 'find sources',
          },
        },
        {
          tool: 'call_agent',
          args: { agent: 'twinkle', request: 'Is this button too loud?', why: 'check a button' },
        },
        { tool: 'room', args: {} },
        { result: 'ok' },
      ],
      {
        'allow-call': [{ allow: true, reply: 'Yes — go ahead.' }],
        help: [
          { answer: 'Two sources: …', say: 'two sources' },
          { answer: 'A bit — tone it down.', say: 'tone it down' },
        ],
      },
    );
    const run = await runOf('a-pete');
    expect(run.status).toBe('succeeded');
    const [allow, ...rest] = s.crewCalls();
    expect(allow?.task).toMatch(/^AI Studio contract: allow-call/);
    expect(allow?.systemPrompt).toMatch(/^# Captain Semicolon/); // Pete's captain decides
    expect(rest.map((c) => c.task.split('\n')[0])).toEqual([
      'AI Studio contract: help',
      'AI Studio contract: help',
    ]);
    expect(rest[0]?.cwd).toBe(join(h.config.sandbox, 'aurora')); // a project helper reads the folder…
    expect(rest[0]?.tools).toEqual(['Read', 'Glob', 'Grep']); // …and changes nothing
    expect(rest[0]?.studioTools?.names).toEqual(['room', 'call_agent', 'studio_catalog', 'comms_log']);
    const evs = h.events.after('project', 'aurora') as Ev[];
    expect(of(evs, 'room.joined')).toEqual([{ agentId: 'a-prof', by: 'a-pete', why: 'find sources' }]);
    expect(of(evs, 'room.call').map((c) => c.status)).toEqual([
      'asking',
      'approved',
      'working',
      'answered', // the professor, after the captain's yes
      'working',
      'answered', // Twinkle is on the project already
    ]);
    // the agent's own prompt says how to work with the others
    const agentRun = s.calls.find((c) => !c.task.startsWith('AI Studio contract'));
    expect(agentRun?.systemPrompt).toContain('## Working with others');
    expect(agentRun?.studioTools?.names).toEqual([
      'room',
      'call_agent',
      'comms_log',
      'my_runs',
      'cancel_run',
      'my_history',
      'feature',
      'propose_feature',
      'cant_do',
      'send_mail',
      'mail_directory',
      'page_user',
      'my_todos',
      'add_todo',
      'done_todo',
      'forget',
    ]);
    expect(agentRun?.systemPrompt).toContain('## Your memory');
  });

  it('a captain bringing in someone new asks the orchestrator', async () => {
    const s = project(
      () => [
        { tool: 'call_agent', args: { agent: 'Professor Prompt', request: 'Sources?', why: 'find sources' } },
        { result: 'ok' },
      ],
      { 'allow-call': [{ allow: true, reply: 'Yes.' }], help: [{ answer: 'x', say: 'y' }] },
    );
    await runOf('a-semic');
    expect(s.crewCalls()[0]?.systemPrompt).toMatch(/^# Pixel/);
  });
});
