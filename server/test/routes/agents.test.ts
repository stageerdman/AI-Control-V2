import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../../src/cast-packs/archetypes.ts';
import { installPackIfNeeded } from '../../src/cast-packs/pack.ts';
import { runsRepo } from '../../src/db/runs.ts';
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

  it('every Cast agent carries a plain tool list: edit, run, reach', async () => {
    installPackIfNeeded(h.store, ARCHETYPES);
    const { body } = await h.call('GET', '/agents');
    for (const a of body)
      expect(a.toolList).toMatchObject({ edit: expect.any(Array), run: expect.any(Array) });

    const pete = (await h.call('GET', '/agents/a-pete')).body; // no toolset = the full kit
    expect(pete.toolList.edit).toEqual(['Any file in the project']);
    expect(pete.toolList.run).toContain('npm');
    expect(pete.toolList.reach).toContain('Mail to other projects and HQ');

    const sola = body.find((a: { id: string }) => a.id === 'a-sola'); // archetype: docs only, no shell
    expect(sola.toolList).toMatchObject({ edit: ['updates/**'], run: [] });
    const sable = body.find((a: { id: string }) => a.id === 'a-sable'); // reporter role: report runs get the web
    expect(sable.toolList).toMatchObject({ edit: [], run: ['git'] });
    expect(sable.toolList.reach).toContain('The web (search and fetch)');
  });

  it('create and patch replies carry the tool list too (mail off drops it from reach)', async () => {
    const made = await h.call('POST', '/agents', { name: 'Quiet Quinn' });
    expect(made.body.toolList.edit).toEqual(['Any file in the project']);
    const p = await h.call('PATCH', `/agents/${made.body.id}`, { canMail: false });
    expect(p.body.toolList.reach).not.toContain('Mail to other projects and HQ');
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

  describe('a busy agent (in a running session) cannot be deleted', () => {
    const startRun = (id: string) =>
      runsRepo(h.db).insert({
        id,
        projectId: 'aurora',
        agentId: 'a-pete',
        teamId: null,
        task: 'Polish the landing page',
        runner: 'stub',
        model: null,
        caps: { maxTurns: 1, maxBudgetUsd: 1 },
      });
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

    it('refuses with 409 agent_busy and the session, and moves nothing', async () => {
      const run = startRun('run-1');
      const teamsBefore = (await h.call('GET', '/teams/ship-it')).body;

      const busy = await h.call('GET', '/agents/a-pete/busy');
      const session = {
        runId: 'run-1',
        projectId: 'aurora',
        projectName: (await h.call('GET', '/projects/aurora')).body.name,
        task: 'Polish the landing page',
        startedAt: run.startedAt,
      };
      expect(busy.body).toEqual({ busy: true, sessions: [session] });

      const d = await h.call('DELETE', '/agents/a-pete');
      expect(d.status).toBe(409);
      expect(d.body.error).toEqual({
        code: 'agent_busy',
        message: 'Pixel Pete is working in a running session right now. You can delete them when it ends.',
        details: { sessions: [session] },
      });
      expect((await h.call('GET', '/agents/a-pete')).body.teamIds).toEqual(['ship-it']);
      expect((await h.call('GET', '/teams/ship-it')).body).toEqual(teamsBefore);
    });

    it('deletes and restores as usual once the run has finished', async () => {
      startRun('run-2');
      runsRepo(h.db).finish('run-2', { status: 'succeeded', usage, turns: 1 });
      expect((await h.call('GET', '/agents/a-pete/busy')).body).toEqual({ busy: false, sessions: [] });

      const d = await h.call('DELETE', '/agents/a-pete');
      expect(d.status).toBe(200);
      expect(d.body.deleted).toEqual({ kind: 'agent', id: 'a-pete' });
      expect((await h.call('POST', `/trash/${d.body.restoreToken}/restore`)).status).toBe(200);
      expect((await h.call('GET', '/agents/a-pete')).body.teamIds).toEqual(['ship-it']);
    });

    it('is free again after a restart clears stuck runs', async () => {
      startRun('run-3');
      runsRepo(h.db).failInterrupted();
      expect((await h.call('DELETE', '/agents/a-pete')).status).toBe(200);
    });

    it('busy is 404 for an unknown agent', async () => {
      expect((await h.call('GET', '/agents/a-ghost/busy')).status).toBe(404);
    });
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
