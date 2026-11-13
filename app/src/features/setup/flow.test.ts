import { describe, expect, it } from 'vitest';
import type { Agent, Draft, Plan, Team } from '../../api';
import {
  briefLine,
  canContinue,
  draftCard,
  orchLine,
  pendingBriefs,
  planLine,
  planView,
  resetsTeamTalk,
  STEP,
  setterAlreadyDone,
  setterDone,
  setterFailed,
  setterPct,
  setterStart,
  setterStep,
  slugify,
  tildePath,
  titleOf,
} from './flow';

const agent = (id: string, name: string, extra: Partial<Agent> = {}): Agent => ({
  id,
  kind: 'agent',
  system: false,
  name,
  nick: null,
  roleId: null,
  role: 'Engineer',
  look: { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'sun' },
  prompt: '',
  teamIds: [],
  projectIds: [],
  canDelete: { ok: true, why: '' },
  createdAt: '',
  updatedAt: '',
  ...extra,
});
const team = (id: string, members: string[], captainId = members[0]): Team =>
  ({
    id,
    name: `The ${id}`,
    color: 'sun',
    emblem: 'rocket',
    blurb: '',
    instr: '',
    code: '',
    captainId,
    reporter: false,
    members: members.map((agentId) => ({ agentId, instr: '' })),
    projectIds: [],
    createdAt: '',
    updatedAt: '',
  }) as Team; // (as: `reporter` may or may not be in Team yet)
const draft = (p: Partial<Draft> = {}): Draft => ({
  id: 'd1',
  mode: 'new',
  step: 1,
  name: '',
  about: '',
  folder: null,
  orchestratorId: null,
  plan: null,
  chat: [],
  createdAt: '',
  updatedAt: '',
  ...p,
});
const plan = (p: Partial<Plan> = {}): Plan => ({
  teams: [],
  specialists: [],
  newAgents: [],
  newTeams: [],
  summary: 's',
  ...p,
});

const pixel = agent('a-pixel', 'Pixel Director', {
  kind: 'orchestrator',
  nick: 'Pixel',
  prompt: 'You are Pixel. I keep the big picture. Always.',
});
const maestro = agent('a-maestro', 'Maestro', { kind: 'orchestrator' });
const orchs = [pixel, maestro];

describe('step machine', () => {
  it('Name needs a name; adopt also needs a folder', () => {
    expect(canContinue(STEP.name, draft(), orchs)).toBe(false);
    expect(canContinue(STEP.name, draft({ name: '  ' }), orchs)).toBe(false);
    expect(canContinue(STEP.name, draft({ name: 'Kite' }), orchs)).toBe(true);
    expect(canContinue(STEP.name, draft({ mode: 'adopt', name: 'Kite' }), orchs)).toBe(false);
    expect(canContinue(STEP.name, draft({ mode: 'adopt', name: 'Kite', folder: 'kite' }), orchs)).toBe(true);
  });
  it('Orchestrator must be a real orchestrator; Team needs a plan that staffs someone', () => {
    expect(canContinue(STEP.orchestrator, draft({ orchestratorId: 'a-maestro' }), orchs)).toBe(true);
    expect(canContinue(STEP.orchestrator, draft({ orchestratorId: 'a-gone' }), orchs)).toBe(false);
    // the user's order: Setter first (needs the folder set up), then the team
    expect(STEP.setup).toBeLessThan(STEP.team);
    expect(canContinue(STEP.setup, draft({ name: 'Kite' }), orchs)).toBe(false);
    expect(canContinue(STEP.setup, draft({ name: 'Kite', setupAt: '2026-11-13T00:00:00Z' }), orchs)).toBe(
      true,
    );
    expect(canContinue(STEP.team, draft(), orchs)).toBe(false);
    expect(canContinue(STEP.team, draft({ plan: plan() }), orchs)).toBe(false);
    expect(canContinue(STEP.team, draft({ plan: plan({ newTeams: [{ brief: 'mobile' }] }) }), orchs)).toBe(
      true,
    );
  });
  it('a different orchestrator after a chat starts the team talk over', () => {
    const d = draft({ orchestratorId: 'a-pixel', chat: [{ from: 'orchestrator', text: 'hi' }] });
    expect(resetsTeamTalk(d, 'a-maestro')).toBe(true);
    expect(resetsTeamTalk(d, 'a-pixel')).toBe(false);
    expect(resetsTeamTalk(draft({ orchestratorId: 'a-pixel' }), 'a-maestro')).toBe(false);
  });
  it('quotes the orchestrator past "You are …"', () => {
    expect(orchLine(pixel)).toBe('“I keep the big picture.”');
    expect(orchLine(undefined)).toBe('');
  });
});

describe('names and folders', () => {
  it('slugify matches the server', () => {
    expect(slugify('Kite Notes!')).toBe('kite-notes');
    expect(slugify('Café Ünïcode')).toBe('cafe-unicode');
    expect(slugify('???')).toBe('project');
  });
  it('folder → title, home → ~', () => {
    expect(titleOf('pocket-recipes')).toBe('Pocket Recipes');
    expect(titleOf('kiln_api')).toBe('Kiln Api');
    expect(tildePath('/Users/stage/dev/AI-Studio-Sandbox')).toBe('~/dev/AI-Studio-Sandbox');
    expect(tildePath('/tmp/sb')).toBe('/tmp/sb');
  });
});

