/* The core of B3: a secret value never leaves the backend. Every credential and
   access endpoint (happy and error paths) is driven with canary values; the raw
   value — or anything beyond its last 4 — must not appear in any response body,
   any header, any log line (trace level), or the sqlite file's bytes. */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { secretsApp } from './harness.ts';

const canary = (tag: string) => `${tag}_${randomBytes(16).toString('hex')}`;
/** The value, and the part of it last-4 masking hides. */
const forms = (v: string) => [v, v.slice(0, -4)];

function expectNoLeak(where: string, haystack: string, values: string[]) {
  for (const v of values)
    for (const f of forms(v)) expect(haystack.includes(f), `${where} contains a secret`).toBe(false);
}

describe('secret values never leak', () => {
  let h: ReturnType<typeof secretsApp> | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('through any endpoint, header, log line or the sqlite file', async () => {
    h = secretsApp({ diskDb: true });
    const { call } = h;
    const A = canary('ghp_A');
    const B = canary('sk_B');
    const C = canary('rotated_C');
    const D = canary('handwritten_D');
    const E = canary('rejected_E');
    const all = [A, B, C, D, E];

    /* --- cabinet: happy paths */
    expect(
      (await call('POST', '/credentials', { name: 'GitHub', envVar: 'GITHUB_TOKEN', value: A })).status,
    ).toBe(201);
    expect(
      (await call('POST', '/credentials', { name: 'OpenAI', envVar: 'OPENAI_API_KEY', value: B })).status,
    ).toBe(201);
    await call('GET', '/credentials');
    await call('GET', '/credentials/c-github');
    await call('PATCH', '/credentials/c-github', { serves: 'PRs' });
    expect((await call('PUT', '/credentials/c-github/value', { value: C })).status).toBe(200);
    const env = readFileSync(h.envPath, 'utf8');
    expect(env).toContain(C); // sanity: the values are really there…
    expect(env).toContain(B);
    /* a key added by hand, then imported */
    writeFileSync(h.envPath, `${env}STRIPE_KEY=${D}\n`);
    expect((await call('POST', '/credentials/import')).body.imported).toHaveLength(1);

    /* --- cabinet: error paths, each carrying a secret */
    const errors: [string, string, unknown?, string?][] = [
      ['POST', '/credentials', { name: 'Dup', envVar: 'GITHUB_TOKEN', value: E }], // 409
      ['POST', '/credentials', { name: 'Bad', envVar: '9BAD', value: E }], // 422
      ['POST', '/credentials', { name: 'Multi', value: `${E}\n${E}` }], // 422
      ['POST', '/credentials', { name: 'Huge', value: E.repeat(300) }], // 422
      ['POST', '/credentials', { name: 'Extra', value: E, secret: E }], // 422
      ['POST', '/credentials', { value: E }], // 422 (no name)
      ['POST', '/credentials', { name: 'Typed', value: [E] }], // 422 wrong type
      ['POST', '/credentials', undefined, `{"name":"Broken","value":"${E}" oops}`], // 400
      ['POST', '/credentials', undefined, `{"name":"Cut","value":"${E}`], // 400
      ['POST', '/credentials', undefined, `{"name":"Bare","value": ${E}}`], // 400 — V8 quotes this body
      ['PUT', '/credentials/nope/value', { value: E }], // 404
      ['PUT', '/credentials/c-github/value', { value: `${E}\n${E}` }], // 422
      ['PUT', '/credentials/c-github/value', undefined, `{"value":"${E}"`], // 400
      ['PATCH', '/credentials/c-github', { value: E }], // 422
      ['PATCH', '/credentials/c-github', { instructions: 1, value: E }], // 422
    ];
    for (const [m, url, body, raw] of errors) {
      const r = await call(m as 'POST', url, body, raw);
      expect(r.status, `${m} ${url}`).toBeGreaterThanOrEqual(400);
    }

    /* --- project access */
    await call('POST', '/projects', { name: 'Kite', folder: 'kite' });
    await call('POST', '/projects/kite/access/sync'); // 409 folder missing (grants exist below)
    mkdirSync(h.project('kite'));
    await call('PUT', '/projects/kite/access', {
      grants: { 'c-github': true, 'c-openai': true, 'c-stripe-key': true },
    });
    await call('PUT', '/projects/kite/access', { grants: { nope: true } }); // 422
    await call('GET', '/projects/kite/access');
    expect((await call('POST', '/projects/kite/access/sync')).status).toBe(200);
    expect(readFileSync(join(h.project('kite'), '.env'), 'utf8')).toContain(D); // sanity
    await call('POST', '/projects/aurora/access/sync'); // 409 no folder
    await call('PUT', '/projects/kite/access', { grants: { 'c-openai': false } });
    await call('POST', '/projects/kite/access/sync');
    await call('GET', '/health');
    await call('DELETE', '/credentials/c-openai');
    await call('GET', '/credentials');

    /* --- the checks */
    expectNoLeak('responses/headers', h.seen.join('\n'), all);
    expect(h.logs.length).toBeGreaterThan(20); // the logger really was capturing
    expectNoLeak('logs', h.logs.join(''), all);

    const dbFiles = readdirSync(h.config.home).filter((f) => f.startsWith('studio.db'));
    expect(dbFiles).toContain('studio.db');
    const bytes = () =>
      dbFiles.map((f) => readFileSync(join(h?.config.home ?? '', f)).toString('latin1')).join('');
    expectNoLeak('sqlite (with WAL)', bytes(), all);
    h.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    expectNoLeak(
      'sqlite (checkpointed)',
      readFileSync(join(h.config.home, 'studio.db')).toString('latin1'),
      all,
    );
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM trash').get()).toEqual({ n: 0 }); // no restore snapshot

    /* only the two .env files hold values, both 0600 */
    expect(statSync(h.envPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(h.project('kite'), '.env')).mode & 0o777).toBe(0o600);
    expect(readFileSync(h.envPath, 'utf8')).not.toContain(B); // deleted credential's value is gone
  });

  it('when the secret store fails: generic 500, nothing logged, nothing half-saved', async () => {
    h = secretsApp({
      secrets: (file) => ({
        ...file,
        set: () => {
          throw new Error('EIO: disk on fire');
        },
      }),
    });
    const S = canary('sk_fail');
    const r = await h.call('POST', '/credentials', { name: 'Doomed', value: S });
    expect(r).toEqual({
      status: 500,
      body: { error: { code: 'internal', message: 'Internal server error' } },
    });
    expect(h.logs.join('')).toContain('disk on fire'); // the error IS logged…
    expectNoLeak('logs', h.logs.join(''), [S]); // …without the value
    expectNoLeak('responses', h.seen.join(''), [S]);
    expect((await h.call('GET', '/credentials')).body).toEqual([]); // db rolled back
  });
});
