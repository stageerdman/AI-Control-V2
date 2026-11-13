import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

describe('projects API', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('lists the nine seeded projects in order', async () => {
    const { body } = await h.call('GET', '/projects');
    expect(body.map((p: { id: string }) => p.id)).toEqual([
      'aurora',
      'atlas',
      'lumi',
      'muse',
      'orchard',
      'pebble',
      'nimbus',
      'fern',
      'tycho',
    ]);
  });

  it('creates with sensible defaults (first orchestrator, idle, private, no folder)', async () => {
    const { status, body } = await h.call('POST', '/projects', { name: 'Kite Notes' });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      id: 'kite-notes',
      orchestratorId: 'a-pixel',
      status: 'idle',
      progress: 0,
      folder: null,
      github: { connected: false, private: true },
      teamIds: [],
      agentIds: [],
    });
  });

  it('staffs teams-first plus specialists, and checks every reference', async () => {
    const ok = await h.call('POST', '/projects', {
      name: 'K',
      orchestratorId: 'a-maestro',
      teamIds: ['polish', 'engine'],
      agentIds: ['a-prof'],
    });
    expect(ok.body).toMatchObject({
      orchestratorId: 'a-maestro',
      teamIds: ['polish', 'engine'],
      agentIds: ['a-prof'],
    });
    const s = async (body: object) => (await h.call('POST', '/projects', { name: 'X', ...body })).status;
    expect(await s({ orchestratorId: 'a-pete' })).toBe(409); // not an orchestrator
    expect(await s({ orchestratorId: 'a-ghost' })).toBe(422);
    expect(await s({ agentIds: ['a-creator'] })).toBe(409); // system agents aren't specialists
    expect(await s({ agentIds: ['a-pete', 'a-pete'] })).toBe(422);
    expect(await s({ teamIds: ['ghost'] })).toBe(422);
    expect(await s({ status: 'exploded' })).toBe(422);
    expect(await s({ progress: 140 })).toBe(422);
  });

  it('folders go through the sandbox guard and are stored relative', async () => {
    const f = await h.call('POST', '/projects', { name: 'A', folder: 'kite-notes' });
    expect(f.body.folder).toBe('kite-notes');
    const abs = await h.call('POST', '/projects', {
      name: 'B',
      folder: join(h.config.sandbox, 'nested', 'b'),
    });
    expect(abs.body.folder).toBe('nested/b');
    for (const folder of ['../escape', '/etc', 'a/../../b', '.']) {
      const r = await h.call('POST', '/projects', { name: 'C', folder });
      expect(r.status, folder).toBe(422);
    }
    mkdirSync(join(h.config.home, 'outside'), { recursive: true });
    symlinkSync(join(h.config.home, 'outside'), join(h.config.sandbox, 'link'));
    expect((await h.call('POST', '/projects', { name: 'D', folder: 'link/x' })).status).toBe(422);
    // one folder, one project
    const dup = await h.call('POST', '/projects', { name: 'E', folder: './kite-notes' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual({ projectId: 'a' });
  });

  it('patches fields and links; a project may keep its own folder', async () => {
    await h.call('PATCH', '/projects/lumi', { folder: 'lumi' });
    const p = await h.call('PATCH', '/projects/lumi', {
      status: 'live',
      progress: 55,
      folder: 'lumi',
      orchestratorId: 'a-maestro',
      teamIds: ['expedition'],
      github: { connected: true, private: false },
    });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({
      status: 'live',
      progress: 55,
      orchestratorId: 'a-maestro',
      teamIds: ['expedition'],
      agentIds: ['a-prof', 'a-twinkle'],
      github: { private: false },
    });
    expect((await h.call('PATCH', '/projects/lumi', { orchestratorId: 'a-setter' })).status).toBe(409);
    expect((await h.call('PATCH', '/projects/ghost', { note: 'x' })).status).toBe(404);
  });

  it('delete forgets the record (204) but never the agents or teams', async () => {
    expect((await h.call('DELETE', '/projects/aurora')).status).toBe(204);
    expect((await h.call('GET', '/projects/aurora')).status).toBe(404);
    expect((await h.call('DELETE', '/projects/aurora')).status).toBe(404);
    expect((await h.call('GET', '/teams/ship-it')).body).toMatchObject({
      projectIds: [],
      captainId: 'a-semic',
    });
  });

  it('malformed JSON is a 400 in the shared error shape', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
  });
});
