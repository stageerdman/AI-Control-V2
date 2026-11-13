import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { streamKey } from '../../src/events/bus.ts';
import { testApp } from '../helpers.ts';
import { connect, type SseClient } from '../sse-client.ts';

describe('SSE /projects/:id/events', () => {
  let h: ReturnType<typeof testApp>;
  let base: string;
  const clients: SseClient[] = [];
  const open = async (path: string, headers?: Record<string, string>) => {
    const c = await connect(`${base}${path}`, headers);
    clients.push(c);
    return c;
  };
  const pub = (pct: number) => h.events.append('project', 'aurora', { type: 'progress', payload: { pct } });
  const pcts = (c: SseClient) => c.events().map((e) => (e.body.payload as { pct: number }).pct);

  beforeEach(async () => {
    h = testApp({ seed: true, heartbeatMs: 40 });
    base = await h.app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await h.close();
  });

  it('speaks the SSE wire format', async () => {
    const e = pub(5);
    const c = await open('/projects/aurora/events');
    await c.waitFor((x) => x.events().length === 1);
    expect(c.res.statusCode).toBe(200);
    expect(c.res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(c.res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(c.raw().startsWith('retry: 2000\n\n')).toBe(true);
    expect(c.raw()).toContain(
      `id: ${e.id}\nevent: progress\ndata: ${JSON.stringify({ id: e.id, projectId: 'aurora', type: 'progress', payload: { pct: 5 }, at: e.at })}\n\n`,
    );
  });

  it('replays everything by default, then delivers live events in order', async () => {
    pub(1);
    pub(2);
    const c = await open('/projects/aurora/events');
    await c.waitFor((x) => x.events().length === 2);
    pub(3);
    pub(4);
    await c.waitFor((x) => x.events().length === 4);
    expect(pcts(c)).toEqual([1, 2, 3, 4]);
    const ids = c.events().map((e) => e.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('resumes after Last-Event-ID (header wins) or ?after=', async () => {
    const [a, b] = [pub(1), pub(2), pub(3)];
    const byHeader = await open(`/projects/aurora/events?after=${b?.id}`, { 'last-event-id': String(a?.id) });
    const byQuery = await open(`/projects/aurora/events?after=${b?.id}`);
    await byHeader.waitFor((x) => x.events().length === 2);
    await byQuery.waitFor((x) => x.events().length === 1);
    expect(pcts(byHeader)).toEqual([2, 3]);
    expect(pcts(byQuery)).toEqual([3]);
    const junk = await open('/projects/aurora/events?after=banana');
    await junk.waitFor((x) => x.events().length === 3);
  });

  it('fans out to multiple subscribers and keeps projects apart', async () => {
    const one = await open('/projects/aurora/events');
    const two = await open('/projects/aurora/events');
    const other = await open('/projects/atlas/events');
    await one.waitFor(() => h.events.bus.listenerCount(streamKey('project', 'aurora')) === 2);
    pub(42);
    await one.waitFor((x) => x.events().length === 1);
    await two.waitFor((x) => x.events().length === 1);
    expect(pcts(one)).toEqual([42]);
    expect(pcts(two)).toEqual([42]);
    expect(other.events()).toEqual([]);
  });

  it('sends heartbeat comments', async () => {
    const c = await open('/projects/aurora/events');
    await c.waitFor((x) => x.frames().some((f) => f.comment === 'heartbeat'));
  });

  it('cleans up on disconnect: no listeners, no timers left behind', async () => {
    const c = await open('/projects/aurora/events');
    const key = streamKey('project', 'aurora');
    await c.waitFor(() => h.events.bus.listenerCount(key) === 1);
    c.close();
    const until = Date.now() + 2000;
    while (h.events.bus.listenerCount(key) !== 0 && Date.now() < until)
      await new Promise((r) => setTimeout(r, 10));
    expect(h.events.bus.listenerCount(key)).toBe(0);
    pub(1); // publishing to nobody is fine
  });

  it('unknown project is a plain JSON 404; closing the app ends open streams', async () => {
    const res = await fetch(`${base}/projects/ghost/events`);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
    const c = await open('/projects/aurora/events');
    const ended = new Promise((r) => c.res.on('end', r));
    await h.app.close();
    await ended;
  });
});
