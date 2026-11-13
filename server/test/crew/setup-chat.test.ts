import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf, extractJson } from '../../src/crew/structured.ts';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { testApp } from '../helpers.ts';
import { type Answer, scriptedCrew } from './brain.ts';

const SHIP = {
  reply: 'The Ship-It Squad can carry this one.',
  plan: { teams: [{ teamId: 'ship-it', why: 'builds features end to end' }], summary: 'Ship-It builds it.' },
};
const SHIP_PROF = {
  reply: 'Added the Professor for the research.',
  plan: {
    teams: [{ teamId: 'ship-it', why: 'builds features end to end' }],
    specialists: [{ agentId: 'a-prof', why: 'research before code' }],
    summary: 'Ship-It builds, the Professor researches.',
  },
};

function studio(answers: Record<string, Answer[]>) {
  const crew = scriptedCrew(answers);
  const h = testApp({ seed: true, runner: crew.runner });
  return { h, crew };
}
const newDraft = async (h: ReturnType<typeof testApp>) =>
  (await h.call('POST', '/drafts', { mode: 'new', name: 'Moon Shop', about: 'A small web shop.' })).body;

describe('setup chat with the orchestrator', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('opens with a proposal, then edits the plan from what the user says', async () => {
    const s = studio({ 'setup-chat': [SHIP, SHIP_PROF] });
    h = s.h;
    const d = await newDraft(h);
    const open = await h.call('POST', `/drafts/${d.id}/chat`, {});
    expect(open.status).toBe(200);
    expect(open.body).toMatchObject({
      reply: SHIP.reply,
      plan: { teams: SHIP.plan.teams, specialists: [], newAgents: [], newTeams: [] },
      chat: [{ from: 'orchestrator', text: SHIP.reply }],
    });
    const turn = await h.call('POST', `/drafts/${d.id}/chat`, { text: 'add a research specialist' });
    expect(turn.body.plan.specialists).toEqual([{ agentId: 'a-prof', why: 'research before code' }]);
    expect(turn.body.chat.map((m: { from: string }) => m.from)).toEqual([
      'orchestrator',
      'user',
      'orchestrator',
    ]);
    expect((await h.call('GET', `/drafts/${d.id}/chat`)).body).toEqual({
      chat: turn.body.chat,
      plan: turn.body.plan,
    });

    // what the orchestrator was given: its brain, the Cast, the brief, the plan so far, the user's words
    const [first, second] = s.crew.crewCalls();
    expect(contractOf(second?.task ?? '')).toEqual({ name: 'setup-chat', repair: false });
    expect(first?.systemPrompt).toMatch(/^# Pixel\n[\s\S]*Big picture only[\s\S]*ONE JSON object/);
    expect(second?.task).toContain('"id":"ship-it"');
    expect(second?.task).toContain('"captain":"a-semic"');
    expect(second?.task).toContain('A small web shop.');
    expect(second?.task).toContain('The user now says: "add a research specialist"');
    expect(second?.task).toContain('Current plan: {"teams":[{"teamId":"ship-it"');
    // big picture only: no tools, a scratch dir, no secrets
    expect(second?.tools).toEqual([]);
    expect(second?.cwd).toBe(join(h.config.home, 'scratch'));
    expect(second?.secretValues).toEqual([]);

    const types = h.events.after('draft', d.id).map((e) => e.type);
    expect(types).toEqual([
      'agent.status',
      'tokens',
      'chat.message',
      'plan.changed',
      'agent.status',
      'agent.status',
      'tokens',
      'chat.message',
      'chat.message',
      'plan.changed',
      'agent.status',
    ]);
    expect(h.events.after('draft', d.id).at(-2)?.payload).toEqual({
      summary: SHIP_PROF.plan.summary,
      teamIds: ['ship-it'],
      agentIds: ['a-prof'],
      newAgents: 0,
      newTeams: 0,
    });
  });

  it('repairs once: an answer that breaks the contract is sent back with the issues, in the same session', async () => {
    const s = studio({
      'setup-chat': [
        'Sure! I think Ship-It is great.', // prose, no JSON
        {
          reply: 'x',
          plan: {
            teams: [{ teamId: 'ship-it', why: 'x' }],
            specialists: [{ agentId: 'a-pete', why: 'more UI' }],
            summary: 's',
          },
        },
        SHIP,
      ],
    });
    h = s.h;
    const d = await newDraft(h);
    // prose, then an answer that breaks a rule → 502, nothing saved
    const bad = await h.call('POST', `/drafts/${d.id}/chat`, { text: 'who do you suggest?' });
    expect(bad.status).toBe(502);
    expect(bad.body.error).toMatchObject({
      code: 'agent_error',
      message: "Pixel's answer didn't follow the setup-chat contract (asked twice)",
      details: {
        issues: ['Pixel Pete already comes with The Ship-It Squad — teams stay whole; drop the specialist'],
      },
    });
    expect((await h.call('GET', `/drafts/${d.id}/chat`)).body).toEqual({ chat: [], plan: null });
    const [a, b] = s.crew.crewCalls();
    expect(contractOf(b?.task ?? '')).toEqual({ name: 'setup-chat', repair: true });
    expect(b?.task).toContain('- The answer has no JSON object');
    expect(b?.resumeSessionId).toBe(`fake-${a?.runId}`);
    // the next turn succeeds first time
    expect((await h.call('POST', `/drafts/${d.id}/chat`, { text: 'who do you suggest?' })).status).toBe(200);
  });

  it('a repaired answer is accepted', async () => {
    const s = studio({
      'setup-chat': [{ reply: 'hi', plan: { teams: [{ teamId: 'ghost', why: 'x' }], summary: 's' } }, SHIP],
    });
    h = s.h;
    const d = await newDraft(h);
    const r = await h.call('POST', `/drafts/${d.id}/chat`, {});
    expect(r.status).toBe(200);
    expect(s.crew.crewCalls()[1]?.task).toContain("- No team 'ghost' in the Cast");
  });

  it('a failed run is a 502; a draft without an orchestrator is a 409; one turn at a time', async () => {
    const s = studio({
      'setup-chat': [
        [{ fail: 'Claude Code exited (code 1): not logged in' }],
        [{ wait: 100 }, { result: JSON.stringify(SHIP) }],
      ],
    });
    h = s.h;
    const d = await newDraft(h);
    const r = await h.call('POST', `/drafts/${d.id}/chat`, {});
    expect(r.status).toBe(502);
    expect(r.body.error.message).toBe('Pixel could not finish: Claude Code exited (code 1): not logged in');
    const slow = h.call('POST', `/drafts/${d.id}/chat`, {});
    await new Promise((x) => setTimeout(x, 20));
    const again = await h.call('POST', `/drafts/${d.id}/chat`, { text: 'hello?' });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/Pixel is still thinking/);
    expect((await slow).status).toBe(200);
    await h.call('PATCH', `/drafts/${d.id}`, { orchestratorId: null });
    expect((await h.call('POST', `/drafts/${d.id}/chat`, { text: 'hi' })).status).toBe(409);
    expect((await h.call('POST', '/drafts/d-nope/chat', {})).status).toBe(404);
    expect((await h.call('POST', `/drafts/${d.id}/chat`, { text: '' })).status).toBe(422);
  });
});

describe('crew plumbing', () => {
  it('extracts the JSON object from plain, fenced or wrapped answers', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure — {"a":3} — done')).toEqual({ a: 3 });
    expect(() => extractJson('no json here')).toThrow(/no JSON object/);
  });

  it('a tool-less crew run disables every built-in tool and loads no MCP server', () => {
    const argv = cliArgs(
      {
        runId: 'r',
        cwd: '/x',
        systemPrompt: 'p',
        task: 't',
        model: 'm',
        caps: { maxTurns: 3, maxBudgetUsd: 0.5 },
        env: {},
        secretValues: [],
        tools: [],
      },
      { askServer: '/a.ts' },
    );
    expect(argv[argv.indexOf('--tools') + 1]).toBe('');
    expect(argv).not.toContain('--allowed-tools');
    expect(JSON.parse(argv[argv.indexOf('--mcp-config') + 1] as string)).toEqual({ mcpServers: {} });
    expect(argv).toContain('--restricted');
  });
});