describe('"In setup" card', () => {
  it('maps an early draft', () => {
    const c = draftCard(draft({ step: 1 }), orchs);
    expect(c.title).toBe('Untitled project');
    expect(c.line).toBe('New · Name');
    expect(c.dots).toEqual(['done', 'now', '', '', '']);
    expect(c.label).toBe('Resume untitled project — step 2 of 5, Name');
  });
  it('names the orchestrator from the orchestrator step on', () => {
    const c = draftCard(draft({ mode: 'adopt', step: 3, name: 'Kiln', orchestratorId: 'a-pixel' }), orchs);
    expect(c.line).toBe('Adopting · Setup · Pixel');
    expect(c.dots).toEqual(['done', 'done', 'done', 'now', '']);
  });
  it('clamps a step out of range', () => {
    expect(draftCard(draft({ step: 12 }), orchs).dots.at(-1)).toBe('now');
  });
});

describe('plan on stage', () => {
  const agents = [
    agent('a1', 'Captain'),
    agent('a2', 'Pete'),
    agent('a3', 'Lint'),
    agent('a4', 'Querious', { nick: 'Q' }),
  ];
  const teams = [team('ship', ['a1', 'a2']), team('polish', ['a3', 'a2'], 'a3')];
  it('resolves teams (captains from the team), specialists, briefs and counts', () => {
    const v = planView(
      plan({
        teams: [
          { teamId: 'ship', why: 'builds' },
          { teamId: 'polish', why: 'tidies' },
          { teamId: 'gone', why: '?' },
        ],
        specialists: [{ agentId: 'a4', why: 'data' }],
        newTeams: [{ brief: 'A team for mobile' }],
      }),
      teams,
      agents,
      new Set(['a4']),
    );
    expect(v.teams.map((t) => t.team.id)).toEqual(['ship', 'polish']);
    expect(v.teams[0].members.map((m) => [m.agent.id, m.captain, m.dup])).toEqual([
      ['a1', true, false],
      ['a2', false, false],
    ]);
    expect(v.teams[1].members.find((m) => m.agent.id === 'a2')?.dup).toBe(true);
    expect(v.captains).toEqual(['Captain', 'Lint']);
    expect(v.specialists[0].fresh).toBe(true);
    expect(v.agentCount).toBe(4);
    expect(planLine(v)).toBe('2 teams · 1 specialist · 4 agents.');
    expect(briefLine(v, 'Tinker')).toBe('Tinker designs 1 new team when you accept.');
    expect(pendingBriefs(plan({ newAgents: [{ brief: 'x' }], newTeams: [{ brief: 'y' }] }))).toBe(2);
  });
  it('a specialists-only plan', () => {
    const v = planView(
      plan({ specialists: [{ agentId: 'a2', why: 'x' }], newAgents: [{ brief: 'b' }, { brief: 'c' }] }),
      teams,
      agents,
    );
    expect(planLine(v)).toBe('No teams · 1 specialist · 1 agent.');
    expect(briefLine(v, 'Tinker')).toBe('Tinker designs 2 new specialists when you accept.');
    expect(briefLine(planView(plan(), teams, agents), 'Tinker')).toBe('');
  });
});

describe('Project Setter checklist', () => {
  it('folds live steps; kept/skipped count as finished', () => {
    let s = setterStart('new');
    expect(s.rows).toHaveLength(9);
    expect(setterPct(s)).toBe(0);
    s = setterStep(s, { step: 'folder', status: 'running', detail: 'Preparing kite' }, 'new');
    expect(s.rows[0].state).toBe('doing');
    s = setterStep(s, { step: 'folder', status: 'done', detail: 'Created kite' }, 'new');
    s = setterStep(s, { step: '.project', status: 'kept', detail: 'already there' }, 'new');
    s = setterStep(s, { step: 'commit', status: 'skipped', detail: 'nothing' }, 'new');
    expect(s.rows.map((r) => r.state).slice(0, 2)).toEqual(['done', 'kept']);
    expect(s.rows[0].detail).toBe('Created kite');
    expect(setterPct(s)).toBe(33);
  });
  it('a new run (folder running) starts over; a failure stops the spinner', () => {
    let s = setterStep(setterStart('adopt'), { step: '.env', status: 'done', detail: '' }, 'adopt');
    s = setterStep(s, { step: 'CLAUDE.md', status: 'running', detail: '' }, 'adopt');
    s = setterFailed(s, 'disk full');
    expect(s.failed).toBe('disk full');
    expect(s.rows.some((r) => r.state === 'doing')).toBe(false);
    s = setterStep(s, { step: 'folder', status: 'running', detail: '' }, 'adopt');
    expect(s.failed).toBeNull();
    expect(s.rows.filter((r) => r.state).map((r) => r.step)).toEqual(['folder']);
  });
  it('a draft set up before reads as all done', () => {
    const s = setterAlreadyDone('new');
    expect(s.done && s.rows.every((r) => r.state === 'done')).toBe(true);
    expect(setterPct(s)).toBe(100);
  });
  it('unknown server steps are appended, the finish response is the truth', () => {
    const s = setterDone(
      [
        { step: 'folder', status: 'done', detail: 'Created' },
        { step: 'lint', status: 'done', detail: 'new step' },
      ],
      'new',
    );
    expect(s.done).toBe(true);
    expect(s.rows.at(-1)).toMatchObject({ step: 'lint', state: 'done' });
    expect(setterPct(s)).toBe(100);
  });
});
