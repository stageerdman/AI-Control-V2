import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_ORIGINS } from '../../src/http/cors.ts';
import { testApp } from '../helpers.ts';
import { connect } from '../sse-client.ts';

describe('CORS', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());
  const req = (
    headers: Record<string, string>,
    method: 'GET' | 'OPTIONS' | 'POST' = 'GET',
    url = '/agents',
  ) => h.app.inject({ method, url, headers });

  it('allows exactly the app origins (dev + bundled), echoing the origin — never *', async () => {
    expect(APP_ORIGINS).toEqual(['http://localhost:1420', 'tauri://localhost']);
    for (const origin of APP_ORIGINS) {
      const r = await req({ origin });
      expect(r.statusCode).toBe(200);
      expect(r.headers['access-control-allow-origin']).toBe(origin);
      expect(r.headers.vary).toContain('Origin');
    }
  });

  it('answers preflight for allowed origins', async () => {
    const r = await req(
      { origin: 'tauri://localhost', 'access-control-request-method': 'PATCH' },
      'OPTIONS',
      '/agents/a-pete',
    );
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-methods']).toContain('PATCH');
    expect(r.headers['access-control-allow-headers']).toContain('last-event-id');
  });

  it('preflight allows every method the server has a route for (a missing PUT blocked access grants)', async () => {
    await h.app.ready();
    const lists = h.app.printRoutes({ commonPrefix: false }).matchAll(/\(([A-Z, ]+)\)/g);
    const used = new Set([...lists].flatMap((m) => (m[1] ?? '').split(', ')));
    used.delete('HEAD'); // a simple request — never preflighted
    expect(used.has('PUT')).toBe(true);
    const r = await req(
      { origin: 'tauri://localhost', 'access-control-request-method': 'PUT' },
      'OPTIONS',
      '/projects/aurora/access/x',
    );
    const allowed = String(r.headers['access-control-allow-methods']).split(', ');
    for (const m of used) expect(allowed, m).toContain(m);
  });

  it('refuses every other origin with 403 — lookalikes, other ports, null — and runs nothing', async () => {
    for (const origin of [
      'http://evil.example',
      'http://localhost:1421',
      'https://localhost:1420',
      'tauri://localhost.evil',
      'null',
    ]) {
      const r = await req({ origin });
      expect(r.statusCode, origin).toBe(403);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
      expect(r.json().error.code).toBe('forbidden_origin');
    }
    const post = await req(
      { origin: 'http://evil.example', 'content-type': 'application/json' },
      'POST',
      '/roles',
    );
    expect(post.statusCode).toBe(403);
    expect(h.store.roles.list()).toHaveLength(10);
    expect((await req({ origin: 'http://evil.example' }, 'OPTIONS')).statusCode).toBe(403);
  });

  it('allows same-origin and requests without an Origin (curl, the app runtime)', async () => {
    const same = await req({ origin: 'http://127.0.0.1:4319', host: '127.0.0.1:4319' });
    expect(same.statusCode).toBe(200);
    const none = await req({});
    expect(none.statusCode).toBe(200);
    expect(none.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('SSE responses carry the CORS header too (they bypass Fastify’s reply)', async () => {
    const base = await h.app.listen({ port: 0, host: '127.0.0.1' });
    const c = await connect(`${base}/projects/aurora/events`, { origin: 'http://localhost:1420' });
    expect(c.res.headers['access-control-allow-origin']).toBe('http://localhost:1420');
    c.close();
  });
});
