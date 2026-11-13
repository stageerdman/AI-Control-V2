import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

/* Asks across the studio (the pager) + "you went there and left" */
describe('studio asks (pager)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const openAsks = async (n: number, url = '/asks') => {
    for (let i = 0; i < 100; i++) {
      const b = (await h.call('GET', url)).body;
      if (b.length >= n) return b;
      await new Promise((x) => setTimeout(x, 10));
    }
    throw new Error('asks never opened');
  };

  it('lists open asks across projects with names, marks a visited office seen, a new ask brings it back', async () => {
    h = testApp({
      seed: true,
      longPollMs: 50,
      runner: fakeRunner((s) => [{ ask: s.task, options: ['Yes', 'No'] }, { result: 'ok' }]),
    });
    for (const id of ['aurora', 'lumi']) {
      mkdirSync(join(h.config.sandbox, id));
      h.store.projects.update(id, { folder: id });
    }
    await h.call('POST', '/projects/aurora/runs', { agentId: 'a-scar', task: 'Need a Stripe test key?' });
    await h.call('POST', '/projects/lumi/runs', { agentId: 'a-twinkle', task: 'Bag or cart?' });
    const all = await openAsks(2);
    expect(all.map((a: { projectId: string }) => a.projectId).sort()).toEqual(['aurora', 'lumi']);
    expect(all.find((a: { projectId: string }) => a.projectId === 'aurora')).toMatchObject({
      projectName: 'Aurora Storefront',
      agentId: 'a-scar',
      agentName: 'Scarlett Scenario',
      question: 'Need a Stripe test key?',
      options: ['Yes', 'No'],
      status: 'open',
      seen: false,
    });
    expect(typeof all[0].since).toBe('string');

    // visit Aurora and leave
    expect((await h.call('POST', '/asks/seen', { projectId: 'aurora' })).body).toEqual({ seen: 1 });
    const unseen = (await h.call('GET', '/asks?unseen=true')).body;
    expect(unseen.map((a: { projectId: string }) => a.projectId)).toEqual(['lumi']);
    expect(
      (await h.call('GET', '/asks')).body.find((a: { projectId: string }) => a.projectId === 'aurora').seen,
    ).toBe(true);
    expect((await h.call('GET', '/projects/aurora/asks')).body[0].seenAt).toEqual(expect.any(String));

    // a NEW ask in Aurora pages again (the old one stays seen)
    await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'Mic icon left or right?' });
    const back = await openAsks(2, '/asks?unseen=1');
    expect(back.map((a: { agentId: string }) => a.agentId).sort()).toEqual(['a-pete', 'a-twinkle']);

    // answered asks leave the open list; ?status=all keeps history
    const lumi = all.find((a: { projectId: string }) => a.projectId === 'lumi');
    await h.call('POST', `/projects/lumi/asks/${lumi.id}/answer`, { answer: 'Bag' });
    expect((await h.call('GET', '/asks')).body.map((a: { projectId: string }) => a.projectId)).toEqual([
      'aurora',
      'aurora',
    ]);
    expect((await h.call('GET', '/asks?status=answered')).body).toHaveLength(1);
    expect((await h.call('GET', '/asks?status=all')).body).toHaveLength(3);
  });

  it('validates: unknown project 404, bad query / body 422', async () => {
    h = testApp({ seed: true });
    expect((await h.call('GET', '/asks')).body).toEqual([]);
    expect((await h.call('POST', '/asks/seen', { projectId: 'ghost' })).status).toBe(404);
    expect((await h.call('POST', '/asks/seen', {})).status).toBe(422);
    expect((await h.call('GET', '/asks?status=nope')).status).toBe(422);
    expect((await h.call('POST', '/asks/seen', { projectId: 'aurora' })).body).toEqual({ seen: 0 });
  });
});
