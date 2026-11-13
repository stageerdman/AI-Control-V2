/* F1b: the project's status (live → needs → idle) and overall progress (features shipped / total, else the
   current goal; + target) move on their own from the event log. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeRunner } from '../../src/runtime/fake.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const statuses = (h: ReturnType<typeof testApp>) =>
  h.events
    .after('project', 'aurora')
    .filter((e) => e.type === 'project.status')
    .map((e) => (e.payload as { status: string }).status);
async function until(fn: () => Promise<boolean> | boolean) {
  for (let i = 0; i < 300; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('never happened');
}

describe('project lifecycle', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('live → needs (open ask) → live (answered) → idle (nothing running); draft/archived are left alone', async () => {
    h = testApp({ seed: true, runner: fakeRunner(() => [{ ask: 'Blue?' }, { wait: 20 }, { result: 'ok' }]) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora', status: 'idle' });
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' });
    await until(async () => (await h.call('GET', '/projects/aurora/asks?status=open')).body.length === 1);
    expect(h.store.projects.require('aurora').status).toBe('needs');
    const [ask] = (await h.call('GET', '/projects/aurora/asks?status=open')).body;
    await h.call('POST', `/projects/aurora/asks/${ask.id}/answer`, { answer: 'yes' });
    expect(h.store.projects.require('aurora').status).toBe('live');
    await h.runtime.settled(r.body.id);
    expect(h.store.projects.require('aurora').status).toBe('idle');
    expect(statuses(h)).toEqual(['live', 'needs', 'live', 'idle']);
    expect((await h.call('GET', '/projects/aurora/office')).body.status).toBe('idle');

    h.store.projects.update('aurora', { status: 'archived' });
    const again = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'y' });
    await until(async () => (await h.call('GET', '/projects/aurora/asks?status=open')).body.length === 1);
    expect(h.store.projects.require('aurora').status).toBe('archived');
    h.runtime.cancel('aurora', again.body.id);
    await h.runtime.settled(again.body.id);
  });

  it('progress = features shipped / total (+ target); without features the current goal; office + events', async () => {
    const crew = scriptedCrew({
      dispatch: [{ summary: 's', items: [{ text: 'A', assignee: 'a-baron', brief: 'b' }] }],
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora', progress: 0 });
    // no features: the goal's %
    const g = await h.call('POST', '/projects/aurora/work', { goal: 'Go' });
    await until(
      async () => (await h.call('GET', `/projects/aurora/work/${g.body.id}`)).body.status === 'done',
    );
    let office = (await h.call('GET', '/projects/aurora/office')).body;
    expect(office.progress).toEqual({
      pct: 100,
      shipped: 0,
      total: 0,
      target: null,
      goal: { id: g.body.id, text: 'Go', pct: 100, status: 'done' },
    });
    // features take over: 1 of 4 shipped
    for (const [name, status] of [
      ['Cart', 'shipped'],
      ['Search', 'now'],
      ['Wishlist', 'planned'],
      ['Reviews', 'planned'],
    ])
      await h.call('POST', '/projects/aurora/features', { name, status });
    expect((await h.call('PATCH', '/projects/aurora', { target: 'v1.0' })).body.target).toBe('v1.0');
    office = (await h.call('GET', '/projects/aurora/office')).body;
    expect(office.progress).toMatchObject({ pct: 25, shipped: 1, total: 4, target: 'v1.0' });
    expect(h.store.projects.require('aurora').progress).toBe(25);
    const last = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'project.progress')
      .at(-1);
    expect(last?.payload).toMatchObject({ pct: 25, shipped: 1, total: 4, goalId: g.body.id, goalPct: 100 });
    expect((await h.call('PATCH', '/projects/aurora', { target: null })).body.target).toBeNull();
    expect((await h.call('PATCH', '/projects/aurora', { target: 'x'.repeat(41) })).status).toBe(422);
  });
});
