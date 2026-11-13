import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

const look = { hat: 'beret', tool: 'palette', body: 'lanky', antenna: 'curl', face: 'none', hue: 'coral' };

describe('agents API', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('lists the studio crew first, with derived usage and delete verdicts', async () => {
    const { body } = await h.call('GET', '/agents');
    expect(body.map((a: { id: string }) => a.id).slice(0, 5)).toEqual([
      'a-setter',
      'a-pixel',
      'a-maestro',
      'a-creator',
      'a-pete',
    ]);
    const setter = body[0];
    expect(setter).toMatchObject({ system: true, role: 'Project Setter', canDelete: { ok: false } });
    const pete = body.find((a: { id: string }) => a.id === 'a-pete');
    expect(pete).toMatchObject({
      system: false,
      teamIds: ['ship-it'],
      projectIds: ['aurora'],
      canDelete: { ok: true, why: '' },
    });
  });

  it('creates a regular agent with a role, look and prompt', async () => {
    const { status, body } = await h.call('POST', '/agents', {
      name: 'Voice Vera',
      roleId: 'r-design',
      look,
      prompt: 'Design for the ear.',
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      id: 'a-voice-vera',
      kind: 'agent',
      role: 'Design',
      look,
      prompt: 'Design for the ear.',
      teamIds: [],
    });
    // same name again gets its own id
    expect((await h.call('POST', '/agents', { name: 'Voice Vera' })).body.id).toBe('a-voice-vera-2');
  });

  it('defaults the look and accepts more orchestrators', async () => {
    const { status, body } = await h.call('POST', '/agents', { kind: 'orchestrator', name: 'Conductor' });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      kind: 'orchestrator',
      role: 'Orchestrator',
      look: { hat: 'none', body: 'hero' },
    });
  });

  it('a second Project Setter or Agent Creator is 409', async () => {
    for (const kind of ['setter', 'creator']) {
      const r = await h.call('POST', '/agents', { kind, name: 'Twin' });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('conflict');
    }
  });

  it('validates input: unknown role 422, bad kind 422, kind is immutable (422 on PATCH)', async () => {
    expect((await h.call('POST', '/agents', { name: 'X', roleId: 'r-ghost' })).status).toBe(422);
    expect((await h.call('POST', '/agents', { name: 'X', kind: 'wizard' })).status).toBe(422);
    expect((await h.call('POST', '/agents', { name: '' })).status).toBe(422);
    expect((await h.call('POST', '/agents', { name: 'X', look: { hat: 'x' } })).status).toBe(422);
    expect((await h.call('PATCH', '/agents/a-pete', { kind: 'orchestrator' })).status).toBe(422);
    expect((await h.call('GET', '/agents/a-ghost')).status).toBe(404);
    expect((await h.call('PATCH', '/agents/a-ghost', { name: 'x' })).status).toBe(404);
  });

  it('patches prompt, look, nick and role (system agents keep editable prompts)', async () => {
    const r = await h.call('PATCH', '/agents/a-setter', { prompt: 'New setter brain.' });
    expect(r.body).toMatchObject({ prompt: 'New setter brain.', kind: 'setter' });
    const p = await h.call('PATCH', '/agents/a-pete', { look, nick: null, roleId: null });
    expect(p.body).toMatchObject({ look, nick: null, roleId: null, role: '' });
  });

  it('never deletes the setter or creator; orchestrators only down to the last one', async () => {
    expect((await h.call('DELETE', '/agents/a-setter')).status).toBe(409);
    expect((await h.call('DELETE', '/agents/a-creator')).status).toBe(409);
    expect((await h.call('DELETE', '/agents/a-maestro')).status).toBe(200);
    const last = await h.call('DELETE', '/agents/a-pixel');
    expect(last.status).toBe(409);
    expect(last.body.error.message).toMatch(/At least one orchestrator/);
    expect((await h.call('GET', '/agents/a-pixel')).body.canDelete.ok).toBe(false);
    expect((await h.call('DELETE', '/agents/a-ghost')).status).toBe(404);
  });

  it('deleting an orchestrator hands its projects and drafts to another; restore hands them back', async () => {
    const draft = (await h.call('POST', '/drafts', { mode: 'new', orchestratorId: 'a-maestro' })).body;
    const d = await h.call('DELETE', '/agents/a-maestro');
    expect((await h.call('GET', '/projects/atlas')).body.orchestratorId).toBe('a-pixel');
    expect((await h.call('GET', '/projects/orchard')).body.orchestratorId).toBe('a-pixel');
    expect((await h.call('GET', `/drafts/${draft.id}`)).body.orchestratorId).toBe('a-pixel');

    await h.call('POST', `/trash/${d.body.restoreToken}/restore`);
    expect((await h.call('GET', '/projects/atlas')).body.orchestratorId).toBe('a-maestro');
    expect((await h.call('GET', '/projects/aurora')).body.orchestratorId).toBe('a-pixel'); // untouched
    expect((await h.call('GET', `/drafts/${draft.id}`)).body.orchestratorId).toBe('a-maestro');
  });

  it('deleting an agent removes it from every team (captaincy passes on) and project; restore puts it back in place', async () => {
    const d = await h.call('DELETE', '/agents/a-twinkle'); // on polish (3rd) and expedition (3rd), specialist on lumi
    expect(d.body.deleted).toEqual({ kind: 'agent', id: 'a-twinkle' });
    expect(
      (await h.call('GET', '/teams/polish')).body.members.map((m: { agentId: string }) => m.agentId),
    ).toEqual(['a-lint', 'a-doc']);
    expect((await h.call('GET', '/projects/lumi')).body.agentIds).toEqual(['a-prof']);

    const c = await h.call('DELETE', '/agents/a-semic'); // captain of ship-it
    const ship = (await h.call('GET', '/teams/ship-it')).body;
    expect(ship.captainId).toBe('a-pete');
    expect(ship.members).toHaveLength(2);

    await h.call('POST', `/trash/${d.body.restoreToken}/restore`);
    await h.call('POST', `/trash/${c.body.restoreToken}/restore`);
    const polish = (await h.call('GET', '/teams/polish')).body;
    expect(polish.members.map((m: { agentId: string }) => m.agentId)).toEqual([
      'a-lint',
      'a-doc',
      'a-twinkle',
    ]);
    expect(polish.members[2].instr).toMatch(/Tighten spacing/);
    const ship2 = (await h.call('GET', '/teams/ship-it')).body;
    expect(ship2.members.map((m: { agentId: string }) => m.agentId)).toEqual(['a-semic', 'a-pete', 'a-scar']);
    expect(ship2.captainId).toBe('a-semic');
    expect((await h.call('GET', '/projects/lumi')).body.agentIds).toEqual(['a-prof', 'a-twinkle']);
    expect((await h.call('GET', '/agents/a-twinkle')).body).toMatchObject({
      role: 'Design',
      teamIds: ['polish', 'expedition'],
    });
  });

  it('restore skips a seat on a team that filled up meanwhile, but restores the agent', async () => {
    const d = await h.call('DELETE', '/agents/a-baron'); // engine: baron, merge
    for (let i = 0; i < 6; i++) {
      const a = (await h.call('POST', '/agents', { name: `Filler ${i}` })).body;
      expect((await h.call('POST', '/teams/engine/members', { agentId: a.id })).status).toBe(201);
    }
    expect((await h.call('POST', `/trash/${d.body.restoreToken}/restore`)).status).toBe(200);
    expect((await h.call('GET', '/agents/a-baron')).body.teamIds).toEqual([]);
    expect((await h.call('GET', '/teams/engine')).body.members).toHaveLength(7);
  });

  it('agents are shared definitions: one record used by many projects, edits show everywhere', async () => {
    await h.call('POST', '/projects', { name: 'Kite Notes', teamIds: ['ship-it'] });
    const pete = (await h.call('GET', '/agents/a-pete')).body;
    expect(pete.projectIds).toEqual(['aurora', 'kite-notes']);
    await h.call('PATCH', '/agents/a-pete', { prompt: 'Shared brain v2' });
    expect(
      (await h.call('GET', '/agents')).body.filter((a: { name: string }) => a.name === 'Pixel Pete'),
    ).toHaveLength(1);
    await h.call('DELETE', '/projects/kite-notes');
    expect((await h.call('GET', '/agents/a-pete')).body).toMatchObject({
      prompt: 'Shared brain v2',
      projectIds: ['aurora'],
    });
  });
});
