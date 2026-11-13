/* The whole B6 flow on the default FakeRunner + fake crew brain (what `AI_STUDIO_RUNNER=fake` serves):
   chat → plan → accept (mint) → finish (staff + scaffold) → work → runs → done. */
import { afterEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

describe('setup → work, end to end (fake brain)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('chat → plan → accept → finish → work → runs → done', async () => {
    h = testApp({ seed: true });
    const d = (
      await h.call('POST', '/drafts', { mode: 'new', name: 'Pocket Shop', about: 'A shop with apps.' })
    ).body;

    const open = await h.call('POST', `/drafts/${d.id}/chat`, {});
    expect(open.status).toBe(200);
    expect(open.body.plan.teams).toEqual([{ teamId: 'ship-it', why: expect.any(String) }]);

    const turn = await h.call('POST', `/drafts/${d.id}/chat`, { text: 'and design a new team for mobile' });
    expect(turn.body.plan.newTeams).toEqual([{ brief: 'A team for Mobile' }]);
    expect((await h.call('POST', `/drafts/${d.id}/finish`)).status).toBe(409); // not accepted yet

    const acc = await h.call('POST', `/drafts/${d.id}/accept`);
    expect(acc.status).toBe(200);
    const team = acc.body.minted.teams[0];
    expect(team).toMatchObject({ name: 'The Night Shift', emblem: 'droneship' });
    expect(team.members.map((m: { agentId: string }) => m.agentId)).toContain(team.captainId);
    expect(acc.body.minted.roles.map((r: { name: string }) => r.name)).toEqual(['Mobile']);

    const fin = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(fin.status).toBe(201);
    const p = fin.body.project;
    expect(p.teamIds).toEqual(['ship-it', team.id]);
    // the setup story moved onto the project's stream with it
    const setupTypes = new Set(h.events.after('project', p.id).map((e) => e.type));
    for (const t of ['chat.message', 'plan.changed', 'cast.created', 'setup.step'])
      expect(setupTypes).toContain(t);

    const w = await h.call('POST', `/projects/${p.id}/work`, { goal: 'Ship the first screen' });
    expect(w.status).toBe(201);
    expect(w.body.items.map((i: { agentId: string; teamId: string }) => [i.agentId, i.teamId])).toEqual([
      ['a-semic', 'ship-it'],
      [team.captainId, team.id],
    ]);
    let g = w.body;
    for (let i = 0; i < 200 && g.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 5));
      g = (await h.call('GET', `/projects/${p.id}/work/${g.id}`)).body;
    }
    expect(g).toMatchObject({ status: 'done', pct: 100 });
    const runs = (await h.call('GET', `/projects/${p.id}/runs`)).body;
    expect(runs.map((r: { status: string }) => r.status)).toEqual(['succeeded', 'succeeded']);
    expect(h.store.projects.require(p.id).progress).toBe(100);
  });
});
