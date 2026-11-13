import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

const ids = (t: { members: { agentId: string }[] }) => t.members.map((m) => m.agentId);

describe('teams API', () => {
  let h: ReturnType<typeof testApp>;
  const newAgents = async (n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push((await h.call('POST', '/agents', { name: `Bot ${i}` })).body.id);
    return out;
  };
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('lists the four seeded teams with rosters and captains', async () => {
    const { body } = await h.call('GET', '/teams');
    expect(body.map((t: { id: string }) => t.id)).toEqual(['ship-it', 'polish', 'engine', 'expedition']);
    expect(body[0]).toMatchObject({
      name: 'The Ship-It Squad',
      captainId: 'a-semic',
      projectIds: ['aurora'],
    });
    expect(body[0].instr).toMatch(/behind a flag/);
    expect(body[0].code).toMatch(/Feature-first folders/);
  });

  it('creates a team; the first member is captain unless one is named', async () => {
    const t = await h.call('POST', '/teams', {
      name: 'The Night Shift',
      color: 'coral',
      emblem: 'lantern',
      members: [{ agentId: 'a-pete', instr: 'UI' }, { agentId: 'a-scar' }],
    });
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({
      id: 'night-shift',
      captainId: 'a-pete',
      members: [
        { agentId: 'a-pete', instr: 'UI' },
        { agentId: 'a-scar', instr: '' },
      ],
    });
    const named = await h.call('POST', '/teams', {
      name: 'Duo',
      members: [{ agentId: 'a-pete' }, { agentId: 'a-scar' }],
      captainId: 'a-scar',
    });
    expect(named.body.captainId).toBe('a-scar');
    const empty = await h.call('POST', '/teams', { name: 'Empty' });
    expect(empty.body).toMatchObject({ captainId: null, members: [], color: 'grape' });
  });

  it('refuses invalid rosters at create: system agents, duplicates, > 7, captain outside, unknown agent', async () => {
    const r = async (body: object) => (await h.call('POST', '/teams', { name: 'T', ...body })).status;
    expect(await r({ members: [{ agentId: 'a-pixel' }] })).toBe(409);
    expect(await r({ members: [{ agentId: 'a-setter' }] })).toBe(409);
    expect(await r({ members: [{ agentId: 'a-pete' }, { agentId: 'a-pete' }] })).toBe(409);
    expect(await r({ members: (await newAgents(8)).map((agentId) => ({ agentId })) })).toBe(409);
    expect(await r({ members: [{ agentId: 'a-pete' }], captainId: 'a-scar' })).toBe(409);
    expect(await r({ members: [{ agentId: 'a-ghost' }] })).toBe(422);
    // nothing half-created
    expect((await h.call('GET', '/teams')).body).toHaveLength(4);
  });

  it('adds members up to 7, refusing the 8th, duplicates and system agents', async () => {
    for (const id of await newAgents(4))
      expect((await h.call('POST', '/teams/ship-it/members', { agentId: id })).status).toBe(201);
    const full = (await h.call('GET', '/teams/ship-it')).body;
    expect(full.members).toHaveLength(7);
    const [extra] = await newAgents(1);
    const eighth = await h.call('POST', '/teams/ship-it/members', { agentId: extra });
    expect(eighth.status).toBe(409);
    expect(eighth.body.error.message).toMatch(/at most 7/);
    expect((await h.call('POST', '/teams/polish/members', { agentId: 'a-lint' })).status).toBe(409);
    expect((await h.call('POST', '/teams/polish/members', { agentId: 'a-creator' })).status).toBe(409);
    expect((await h.call('POST', '/teams/ghost/members', { agentId: 'a-lint' })).status).toBe(404);
  });

  it('an agent can sit on several teams', async () => {
    expect(
      (await h.call('POST', '/teams/engine/members', { agentId: 'a-pete', instr: 'Deploy UI' })).status,
    ).toBe(201);
    expect((await h.call('GET', '/agents/a-pete')).body.teamIds).toEqual(['ship-it', 'engine']);
  });

  it('captain must be a member; removing the captain promotes the next; removing the last empties', async () => {
    expect((await h.call('PATCH', '/teams/engine', { captainId: 'a-pete' })).status).toBe(409);
    expect((await h.call('PATCH', '/teams/engine', { captainId: 'a-merge' })).body.captainId).toBe('a-merge');

    const afterCap = await h.call('DELETE', '/teams/engine/members/a-merge');
    expect(afterCap.body).toMatchObject({ captainId: 'a-baron' });
    expect(ids(afterCap.body)).toEqual(['a-baron']);
    const none = await h.call('DELETE', '/teams/engine/members/a-baron');
    expect(none.body).toMatchObject({ captainId: null, members: [] });
    expect((await h.call('DELETE', '/teams/engine/members/a-baron')).status).toBe(404);
    // the first member to join an empty team becomes captain
    expect((await h.call('POST', '/teams/engine/members', { agentId: 'a-doc' })).body.captainId).toBe(
      'a-doc',
    );
  });

  it('edits team text and a member’s job', async () => {
    const t = await h.call('PATCH', '/teams/polish', { blurb: 'Shine.', code: 'One cleanup per commit.' });
    expect(t.body).toMatchObject({
      blurb: 'Shine.',
      code: 'One cleanup per commit.',
      name: 'The Polish Patrol',
    });
    const m = await h.call('PATCH', '/teams/polish/members/a-doc', { instr: 'Write the changelog too.' });
    expect(m.body.members.find((x: { agentId: string }) => x.agentId === 'a-doc').instr).toBe(
      'Write the changelog too.',
    );
    expect((await h.call('PATCH', '/teams/polish/members/a-pete', { instr: 'x' })).status).toBe(404);
    expect((await h.call('PATCH', '/teams/polish', { members: [] })).status).toBe(422);
  });

  it('delete removes the team from projects; restore brings back roster, captain and project links', async () => {
    await h.call('PATCH', '/teams/polish', { captainId: 'a-doc' });
    const d = await h.call('DELETE', '/teams/polish');
    expect(d.body.deleted).toEqual({ kind: 'team', id: 'polish' });
    expect((await h.call('GET', '/projects/aurora')).body.teamIds).toEqual(['ship-it']);
    expect((await h.call('GET', '/agents/a-lint')).body.teamIds).toEqual([]);

    await h.call('POST', `/trash/${d.body.restoreToken}/restore`);
    const t = (await h.call('GET', '/teams/polish')).body;
    expect(ids(t)).toEqual(['a-lint', 'a-doc', 'a-twinkle']);
    expect(t.captainId).toBe('a-doc');
    expect((await h.call('GET', '/projects/aurora')).body.teamIds).toEqual(['ship-it', 'polish']);
  });

  it('restoring a team whose captain was deleted meanwhile falls back to the first member', async () => {
    const d = await h.call('DELETE', '/teams/expedition');
    await h.call('DELETE', '/agents/a-prof');
    await h.call('POST', `/trash/${d.body.restoreToken}/restore`);
    const t = (await h.call('GET', '/teams/expedition')).body;
    expect(ids(t)).toEqual(['a-query', 'a-twinkle']);
    expect(t.captainId).toBe('a-query');
  });
});
