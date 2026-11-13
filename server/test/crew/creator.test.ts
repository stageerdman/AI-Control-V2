import { afterEach, describe, expect, it } from 'vitest';
import { castView } from '../../src/db/drafts.ts';
import {
  type AgentDef,
  AgentDefSchema,
  agentDefIssues,
  type MintContext,
  type TeamDef,
  TeamDefSchema,
  teamDefIssues,
} from '../../src/domain/creator.ts';
import { testApp } from '../helpers.ts';
import { type Answer, scriptedCrew } from './brain.ts';

const look: AgentDef['look'] = {
  hat: 'goggles',
  tool: 'cog',
  body: 'lanky',
  antenna: 'curl',
  face: 'glasses',
  hue: 'mint',
};
const agent = (name: string, role = 'Mobile'): AgentDef => ({
  name,
  role,
  prompt: `You are ${name}, a ${role} engineer. Build native apps, test on real devices, keep builds green.`,
  look,
});
const MOBILE_TEAM: TeamDef = {
  name: 'The Pocket Rockets',
  blurb: 'Mobile apps from first sketch to store.',
  instr: 'Own everything mobile. The captain splits the work and reports to the orchestrator.',
  code: 'apps/mobile/ holds the app; shared types come from types/. Tests next to code.',
  emblem: 'droneship',
  color: 'coral',
  members: [
    { newAgent: agent('Swifty McSwipe'), job: 'Lead the iOS build.' },
    {
      newAgent: { ...agent('Kotlin Kate'), look: { ...look, hat: 'headlamp', hue: 'sky' } },
      job: 'Own Android.',
    },
    { agentId: 'a-scar', job: 'Test plan for both stores.' },
  ],
  captain: 'Swifty McSwipe',
};
const PLAN = {
  teams: [{ teamId: 'polish', why: 'keeps it tidy' }],
  newAgents: [{ brief: 'a data-viz specialist for the dashboard' }],
  newTeams: [{ brief: 'a mobile team for iOS and Android' }],
  summary: 'Polish tidies, a viz specialist and a new mobile team build.',
};

function studio(answers: Record<string, Answer[]>) {
  const crew = scriptedCrew(answers);
  const h = testApp({ seed: true, runner: crew.runner });
  return { h, crew };
}
async function draftWithPlan(h: ReturnType<typeof testApp>, plan: object = PLAN) {
  const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'Pocket Shop', about: 'Shop with apps.' }))
    .body;
  expect((await h.call('PATCH', `/drafts/${d.id}`, { plan })).status).toBe(200);
  return d as { id: string };
}

