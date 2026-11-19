import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testApp } from '../helpers.ts';

type F = { id: string; name: string; status: string; order: number };
const names = (list: F[], status: string) => list.filter((f) => f.status === status).map((f) => f.name);

describe('features API', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());
  const add = async (body: object) => (await h.call('POST', '/projects/aurora/features', body)).body as F;
  const list = async () => (await h.call('GET', '/projects/aurora/features')).body as F[];

  it('creates with defaults (planned, last in its group, empty text blocks) and announces it', async () => {
    const r = await h.call('POST', '/projects/aurora/features', { name: 'Voice search' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      id: 'f-voice-search',
      projectId: 'aurora',
      status: 'planned',
      order: 1,
      pct: null,
      owner: null,
      description: '',
      closedAt: null,
    });
    expect(r.body).not.toHaveProperty('vision');
    const full = await add({
      name: 'Checkout',
      status: 'now',
      pct: 48,
      owner: 'ship-it',
      description: 'One-page checkout.\n\nStripe intents.',
    });
    expect(full).toMatchObject({ status: 'now', order: 1, pct: 48, owner: 'ship-it' });
    expect((await h.call('GET', `/projects/aurora/features/${full.id}`)).body.description).toBe(
      'One-page checkout.\n\nStripe intents.',
    );
    const ev = h.events.after('project', 'aurora').filter((e) => e.type === 'feature.changed');
    expect(ev.map((e) => e.payload)).toEqual([
      {
        featureId: 'f-voice-search',
        name: 'Voice search',
        status: 'planned',
        order: 1,
        closedAt: null,
        pct: null,
        owner: null,
      },
      {
        featureId: 'f-checkout',
        name: 'Checkout',
        status: 'now',
        order: 1,
        closedAt: null,
        pct: 48,
        owner: 'ship-it',
      },
    ]);
  });

  it('lists Now, Planned, Shipped in order; order moves keep groups dense', async () => {
    for (const name of ['A', 'B', 'C']) await add({ name });
    await add({ name: 'Now 1', status: 'now' });
    await add({ name: 'Old', status: 'shipped' });
    await add({ name: 'First', order: 1 });
    expect((await list()).map((f) => f.name)).toEqual(['Now 1', 'First', 'A', 'B', 'C', 'Old']);
    // move C to the top of planned
    const c = (await list()).find((f) => f.name === 'C') as F;
    await h.call('PATCH', `/projects/aurora/features/${c.id}`, { order: 1 });
    expect(names(await list(), 'planned')).toEqual(['C', 'First', 'A', 'B']);
    // A starts: leaves planned (gap closed), lands at the given spot in now
    const a = (await list()).find((f) => f.name === 'A') as F;
    const moved = (await h.call('PATCH', `/projects/aurora/features/${a.id}`, { status: 'now', order: 1 }))
      .body;
    expect(moved).toMatchObject({ status: 'now', order: 1 });
    const after = await list();
    expect(names(after, 'now')).toEqual(['A', 'Now 1']);
    expect(after.filter((f) => f.status === 'planned').map((f) => f.order)).toEqual([1, 2, 3]);
    // ship it with no order → last in shipped
    const s = (await h.call('PATCH', `/projects/aurora/features/${a.id}`, { status: 'shipped', pct: 100 }))
      .body;
    expect(s).toMatchObject({ status: 'shipped', order: 2, pct: 100 });
    // an order past the end clamps
    expect((await h.call('PATCH', `/projects/aurora/features/${c.id}`, { order: 99 })).body.order).toBe(3);
  });

  it('edits the text blocks, clears pct/owner with null, deletes (gap closed, deleted event)', async () => {
    const f = await add({ name: 'Reviews', owner: 'a-query', pct: 10 });
    await add({ name: 'Later' });
    const r = await h.call('PATCH', `/projects/aurora/features/${f.id}`, {
      description: 'Verified-buyer reviews.',
      pct: null,
      owner: null,
    });
    expect(r.body).toMatchObject({ description: 'Verified-buyer reviews.', pct: null, owner: null });
    expect((await h.call('DELETE', `/projects/aurora/features/${f.id}`)).status).toBe(204);
    expect((await list()).map((x) => [x.name, x.order])).toEqual([['Later', 1]]);
    const last = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'feature.changed')
      .at(-1);
    expect(last?.payload).toMatchObject({ featureId: f.id, deleted: true });
    expect((await h.call('GET', `/projects/aurora/features/${f.id}`)).status).toBe(404);
  });

  it('shelved and denied are stages; closedAt is stamped on closing, kept on edits, moved and cleared', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const at = (day: number) => {
        const t = `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`;
        vi.setSystemTime(new Date(t));
        return t;
      };
      const patch = async (id: string, body: object) =>
        (await h.call('PATCH', `/projects/aurora/features/${id}`, body)).body as F & { closedAt: string | null };
      const t1 = at(1);
      const born = (await add({ name: 'Born denied', status: 'denied' })) as F & { closedAt: string };
      expect(born).toMatchObject({ status: 'denied', closedAt: t1 });
      const f = await add({ name: 'Dial' });
      const t2 = at(2);
      expect(await patch(f.id, { status: 'shipped' })).toMatchObject({ closedAt: t2 }); // open → closed
      at(3);
      expect(await patch(f.id, { description: 'edited' })).toMatchObject({ closedAt: t2 }); // no stage change
      const t4 = at(4);
      expect(await patch(f.id, { status: 'shelved' })).toMatchObject({ status: 'shelved', closedAt: t4 }); // closed → closed
      expect(
        (await h.call('GET', `/projects/aurora/features/${f.id}`)).body as { closedAt: string },
      ).toMatchObject({ closedAt: t4 });
      at(5);
      expect(await patch(f.id, { status: 'planned' })).toMatchObject({ closedAt: null }); // back to open
      at(6);
      await patch(f.id, { status: 'shelved' });
      const ev = h.events
        .after('project', 'aurora')
        .filter((e) => e.type === 'feature.changed')
        .at(-1);
      expect(ev?.payload).toMatchObject({ featureId: f.id, status: 'shelved', closedAt: '2026-11-06T10:00:00.000Z' });

      // order: Now, Planned by position; Shipped, Shelved, Denied newest closed first
      at(7);
      await add({ name: 'Old ship', status: 'shipped' });
      at(8);
      await add({ name: 'New ship', status: 'shipped' });
      at(9);
      await add({ name: 'Denied late', status: 'denied' });
      await add({ name: 'Plan' });
      await add({ name: 'Doing', status: 'now' });
      expect((await list()).map((x) => x.name)).toEqual([
        'Doing',
        'Plan',
        'New ship',
        'Old ship',
        'Dial',
        'Denied late',
        'Born denied',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('validates: unknown project / feature / owner, bad status, strict bodies; features are per project', async () => {
    expect((await h.call('POST', '/projects/ghost/features', { name: 'x' })).status).toBe(404);
    expect((await h.call('POST', '/projects/aurora/features', { name: '' })).status).toBe(422);
    expect((await h.call('POST', '/projects/aurora/features', { name: 'x', status: 'done' })).status).toBe(
      422,
    );
    expect((await h.call('POST', '/projects/aurora/features', { name: 'x', owner: 'a-ghost' })).status).toBe(
      422,
    );
    expect((await h.call('POST', '/projects/aurora/features', { name: 'x', blocked: true })).status).toBe(
      422,
    );
    expect((await h.call('POST', '/projects/aurora/features', { name: 'x', pct: 101 })).status).toBe(422);
    // vision is gone (merged into description) and closedAt is the server's to set
    expect((await h.call('POST', '/projects/aurora/features', { name: 'x', vision: 'v' })).status).toBe(422);
    const f = await add({ name: 'Mine' });
    for (const body of [{ vision: 'v' }, { closedAt: '2026-01-01T00:00:00.000Z' }])
      expect((await h.call('PATCH', `/projects/aurora/features/${f.id}`, body)).status).toBe(422);
    expect((await h.call('GET', `/projects/atlas/features/${f.id}`)).status).toBe(404);
    expect((await h.call('PATCH', '/projects/aurora/features/f-ghost', { name: 'y' })).status).toBe(404);
    expect((await h.call('GET', '/projects/atlas/features')).body).toEqual([]);
    // same name twice → distinct ids
    expect((await add({ name: 'Mine' })).id).toBe('f-mine-2');
  });
});
