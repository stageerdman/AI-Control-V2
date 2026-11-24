/* One-Step Team Building, end to end (the Sea GPS case): the user says yes in the director's chat, the director hands
   the request to the Agent Creator, and Tinker's one `build_team` call turns it into Cast agents plus a staffed
   project team — every piece linked to the approved request, so the user can find it and undo it all. */
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { teamRequestsRepo } from '../../src/db/team-requests.ts';
import { teamLookIssues } from '../../src/domain/team-looks.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { until } from '../crew/aurora-studio.ts';
import { worked } from '../crew/brain.ts';
import { directorStudio } from './director-studio.ts';

const SEA_GPS =
  'Build a team for the Sea GPS one-page app presentation: a storyteller and a Presentation Creator, the storyteller as captain.';
const prompt = (who: string) =>
  `You are ${who}. You own one clear job on this team, you work in small, honest steps, and you never invent facts.`;
const marina = {
  name: 'Marina',
  role: 'Storyteller',
  prompt: prompt('Marina, a storyteller who finds the one story an app tells'),
  look: { hat: 'captain', tool: 'quill', body: 'hero', antenna: 'curl', face: 'freckles', hue: 'teal' },
};
const slidewright = {
  name: 'Slidewright',
  role: 'Presentation Creator',
  prompt: prompt('Slidewright, a presentation creator who builds one clear page from a story'),
  look: { hat: 'beret', tool: 'stylus', body: 'lanky', antenna: 'tuft', face: 'glasses', hue: 'sky' },
};
const TIDE_TELLERS = {
  name: 'The Tide Tellers',
  blurb: 'Tell the Sea GPS story on one bright page.',
  instr: 'Find the story first, then shape the one-page presentation around it.',
  code: 'Work in the presentation folder only; keep the page a single, self-contained file.',
  emblem: 'compass',
  color: 'teal',
  members: [
    { newAgent: marina, job: 'Captain: find the story and keep the why.' },
    { newAgent: slidewright, job: 'Build the one-page presentation from the story.' },
  ],
  captain: 'Marina',
};

const isTinker = (s: RunSpec) => s.systemPrompt.startsWith('# Tinker\n');
const requestIn = (task: string) => /Approved request: (tr-[\w-]+)/.exec(task)?.[1] ?? 'none';

/** The studio, with Tinker's whiteboard run playing `tinker` (everyone else just works). */
function seaGps(tinker: (spec: RunSpec, request: string) => FakeStep[]) {
  const s = directorStudio(undefined, (spec) =>
    isTinker(spec) ? tinker(spec, requestIn(spec.task)) : worked('Built.'),
  );
  const requests = () => teamRequestsRepo(s.h.db).list('lumi');
  /** The user asks, the director proposes, the user says yes, the director hands it over. */
  const approve = async () => {
    await s.turn('Build me a team for the Sea GPS presentation');
    await s.turn('Yes, build that team', {
      tool: 'hand_to_agent_creator',
      args: { work: SEA_GPS, user_yes: 'yes, build that team' },
    });
  };
  return { ...s, requests, approve };
}