describe('Agent Creator: minting on accept', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('accept mints a specialist (new role) and a whole team (captain ∈ members), resolves the plan, and finish staffs it', async () => {
    const s = studio({ 'mint-agent': [agent('Chartreuse Charts', 'Data Viz')], 'mint-team': [MOBILE_TEAM] });
    h = s.h;
    const roles = h.store.roles.list().length;
    const d = await draftWithPlan(h);
    const r = await h.call('POST', `/drafts/${d.id}/accept`);
    expect(r.status).toBe(200);
    const { plan, minted } = r.body;
    expect(minted.roles.map((x: { name: string }) => x.name)).toEqual(['Data Viz', 'Mobile']);
    expect(h.store.roles.list()).toHaveLength(roles + 2);
    expect(minted.agents.map((a: { name: string }) => a.name)).toEqual([
      'Chartreuse Charts',
      'Swifty McSwipe',
      'Kotlin Kate',
    ]);
    const viz = minted.agents[0];
    expect(viz).toMatchObject({ kind: 'agent', role: 'Data Viz', look: { ...look, decal: 'Backend' } });
    const team = minted.teams[0];
    const swifty = minted.agents[1];
    expect(team).toMatchObject({
      name: 'The Pocket Rockets',
      emblem: 'droneship',
      color: 'coral',
      captainId: swifty.id,
    });
    expect(team.members.map((m: { agentId: string }) => m.agentId)).toEqual([
      swifty.id,
      minted.agents[2].id,
      'a-scar',
    ]);
    expect(plan).toEqual({
      teams: [
        { teamId: 'polish', why: 'keeps it tidy' },
        { teamId: team.id, why: 'a mobile team for iOS and Android' },
      ],
      specialists: [{ agentId: viz.id, why: 'a data-viz specialist for the dashboard' }],
      newAgents: [],
      newTeams: [],
      summary: PLAN.summary,
    });
    // the creator speaks in the chat; the setup stream hears about every addition
    const chat = (await h.call('GET', `/drafts/${d.id}/chat`)).body.chat;
    expect(chat.map((m: { from: string }) => m.from)).toEqual(['creator', 'creator']);
    expect(chat[1].text).toMatch(
      /^Here's The Pocket Rockets: Swifty McSwipe, Kotlin Kate, Scarlett Scenario — Swifty McSwipe captains/,
    );
    const created = h.events
      .after('draft', d.id)
      .filter((e) => e.type === 'cast.created')
      .map((e) => (e.payload as { kind: string }).kind);
    expect(created).toEqual(['role', 'role', 'agent', 'agent', 'agent', 'team']);
    // the creator was asked with its own brain, the brief, the look slots and the emblem ids
    const [ask] = s.crew.crewCalls();
    expect(ask?.systemPrompt).toMatch(/^# Tinker/);
    expect(ask?.task).toContain('a data-viz specialist for the dashboard');
    expect(ask?.task).toContain('"hat":["none","headphones"');
    expect(s.crew.crewCalls()[1]?.task).toContain('"droneship"');
    expect(s.crew.crewCalls()[1]?.task).toContain('"Chartreuse Charts"'); // earlier design's name is taken

    // accepted → finish staffs the project with the real ids
    const fin = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(fin.status).toBe(201);
    expect(fin.body.project).toMatchObject({ teamIds: ['polish', team.id], agentIds: [viz.id] });
  });

  it('accept is all or nothing: a brief the creator fails twice leaves the Cast and the plan untouched', async () => {
    const bad = { ...MOBILE_TEAM, captain: 'Nobody' };
    const s = studio({ 'mint-agent': [agent('Chartreuse Charts', 'Data Viz')], 'mint-team': [bad, bad] });
    h = s.h;
    const before = {
      agents: h.store.agents.list().length,
      roles: h.store.roles.list().length,
      teams: h.store.teams.list().length,
    };
    const d = await draftWithPlan(h);
    const r = await h.call('POST', `/drafts/${d.id}/accept`);
    expect(r.status).toBe(502);
    expect(r.body.error.details.issues[0]).toMatch(/^captain: must be one of the team's members/);
    expect({
      agents: h.store.agents.list().length,
      roles: h.store.roles.list().length,
      teams: h.store.teams.list().length,
    }).toEqual(before);
    expect((await h.call('GET', `/drafts/${d.id}/chat`)).body.plan.newTeams).toHaveLength(1);
    expect(h.events.after('draft', d.id).some((e) => e.type === 'cast.created')).toBe(false);
    expect((await h.call('POST', `/drafts/${d.id}/finish`)).status).toBe(409); // still not accepted
  });

  it('accept is one transaction: if the Cast changes under it, the minted agents roll back too', async () => {
    let hh: ReturnType<typeof testApp> | undefined;
    const s = studio({
      'mint-agent': [agent('Chartreuse Charts', 'Data Viz')],
      'mint-team': [
        () => {
          hh?.store.teams.deleteRecord('polish'); // the planned team disappears mid-accept
          return MOBILE_TEAM;
        },
      ],
    });
    h = s.h;
    hh = h;
    const agents = h.store.agents.list().length;
    const d = await draftWithPlan(h);
    const r = await h.call('POST', `/drafts/${d.id}/accept`);
    expect(r.status).toBe(422);
    expect(h.store.agents.list()).toHaveLength(agents);
    expect(h.store.roles.findByName('Data Viz')).toBeNull();
  });

  it('a repaired design is accepted; roles are reused by name; no plan → 409; nothing to mint → plan as is', async () => {
    const s = studio({
      'mint-agent': [{ ...agent('Pixel Pete', 'frontend') }, agent('Glimmer', 'frontend')],
    });
    h = s.h;
    const d = await draftWithPlan(h, {
      teams: [{ teamId: 'polish', why: 'x' }],
      newAgents: [{ brief: 'another frontend hand' }],
      summary: 's',
    });
    const r = await h.call('POST', `/drafts/${d.id}/accept`);
    expect(r.status).toBe(200);
    expect(s.crew.crewCalls()[1]?.task).toContain(
      "- name: 'Pixel Pete' is already in the Cast — pick another name",
    );
    expect(r.body.minted.roles).toEqual([]);
    expect(r.body.minted.agents[0]).toMatchObject({ name: 'Glimmer', role: 'Frontend' });
    const again = await h.call('POST', `/drafts/${d.id}/accept`);
    expect(again.status).toBe(200);
    expect(again.body.minted).toEqual({ roles: [], agents: [], teams: [] });
    const empty = (await h.call('POST', '/drafts', { mode: 'new', name: 'Empty' })).body;
    expect((await h.call('POST', `/drafts/${empty.id}/accept`)).status).toBe(409);
  });
});

describe('Agent Creator: design rules', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const ctx = (): MintContext => ({
    agentNames: h.store.agents.records().map((a) => a.name),
    teamNames: h.store.teams.list().map((t) => t.name),
    agent: castView(h.store.agents, h.store.teams).agent,
    specialists: ['a-prof'],
  });

  it('looks come from the studio slots, never the crew-only gear', () => {
    h = testApp({ seed: true });
    expect(AgentDefSchema.safeParse(agent('Ok Bot')).success).toBe(true);
    for (const bad of [{ hat: 'director' }, { tool: 'megaphone' }, { hue: 'purple' }, { body: 'robot' }])
      expect(AgentDefSchema.safeParse({ ...agent('X Bot'), look: { ...look, ...bad } }).success).toBe(false);
    expect(agentDefIssues(agent('captain semicolon'), ctx())).toEqual([
      "name: 'captain semicolon' is already in the Cast — pick another name",
    ]);
  });

  it('teams: valid emblem + colour, 2–7 members, captain ∈ members, no crew, no duplicates, ≤ 4 new agents', () => {
    h = testApp({ seed: true });
    expect(teamDefIssues(MOBILE_TEAM, ctx())).toEqual([]);
    expect(TeamDefSchema.safeParse(MOBILE_TEAM).success).toBe(true);
    expect(TeamDefSchema.safeParse({ ...MOBILE_TEAM, emblem: 'unicorn' }).success).toBe(false);
    expect(TeamDefSchema.safeParse({ ...MOBILE_TEAM, color: 'black' }).success).toBe(false);
    const eight = Array.from({ length: 8 }, (_, i) => ({ newAgent: agent(`Bot ${i}`), job: 'x' }));
    expect(TeamDefSchema.safeParse({ ...MOBILE_TEAM, members: eight }).success).toBe(false);
    expect(TeamDefSchema.safeParse({ ...MOBILE_TEAM, members: [MOBILE_TEAM.members[0]] }).success).toBe(
      false,
    );
    const issues = (patch: Partial<TeamDef>) => teamDefIssues({ ...MOBILE_TEAM, ...patch }, ctx());
    expect(issues({ captain: 'a-pete' })[0]).toMatch(/^captain: must be one of the team's members/);
    expect(issues({ captain: 'a-scar' })).toEqual([]); // an existing member may captain a new team
    expect(issues({ name: 'the ship-it squad' })[0]).toMatch(/already exists/);
    expect(issues({ members: [...MOBILE_TEAM.members, { agentId: 'a-creator', job: 'x' }] })).toContain(
      "members.3.agentId: Tinker is studio crew and can't join teams",
    );
    expect(issues({ members: [...MOBILE_TEAM.members, { agentId: 'a-scar', job: 'x' }] })).toContain(
      "members.3.agentId: 'a-scar' is listed twice",
    );
    expect(issues({ members: [...MOBILE_TEAM.members, { agentId: 'a-ghost', job: 'x' }] })).toContain(
      "members.3.agentId: no agent 'a-ghost' in the Cast",
    );
    expect(issues({ members: [...MOBILE_TEAM.members, { agentId: 'a-prof', job: 'x' }] })).toContain(
      'members.3.agentId: Professor Prompt is already on the plan as a specialist',
    );
    const five = Array.from({ length: 5 }, (_, i) => ({ newAgent: agent(`Bot ${i}`), job: 'x' }));
    expect(issues({ members: five, captain: 'Bot 0' })[0]).toMatch(/at most 4 new agents/);
  });
});
