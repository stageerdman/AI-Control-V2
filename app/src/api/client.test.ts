import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, apiBase, request, setApiBase } from './client';

const reply = (status: number, body: unknown, raw = false) =>
  (async () => new Response(raw ? (body as string) : JSON.stringify(body), { status })) as typeof fetch;

describe('api client', () => {
  afterEach(() => setApiBase('http://127.0.0.1:4319'));

  it('returns parsed JSON and sends JSON bodies to the base URL', async () => {
    setApiBase('http://h:1/');
    let seen: RequestInit | undefined;
    let url = '';
    const f = (async (u: string, init: RequestInit) => {
      url = u;
      seen = init;
      return new Response(JSON.stringify({ id: 'r1' }), { status: 201 });
    }) as unknown as typeof fetch;
    await expect(request('POST', '/roles', { name: 'QA' }, { fetch: f })).resolves.toEqual({ id: 'r1' });
    expect(url).toBe('http://h:1/roles');
    expect(seen?.body).toBe('{"name":"QA"}');
    expect(apiBase()).toBe('http://h:1');
  });

  it('maps the server error body to ApiError (code, message, details, issues)', async () => {
    const body = {
      error: {
        code: 'invalid',
        message: 'Request validation failed',
        details: [{ path: 'name', message: 'Required' }],
      },
    };
    const e = (await request('POST', '/x', {}, { fetch: reply(422, body) }).catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 422, code: 'invalid', message: 'Request validation failed' });
    expect(e.issues).toEqual(['name: Required']);
  });

  it.each([
    [409, 'conflict'],
    [404, 'not_found'],
    [502, 'agent_error'],
  ])('%i keeps the server code %s', async (status, code) => {
    const e = await request('GET', '/x', undefined, {
      fetch: reply(status, { error: { code, message: 'm' } }),
    }).catch((x) => x);
    expect(e).toMatchObject({ status, code, message: 'm' });
  });

  it('network failure with the server down too → code network, said plainly', async () => {
    const f = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const e = (await request('GET', '/x', undefined, { fetch: f }).catch((x) => x)) as ApiError;
    expect(e).toMatchObject({ status: 0, code: 'network' });
    expect(e.message).toMatch(/Can't reach the studio server .* is it running\?/);
  });

  it('a request the browser blocks while /health answers → code blocked with the real reason', async () => {
    const f = (async (u: string) => {
      if (u.endsWith('/health')) return new Response(null, { status: 200 });
      throw new TypeError('Load failed');
    }) as unknown as typeof fetch;
    const e = (await request('PUT', '/projects/p/access/a', {}, { fetch: f }).catch((x) => x)) as ApiError;
    expect(e).toMatchObject({ status: 0, code: 'blocked' });
    expect(e.message).toContain('running but refused PUT /projects/p/access/a');
    expect(e.message).toContain('Load failed');
  });

  it('non-JSON body → code bad_response; non-JSON error page too', async () => {
    await expect(
      request('GET', '/x', undefined, { fetch: reply(200, '<html>', true) }),
    ).rejects.toMatchObject({ code: 'bad_response' });
    await expect(
      request('GET', '/x', undefined, { fetch: reply(500, '<html>', true) }),
    ).rejects.toMatchObject({ status: 500, code: 'bad_response' });
  });

  it('204 → undefined', async () => {
    const f = (async () => new Response(null, { status: 204 })) as typeof fetch;
    await expect(request('DELETE', '/x', undefined, { fetch: f })).resolves.toBeUndefined();
  });
});
