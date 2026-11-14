import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';
import { connect, type SseClient } from '../sse-client.ts';

describe('events API', () => {
  let h: ReturnType<typeof testApp>;
  const clients: SseClient[] = [];
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await h.close();
  });

  it('dev publish: validates against the catalogue and appends', async () => {
    h = testApp({ seed: true });
    const ok = await h.call('POST', '/projects/aurora/events', {
      type: 'checklist.item',
      payload: { itemId: 'c1', text: 'Write tests', done: false },
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      scope: 'project',
      scopeId: 'aurora',
      type: 'checklist.item',
      id: expect.any(Number),
    });
    expect(
      (await h.call('POST', '/projects/aurora/events', { type: 'progress', payload: { pct: 'lots' } }))
        .status,
    ).toBe(422);
    expect(
      (await h.call('POST', '/projects/aurora/events', { type: 'launch.rockets', payload: {} })).status,
    ).toBe(422);
    expect(
      (await h.call('POST', '/projects/ghost/events', { type: 'progress', payload: { pct: 1 } })).status,
    ).toBe(404);
  });

  it('dev publish does not exist in production mode', async () => {
    h = testApp({ seed: true, dev: false });
    expect(
      (await h.call('POST', '/projects/aurora/events', { type: 'progress', payload: { pct: 1 } })).status,
    ).toBe(404);
  });

  it('finish streams the Setter’s steps live on the draft stream, then files them under the project', async () => {
    h = testApp({ seed: true });
    const base = await h.app.listen({ port: 0, host: '127.0.0.1' });
    const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'Live One' })).body;
    const c = await connect(`${base}/drafts/${d.id}/events`);
    clients.push(c);
    const seenWhileRunning: number[] = [];
    const finished = fetch(`${base}/drafts/${d.id}/finish`, { method: 'POST' }).then(async (r) => {
      seenWhileRunning.push(c.events().length);
      return { status: r.status, body: await r.json() };
    });
    await c.waitFor(
      (x) =>
        x
          .events()
          .some(
            (e) =>
              (e.body.payload as { step: string }).step === 'github' &&
              (e.body.payload as { status: string }).status !== 'running',
          ),
      5000,
    );
    const r = await finished;
    expect(r.status).toBe(201);
    const steps = c
      .events()
      .map(
        (e) =>
          `${(e.body.payload as { step: string }).step}:${(e.body.payload as { status: string }).status}`,
      );
    expect(steps[0]).toBe('folder:running');
    expect(steps).toContain('git:done');
    expect(c.events().every((e) => e.type === 'setup.step' && e.body.draftId === d.id)).toBe(true);
    expect(seenWhileRunning[0]).toBeGreaterThan(0); // events were on the wire before the POST returned

    // the project keeps the setup history (finals + running), replayable
    const log = h.events.after('project', r.body.project.id);
    expect(log.map((e) => e.type)).toEqual(steps.map(() => 'setup.step'));
    expect(h.events.after('draft', d.id)).toEqual([]); // draft and its stream are gone
  });

  it('a failed setup leaves the draft with a setup.failed event and no project', async () => {
    h = testApp({ seed: true });
    const outside = join(h.config.home, 'out');
    mkdirSync(outside);
    const d = (await h.call('POST', '/drafts', { mode: 'adopt', name: 'Leaky', folder: 'leaky' })).body;
    mkdirSync(join(h.config.sandbox, 'leaky'));
    symlinkSync(join(outside, 'gi'), join(h.config.sandbox, 'leaky', '.gitignore'));
    const r = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(r.status).toBe(422);
    const ev = h.events.after('draft', d.id);
    expect(ev.at(-1)).toMatchObject({
      type: 'setup.failed',
      payload: { message: expect.stringMatching(/symlink/) },
    });
    expect(h.store.projects.get('leaky')).toBeNull();
  });

  it('draft stream: unknown draft is 404', async () => {
    h = testApp({ seed: true });
    expect((await h.call('GET', '/drafts/d-nope/events')).status).toBe(404);
  });
});
