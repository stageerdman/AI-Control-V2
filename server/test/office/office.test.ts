import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOffice } from '../../src/office/office.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

describe('office staffing view', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('returns the office config (director, teams with members + captain, solo) with calm defaults', async () => {
    h = testApp({ seed: true });
    const r = await h.call('GET', '/projects/aurora/office');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      project: 'aurora',
      name: 'Aurora Storefront',
      director: 'a-pixel',
      solo: ['a-baron', 'a-query', 'a-merge'],
      lastEventId: 0,
    });
    const ship = h.store.teams.require('ship-it');
    expect(r.body.teams[0]).toEqual({
      id: 'ship-it',
      name: 'The Ship-It Squad',
      color: ship.color,
      emblem: ship.emblem,
      captain: ship.captainId,
      members: ship.members.map((m) => m.agentId),
    });
    expect(r.body.teams.map((t: { id: string }) => t.id)).toEqual(['ship-it', 'polish']);
    // everyone on the project has a state; nobody has done anything yet
    const ids = ['a-pixel', ...r.body.teams.flatMap((t: { members: string[] }) => t.members), ...r.body.solo];
    expect(Object.keys(r.body.agents).sort()).toEqual([...new Set(ids)].sort());
    expect(Object.values(r.body.agents).every((a) => (a as { status: string }).status === 'idle')).toBe(true);
    expect((await h.call('GET', '/projects/ghost/office')).status).toBe(404);
  });

  it('latest status per agent from events: live work shows, finished or pre-restart "working" reads idle', async () => {
    h = testApp({
      seed: true,
      runner: fakeRunner(() => [
        { activity: { kind: 'editing', label: 'Writing VoiceBar.tsx', target: 'VoiceBar.tsx' } },
        { wait: 150 },
        { result: 'ok' },
      ]),
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' })).body;
    await new Promise((x) => setTimeout(x, 30));
    let o = (await h.call('GET', '/projects/aurora/office')).body;
    expect(o.agents['a-pete']).toMatchObject({
      status: 'working',
      runId: run.id,
      activity: { kind: 'editing', label: 'Writing VoiceBar.tsx' },
      since: expect.any(String),
    });
    expect(o.lastEventId).toBe(h.events.after('project', 'aurora').at(-1)?.id);
    await h.runtime.settled(run.id);
    o = (await h.call('GET', '/projects/aurora/office')).body;
    expect(o.agents['a-pete'].status).toBe('done');

    // a stale "working" for a run that has ended (e.g. a lost line) reads idle
    await h.call('POST', '/projects/aurora/events', {
      type: 'agent.status',
      payload: { agentId: 'a-scar', runId: run.id, status: 'working' },
    });
    // a run-less "working" (the orchestrator planning) is shown — unless it predates this server's start
    await h.call('POST', '/projects/aurora/events', {
      type: 'agent.status',
      payload: {
        agentId: 'a-pixel',
        status: 'working',
        activity: { kind: 'thinking', label: 'Planning the work' },
      },
    });
    o = (await h.call('GET', '/projects/aurora/office')).body;
    expect(o.agents['a-scar']).toMatchObject({ status: 'idle' });
    expect(o.agents['a-pixel']).toMatchObject({
      status: 'working',
      activity: { label: 'Planning the work' },
    });
    const later = createOffice({
      db: h.db,
      store: h.store,
      bootedAt: new Date(Date.now() + 1000).toISOString(),
    });
    expect(later.get('aurora').agents['a-pixel']?.status).toBe('idle');
  });
});
