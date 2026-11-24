/* One-Step Team Building, start to finish, on a Sea GPS project: the user asks for a storyteller and a Presentation
   Creator; the director asks Tinker, then the user; the user says yes; the director hands it over; Tinker builds the
   agents and the team; the director's chat shows the card; the user changes one, removes one (and brings it back),
   removes it all and brings it all back — the same server calls the "built for you" card makes. */
import { afterEach, describe, expect, it } from 'vitest';
import { until } from '../crew/aurora-studio.ts';
import type { directorStudio } from './director-studio.ts';
import { SEA_GPS, seaGps, TIDE_TELLERS } from './sea-gps.ts';

type Line = { from: string; text: string; teamRequestId?: string };

describe('Sea GPS: build me a team for a one-page app presentation', () => {
  let h: ReturnType<typeof directorStudio>['h'];
  afterEach(() => h.close());

  it('ask → yes → handed over → built → seen in chat → changed, removed and brought back', async () => {
    const s = seaGps((_spec, request) => [
      { tool: 'build_team', args: { request, team: TIDE_TELLERS } },
      { result: 'Built The Tide Tellers.' },
    ]);
    h = s.h;
    h.store.projects.update('lumi', { name: 'Sea GPS' });
    const agent = (n: string) => h.store.agents.list().find((a) => a.name === n);
    const cast = () => h.store.agents.list().length;
    const before = cast();

    // 1. the user asks; the director reaches the Agent Creator by role, to shape the proposal
    const ask = 'Build me a team: a storyteller and a Presentation Creator for a one-page app presentation';
    const asked = await s.turn(ask, {
      tool: 'ask_person',
      args: { to: 'Agent Creator', question: 'What would a storyteller plus a Presentation Creator team look like?' },
    });
    expect(asked).toMatch(/^Tinker’s answer, for you to act on/);
    expect(s.requests()).toEqual([]); // asking builds nothing

    // 2. the user says yes; the director hands it over with the yes quoted
    const handed = await s.turn('Yes, build it', {
      tool: 'hand_to_agent_creator',
      args: { work: SEA_GPS, user_yes: 'yes, build it' },
    });
    expect(handed).toContain('with the user’s yes recorded');

    // 3. Tinker builds it: two new Cast agents, a team captained by the storyteller, on the project
    const [req] = await until(s.requests, (r) => !!r[0]?.built, 15000);
    expect(req?.yes.words).toBe('Yes, build it');
    expect(cast()).toBe(before + 2);
    const marina = agent('Marina');
    const slidewright = agent('Slidewright');
    expect([marina?.role, slidewright?.role]).toEqual(['Storyteller', 'Presentation Creator']);
    const team = h.store.teams.list().find((t) => t.name === 'The Tide Tellers');
    expect(team?.captainId).toBe(marina?.id);
    expect(h.store.projects.require('lumi').teamIds).toContain(team?.id);

    // 4. the user sees it: the director's chat carries the card's line, linked to the request
    const thread = await h.call('GET', `/projects/lumi/threads/${s.orch}/messages`);
    const card = (thread.body.messages as Line[]).find((m) => m.teamRequestId === req?.id);
    expect(card?.text).toMatch(/^Tinker built The Tide Tellers for you: Marina \(Storyteller, captain\)/);
    expect((await h.call('GET', '/projects/lumi/team-requests')).body.requests[0].id).toBe(req?.id);

    // 5. the user changes one in the Cast
    const edited = await h.call('PATCH', `/agents/${marina?.id}`, { name: 'Marisol' });
    expect(edited.status).toBe(200);
    expect(agent('Marisol')?.id).toBe(marina?.id);

    // 6. …removes one, and brings it back onto the team
    const gone = await h.call('DELETE', `/agents/${slidewright?.id}`);
    expect(gone.status).toBe(200);
    expect(h.store.teams.require(team?.id as string).members.map((m) => m.agentId)).toEqual([marina?.id]);
    expect((await h.call('POST', `/trash/${gone.body.restoreToken}/restore`)).status).toBe(200);
    expect(h.store.teams.require(team?.id as string).members.map((m) => m.agentId)).toEqual([
      marina?.id,
      slidewright?.id,
    ]);

    // 7. …removes it all, then brings it all back, edit kept
    expect((await h.call('POST', `/projects/lumi/team-requests/${req?.id}/undo`)).status).toBe(200);
    expect(cast()).toBe(before);
    expect(h.store.projects.require('lumi').teamIds).not.toContain(team?.id);
    expect((await h.call('POST', `/projects/lumi/team-requests/${req?.id}/restore`)).status).toBe(200);
    expect(agent('Marisol')?.role).toBe('Storyteller');
    expect(h.store.teams.require(team?.id as string).captainId).toBe(marina?.id);
    expect(h.store.projects.require('lumi').teamIds).toContain(team?.id);
  });

  it('removing one first, then all: bringing it all back leaves the removed one in the trash', async () => {
    const s = seaGps((_spec, request) => [
      { tool: 'build_team', args: { request, team: TIDE_TELLERS } },
      { result: 'Built.' },
    ]);
    h = s.h;
    await s.approve();
    const [req] = await until(s.requests, (r) => !!r[0]?.built, 15000);
    const [marinaId, slideId] = req?.built?.agentIds ?? [];
    expect((await h.call('DELETE', `/agents/${slideId}`)).status).toBe(200);
    expect((await h.call('POST', `/projects/lumi/team-requests/${req?.id}/undo`)).status).toBe(200);
    expect((await h.call('POST', `/projects/lumi/team-requests/${req?.id}/restore`)).status).toBe(200);
    const team = h.store.teams.require(req?.built?.teamId as string);
    expect(team.members.map((m) => m.agentId)).toEqual([marinaId]);
    expect(team.captainId).toBe(marinaId);
    expect(h.store.agents.get(slideId as string)).toBeNull();
  });
});
