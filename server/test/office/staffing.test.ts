/* The director staffs a project from chat (existing Cast agents only, before any work), and HQ agents propose new
   agents into the Cast as Tinker drafts. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const wait = async (fn: () => Promise<boolean>) => {
  for (let i = 0; i < 200 && !(await fn()); i++) await new Promise((ok) => setTimeout(ok, 20));
};

describe('the director staffs from chat', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  /** The director's chat turn plays `turn` (tool calls), then a plain reply. */
  const setup = (turn: FakeStep[]) => {
    const calls: RunSpec[] = [];
    h = testApp({
      seed: true,
      runner: fakeRunner((spec): FakeStep[] => {
        calls.push(spec);
        if (spec.task.startsWith('Studio summary right now: ')) return [...turn, { result: 'Done.' }];
        if (contractOf(spec.task)) return fakeBrain(spec);
        return [{ result: 'Built.' }];
      }),
    });
    mkdirSync(join(h.config.sandbox, 'lumi'), { recursive: true });
    h.store.projects.update('lumi', { folder: 'lumi', teamIds: [], agentIds: [] });
    return calls;
  };
  const thread = async () =>
    (
      await h.call(
        'GET',
        `/projects/lumi/threads/${h.store.projects.require('lumi').orchestratorId}/messages`,
      )
    ).body.messages;

  const turnSaid = (runId: string) =>
    getChatMessages(h.db, runId)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text);

  it('a new team from Cast agents + a specialist join in the turn, then the goal goes to them', async () => {
    const calls = setup([
      {
        tool: 'staff_project',
        args: {
          team: {
            name: 'The Founders',
            captain: 'Pixel Pete',
            members: [
              { agent: 'Pixel Pete', job: 'Lead' },
              { agent: 'Scarlett Scenario', job: 'Test' },
            ],
          },
          specialists: ['Twinkle'],
        },
      },
      {
        tool: 'add_goal',
        args: { text: 'Design five new agent looks', tasks: [{ text: 'Five looks', owner: 'Pixel Pete' }] },
      },
    ]);
    const orch = h.store.projects.require('lumi').orchestratorId;
    const r = await h.call('POST', `/projects/lumi/threads/${orch}/messages`, {
      text: 'Set up our first team and design five new looks',
    });
    await h.runtime.settled(r.body.runId);
    const [joined, added] = turnSaid(r.body.runId);
    expect(joined).toMatch(
      /^Joined the project: .*Pixel Pete.*Twinkle.*Teams on the project now include: The Founders\.$/,
    );
    expect(added).not.toMatch(/refused/);
    expect((await thread()).every((m: { goalId: string | null }) => !!m.goalId)).toBe(true);
    // the director saw who it may add
    expect(calls[0]?.task).toContain('"castAvailable"');
    const p = h.store.projects.require('lumi');
    const team = h.store.teams.list().find((t) => t.name === 'The Founders');
    expect(team?.captainId).toBe('a-pete');
    expect(p.teamIds).toEqual([team?.id]);
    expect(p.agentIds).toEqual(['a-twinkle']);
    const evs = h.events.after('project', 'lumi');
    expect(
      evs
        .filter((e) => e.type === 'room.joined')
        .map((e) => (e.payload as { agentId: string }).agentId)
        .sort(),
    ).toEqual(['a-pete', 'a-scar', 'a-twinkle']);
    expect(evs.find((e) => e.type === 'staff.changed')?.payload).toMatchObject({
      added: expect.arrayContaining(['a-pete', 'a-twinkle']),
    });
    expect((await thread()).map((m: { kind: string }) => m.kind)).not.toContain('error');
  });

  it('an unknown name is refused in the turn: nobody added, and the director reads why', async () => {
    setup([{ tool: 'staff_project', args: { specialists: ['Steve Jobs'] } }]);
    const orch = h.store.projects.require('lumi').orchestratorId;
    const r = await h.call('POST', `/projects/lumi/threads/${orch}/messages`, {
      text: 'Bring in Steve Jobs and build it',
    });
    await h.runtime.settled(r.body.runId);
    expect(turnSaid(r.body.runId)[0]).toBe(
      'staff_project refused: There\'s nobody called "Steve Jobs" in the Cast — new agents are designed with Tinker first',
    );
    expect(h.store.projects.require('lumi').agentIds).toEqual([]);
    expect((await h.call('GET', '/projects/lumi/work')).body).toEqual([]);
  });
});

describe('HQ agents propose new agents', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('propose_agent (HQ only) puts a checked draft in the Cast for the user', async () => {
    const calls: RunSpec[] = [];
    const draft = {
      name: 'Captain Nova',
      role: 'Product Vision',
      summary: 'A starship-style captain who keeps the crew on mission.',
      prompt:
        'You are Captain Nova, a calm visionary who turns fuzzy goals into a clear mission and keeps scope small.',
      look: { hat: 'captain', tool: 'flag', body: 'hero', antenna: 'bob', face: 'none', hue: 'sky' },
    };
    h = testApp({
      seed: true,
      runner: fakeRunner(
        (s) => (
          calls.push(s),
          [
            { tool: 'propose_agent', args: { draft, note: 'a captain for HQ' } },
            { tool: 'propose_agent', args: { draft: { name: 'x' } } },
            { result: 'ok' },
          ]
        ),
      ),
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    let r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-twinkle', task: 'go' })).body;
    await h.runtime.settled(r.id);
    expect(calls[0]?.studioTools?.names).not.toContain('propose_agent'); // not HQ
    await h.call('PATCH', '/settings', { hqProjectId: 'aurora' });
    r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-twinkle', task: 'go' })).body;
    await h.runtime.settled(r.id);
    expect(calls[1]?.studioTools?.names).toContain('propose_agent');
    const { sessions } = (await h.call('GET', '/creator/sessions')).body;
    expect(sessions).toHaveLength(1); // the broken second proposal was refused
    expect(sessions[0].draft).toMatchObject({ name: 'Captain Nova', role: 'Product Vision' });
    expect(sessions[0].chat[0].text).toBe(
      'Twinkle sent this design over from Aurora Storefront — a captain for HQ. Tell me what to change, or add them to the Cast.',
    );
    /* the proposer's office hears it at once, so the Cast's drafts refresh without a reload */
    const drafted = h.events.after('project', 'aurora').filter((e) => e.type === 'cast.drafted');
    expect(drafted.map((e) => e.payload)).toEqual([
      { sessionId: sessions[0].id, name: 'Captain Nova', by: 'a-twinkle' },
    ]);
  });
});