describe('the Agent Creator builds the approved team in one go', () => {
  let h: ReturnType<typeof directorStudio>['h'];
  afterEach(() => h.close());

  it('Sea GPS: one request becomes Cast agents plus a staffed team, linked to the yes — and undo takes it all back', async () => {
    const s = seaGps((_spec, request) => [
      { tool: 'build_team', args: { request, team: TIDE_TELLERS } },
      { result: 'Built The Tide Tellers.' },
    ]);
    h = s.h;
    await s.approve();
    const [req] = await until(s.requests, (r) => !!r[0]?.built, 15000);
    expect(req?.work).toBe(SEA_GPS);
    expect(req?.yes.words).toBe('Yes, build that team');

    // the Cast has the two new agents, with their roles
    const byName = (n: string) => h.store.agents.list().find((a) => a.name === n);
    expect(byName('Marina')?.role).toBe('Storyteller');
    expect(byName('Slidewright')?.role).toBe('Presentation Creator');
    // the team is on the project, captained by the storyteller
    const team = h.store.teams.list().find((t) => t.name === 'The Tide Tellers');
    expect(team?.captainId).toBe(byName('Marina')?.id);
    expect(team?.members.map((m) => m.agentId)).toEqual([byName('Marina')?.id, byName('Slidewright')?.id]);
    expect(h.store.projects.require('lumi').teamIds).toContain(team?.id);
    // everything built links back to the request
    expect(req?.built).toMatchObject({
      teamId: team?.id,
      agentIds: [byName('Marina')?.id, byName('Slidewright')?.id],
    });
    // the director's chat says what was made
    const thread = await h.call('GET', `/projects/lumi/threads/${s.orch}/messages`);
    expect(thread.body.messages.map((m: { text: string }) => m.text)).toContain(
      'Tinker built The Tide Tellers for you: Marina (Storyteller, captain) and Slidewright (Presentation Creator). They’re in the Cast and on this project. Change them in the Cast, or undo the whole build.',
    );

    // the user sees the request, and undoes the whole build
    const listed = await h.call('GET', '/projects/lumi/team-requests');
    expect(listed.body.requests[0].id).toBe(req?.id);
    const undo = await h.call('POST', `/projects/lumi/team-requests/${req?.id}/undo`);
    expect(undo.status).toBe(200);
    expect(undo.body.undoneAt).toBeTruthy();
    expect(byName('Marina')).toBeUndefined();
    expect(byName('Slidewright')).toBeUndefined();
    expect(h.store.teams.get(team?.id as string)).toBeNull();
    expect(h.store.projects.require('lumi').teamIds).not.toContain(team?.id);
    expect((await h.call('POST', `/projects/lumi/team-requests/${req?.id}/undo`)).status).toBe(409);
  });

  it('refuses a design that breaks the look rules, an unknown request, and a second build', async () => {
    const alike = {
      ...TIDE_TELLERS,
      members: [
        TIDE_TELLERS.members[0],
        { ...TIDE_TELLERS.members[1], newAgent: { ...slidewright, look: { ...marina.look, hat: 'helm' } } },
      ],
    };
    const s = seaGps((_spec, request) => [
      { tool: 'build_team', args: { request: 'tr-nope', team: TIDE_TELLERS } },
      { tool: 'build_team', args: { request, team: alike } },
      { tool: 'build_team', args: { request, team: TIDE_TELLERS } },
      { tool: 'build_team', args: { request, team: { ...TIDE_TELLERS, name: 'The Second Tide' } } },
      { result: 'Done.' },
    ]);
    h = s.h;
    await s.approve();
    await until(s.requests, (r) => !!r[0]?.built, 15000);
    const runs = (await h.call('GET', '/projects/lumi/runs')).body as { id: string; agentId: string }[];
    const tinkerRun = runs.find((x) => x.agentId === 'a-creator') as { id: string };
    await h.runtime.settled(tinkerRun.id);
    const all = getChatMessages(h.db, tinkerRun.id)
      .map((m) => m.text)
      .join('\n');
    expect(all).toContain("Approved team request 'tr-nope' not found");
    expect(all).toContain('share the hue');
    expect(all).toContain('look alike');
    expect(all).toContain("the 'helm' hat marks the captain");
    expect(all).toContain('is already built');
    expect(h.store.teams.list().filter((t) => t.name === 'The Second Tide')).toEqual([]);
  });

  it('build_team is offered to the Agent Creator only', async () => {
    const s = seaGps(() => worked('ok'));
    h = s.h;
    const r = await h.call('POST', '/projects/lumi/runs', { agentId: 'a-pete', task: 'go' });
    await h.runtime.settled(r.body.id);
    expect(s.calls.at(-1)?.studioTools?.names).not.toContain('build_team');
  });
});

describe('teamLookIssues', () => {
  const m = (name: string, look: object, o: { fresh?: boolean; captain?: boolean } = {}) => ({
    name,
    fresh: o.fresh ?? true,
    captain: o.captain ?? false,
    look: { hat: 'beret', tool: 'quill', body: 'hero', hue: 'sun', ...look },
  });
  it('different looks pass', () => {
    expect(teamLookIssues([m('A', { hat: 'captain' }, { captain: true }), m('B', { tool: 'stylus', body: 'lanky', hue: 'sky' })])).toEqual([]);
  });
  it('two Cast agents already alike are left alone; a new one must differ', () => {
    const old = (n: string) => m(n, {}, { fresh: false });
    expect(teamLookIssues([old('A'), old('B')])).toEqual([]);
    expect(teamLookIssues([old('A'), m('C', { hue: 'sky', tool: 'stylus' })])).toEqual([
      'A and C look alike — make at least two of hat, tool and body differ',
    ]);
  });
});
