import { afterEach, describe, expect, it } from 'vitest';
import { VERSION } from '../../src/version.ts';
import { testApp } from '../helpers.ts';

describe('GET /health', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('reports version, paths and db ok', async () => {
    h = testApp();
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      version: VERSION,
      paths: {
        home: h.config.home,
        sandbox: h.config.sandbox,
        controlHome: h.config.controlHome,
        db: ':memory:',
      },
      db: { ok: true },
    });
  });

  it('returns 503 when the db is gone', async () => {
    h = testApp();
    h.db.close();
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().db.ok).toBe(false);
  });

  it('unknown routes use the shared error shape', async () => {
    h = testApp();
    const res = await h.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'No route GET /nope' } });
  });
});
