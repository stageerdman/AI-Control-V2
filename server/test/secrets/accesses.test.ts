/* G1 accesses: multi-field bundles, grants per access per project, .env sync of every field, the "new" dot,
   what agents are told (names, never values), and the migration from B3 credentials. */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { composePrompt } from '../../src/runtime/compose.ts';
import { cabinet } from '../../src/secrets/cabinet.ts';
import { projectAccess } from '../../src/secrets/projectAccess.ts';
import { fileSecretStore } from '../../src/secrets/secretStore.ts';
import { secretsApp } from './harness.ts';

const canary = (tag: string) => `${tag}_${randomBytes(16).toString('hex')}`;
const STRIPE = {
  name: 'Stripe',
  serves: 'payments',
  instructions: 'Test mode only.',
  fields: [
    { label: 'Secret key', value: 'sk_test_0123456789abcdefWXYZ' },
    { label: 'Account', secret: false, value: 'acct_42' },
  ],
};

describe('accesses (multi-field)', () => {
  let h: ReturnType<typeof secretsApp>;
  beforeEach(async () => {
    h = secretsApp();
    await h.call('POST', '/projects', { name: 'Kite', folder: 'kite' });
    mkdirSync(h.project('kite'));
  });
  afterEach(() => h.close());
  const events = () =>
    (
      h.db.prepare("SELECT type, payload FROM events WHERE scope_id = 'kite' ORDER BY id").all() as {
        type: string;
        payload: string;
      }[]
    ).map((e) => ({ type: e.type, ...JSON.parse(e.payload) }));

  it('creates an access with fields: secret ones masked, non-secret ones shown; values only in the global .env', async () => {
    const r = await h.call('POST', '/accesses', STRIPE);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      id: 'a-stripe',
      name: 'Stripe',
      serves: 'payments',
      projectIds: [],
      fields: [
        { label: 'Secret key', envVar: 'STRIPE_SECRET_KEY', secret: true, hasValue: true, last4: 'WXYZ' },
        {
          label: 'Account',
          envVar: 'STRIPE_ACCOUNT',
          secret: false,
          hasValue: true,
          last4: null,
          value: 'acct_42',
        },
      ],
    });
    expect(r.body.fields[0]).not.toHaveProperty('value');
    expect(JSON.stringify(r.body)).not.toContain('sk_test_');
    const env = readFileSync(h.envPath, 'utf8');
    expect(env).toContain('STRIPE_SECRET_KEY=sk_test_0123456789abcdefWXYZ');
    expect(env).toContain('STRIPE_ACCOUNT=acct_42');
    expect((await h.call('GET', '/accesses')).body.map((a: { id: string }) => a.id)).toEqual(['a-stripe']);
    /* the old cabinet view reads it through its first field */
    expect((await h.call('GET', '/credentials/a-stripe')).body).toMatchObject({
      envVar: 'STRIPE_SECRET_KEY',
      last4: 'WXYZ',
    });
  });

  it('refuses a clashing env var (409), two equal ones (422), a bad name or no fields (422)', async () => {
    await h.call('POST', '/accesses', STRIPE);
    const clash = await h.call('POST', '/accesses', {
      name: 'Other',
      fields: [{ label: 'k', envVar: 'STRIPE_ACCOUNT', value: 'x' }],
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.details).toMatchObject({ existingId: 'a-stripe' });
    const twice = await h.call('POST', '/accesses', {
      name: 'Twice',
      fields: [
        { label: 'a', envVar: 'SAME' },
        { label: 'b', envVar: 'SAME' },
      ],
    });
    expect(twice.status).toBe(422);
    expect(
      (await h.call('POST', '/accesses', { name: 'Bad', fields: [{ label: 'a', envVar: '9X' }] })).status,
    ).toBe(422);
    expect((await h.call('POST', '/accesses', { name: 'Empty', fields: [] })).status).toBe(422);
    expect(readFileSync(h.envPath, 'utf8')).not.toContain('SAME');
  });

  it('edits: rename, add / rename / move / flip / remove fields, set a value, delete', async () => {
    await h.call('POST', '/accesses', STRIPE);
    expect((await h.call('PATCH', '/accesses/a-stripe', { name: 'Stripe test' })).body.name).toBe(
      'Stripe test',
    );
    const added = await h.call('POST', '/accesses/a-stripe/fields', { label: 'Webhook secret' });
    expect(added.status).toBe(201);
    const hook = added.body.fields[2];
    expect(hook).toMatchObject({
      label: 'Webhook secret',
      envVar: 'STRIPE_TEST_WEBHOOK_SECRET',
      hasValue: false,
    });
    const set = await h.call('PUT', `/accesses/a-stripe/fields/${hook.id}/value`, {
      value: 'whsec_abcdefghijkl1234',
    });
    expect(set.body.fields[2]).toMatchObject({ hasValue: true, last4: '1234' });
    /* rename + move: the value moves with it */
    const key = set.body.fields[0];
    const moved = await h.call('PATCH', `/accesses/a-stripe/fields/${key.id}`, {
      label: 'API key',
      envVar: 'STRIPE_KEY',
    });
    expect(moved.body.fields[0]).toMatchObject({ label: 'API key', envVar: 'STRIPE_KEY', hasValue: true });
    let env = readFileSync(h.envPath, 'utf8');
    expect(env).toContain('STRIPE_KEY=sk_test_');
    expect(env).not.toContain('STRIPE_SECRET_KEY');
    /* flipping secret hides / shows the value */
    const acct = set.body.fields[1];
    const hidden = await h.call('PATCH', `/accesses/a-stripe/fields/${acct.id}`, { secret: true });
    expect(hidden.body.fields[1]).not.toHaveProperty('value');
    expect(
      (await h.call('PATCH', `/accesses/a-stripe/fields/${acct.id}`, { envVar: 'STRIPE_KEY' })).status,
    ).toBe(409);
    /* remove a field: its value goes too; the last field can't go */
    const removed = await h.call('DELETE', `/accesses/a-stripe/fields/${hook.id}`);
    expect(removed.body.fields).toHaveLength(2);
    expect(readFileSync(h.envPath, 'utf8')).not.toContain('whsec_');
    await h.call('DELETE', `/accesses/a-stripe/fields/${acct.id}`);
    expect((await h.call('DELETE', `/accesses/a-stripe/fields/${key.id}`)).status).toBe(409);
    expect((await h.call('DELETE', '/accesses/a-stripe/fields/nope')).status).toBe(404);
    /* delete: not restorable, values gone */
    await h.call('PUT', '/projects/kite/access/a-stripe');
    const del = await h.call('DELETE', '/accesses/a-stripe');
    expect(del.body).toEqual({
      deleted: { kind: 'access', id: 'a-stripe' },
      restorable: false,
      projectIds: ['kite'],
    });
    env = readFileSync(h.envPath, 'utf8');
    expect(env).not.toContain('sk_test_');
    expect((await h.call('GET', '/accesses/a-stripe')).status).toBe(404);
  });

  it('grants from the app (preflight + PUT from its origin) and the grant is saved', async () => {
    await h.call('POST', '/accesses', {
      name: 'Cloudflare',
      fields: [{ label: 'API token', value: 'cf_x' }],
    });
    const origin = 'tauri://localhost';
    const url = '/projects/kite/access/a-cloudflare';
    const pre = await h.app.inject({
      method: 'OPTIONS',
      url,
      headers: { origin, 'access-control-request-method': 'PUT' },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toContain('PUT');
    const put = await h.app.inject({
      method: 'PUT',
      url,
      headers: { origin, 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(put.statusCode).toBe(200);
    expect(put.headers['access-control-allow-origin']).toBe(origin);
    const saved = (await h.call('GET', '/projects/kite/access')).body;
    expect(saved.accesses.find((a: { id: string }) => a.id === 'a-cloudflare')).toMatchObject({
      granted: true,
    });
    expect((await h.call('GET', '/accesses/a-cloudflare')).body.projectIds).toEqual(['kite']);
  });

  it('grants per access per project; sync writes every field; agents learn names, never values', async () => {
    await h.call('POST', '/accesses', STRIPE);
    await h.call('POST', '/accesses', { name: 'Postgres', fields: [{ label: 'URL', secret: false }] });
    const g = await h.call('PUT', '/projects/kite/access/a-stripe');
    expect(g.status).toBe(200);
    expect(g.body.accesses.find((a: { id: string }) => a.id === 'a-stripe')).toMatchObject({ granted: true });
    expect(g.body.granted).toBe(1);
    const s = await h.call('POST', '/projects/kite/access/sync');
    expect(s.body).toMatchObject({ written: ['STRIPE_SECRET_KEY', 'STRIPE_ACCOUNT'], missing: [] });
    expect(readFileSync(join(h.project('kite'), '.env'), 'utf8')).toContain('STRIPE_ACCOUNT=acct_42');
    await h.call('PUT', '/projects/kite/access/a-postgres');
    expect((await h.call('POST', '/projects/kite/access/sync')).body.missing).toEqual(['POSTGRES_URL']);

    const file = fileSecretStore(h.envPath);
    const access = projectAccess(h.store, file, h.config.sandbox, { cabinet: cabinet(h.store, file) });
    expect(access.envFor('kite')).toEqual({
      STRIPE_SECRET_KEY: STRIPE.fields[0]?.value,
      STRIPE_ACCOUNT: 'acct_42',
    });
    const told = access.agentAccess('kite');
    expect(JSON.stringify(told)).not.toContain('sk_test_');
    expect(JSON.stringify(told)).not.toContain('acct_42');
    const prompt = composePrompt({
      agent: { name: 'Pip', prompt: 'Builds.', role: 'Dev' },
      project: { name: 'Kite' },
      access: told,
    });
    expect(prompt).toContain('## Access you have');
    expect(prompt).toContain(
      '- Stripe (payments): Secret key → `STRIPE_SECRET_KEY`, Account → `STRIPE_ACCOUNT`. How: Test mode only.',
    );
    expect(prompt).toContain('URL → `POSTGRES_URL` (not set yet)');
    expect(prompt).not.toContain('sk_test_');

    const off = await h.call('DELETE', '/projects/kite/access/a-stripe');
    expect(off.body.granted).toBe(1);
    expect((await h.call('POST', '/projects/kite/access/sync')).body.removed).toEqual([
      'STRIPE_SECRET_KEY',
      'STRIPE_ACCOUNT',
    ]);
    expect((await h.call('PUT', '/projects/kite/access/nope')).status).toBe(422);
    expect((await h.call('PUT', '/projects/ghost/access/a-stripe')).status).toBe(404);

    /* events: ids and the change only */
    await h.call('PUT', '/projects/kite/access/a-stripe');
    await h.call('PATCH', '/accesses/a-stripe', { serves: 'billing' });
    await h.call('PUT', '/projects/kite/access/a-stripe'); // no change → no event
    expect(events().filter((e) => e.type === 'access.changed')).toEqual([
      { type: 'access.changed', accessId: 'a-stripe', change: 'granted' },
      { type: 'access.changed', accessId: 'a-postgres', change: 'granted' },
      { type: 'access.changed', accessId: 'a-stripe', change: 'revoked' },
      { type: 'access.changed', accessId: 'a-stripe', change: 'granted' },
      { type: 'access.changed', accessId: 'a-stripe', change: 'updated' },
    ]);
  });

  it('"new since last seen": accesses added after the project last looked', async () => {
    await new Promise((r) => setTimeout(r, 5));
    await h.call('POST', '/accesses', STRIPE);
    let v = (await h.call('GET', '/projects/kite/access')).body;
    expect(v.newCount).toBe(1); // added after the project was made
    const seen = await h.call('POST', '/projects/kite/access/seen');
    expect(seen.body).toEqual({ projectId: 'kite', seenAt: expect.any(String) });
    v = (await h.call('GET', '/projects/kite/access')).body;
    expect(v).toMatchObject({ newCount: 0, seenAt: seen.body.seenAt });
    await new Promise((r) => setTimeout(r, 5));
    await h.call('POST', '/accesses', { name: 'Resend', fields: [{ label: 'API key' }] });
    v = (await h.call('GET', '/projects/kite/access')).body;
    expect(v.newCount).toBe(1);
    expect(v.accesses.map((a: { id: string; isNew: boolean }) => [a.id, a.isNew])).toEqual([
      ['a-stripe', false],
      ['a-resend', true],
    ]);
    expect((await h.call('POST', '/projects/ghost/access/seen')).status).toBe(404);
  });

  it('import registers unknown .env keys as one-field accesses and refreshes the rest', async () => {
    writeFileSync(h.envPath, 'HAND_TOKEN=abcdefghijklmnop\n');
    const r = await h.call('POST', '/accesses/import');
    expect(r.body.imported).toMatchObject([
      { id: 'c-hand-token', fields: [{ label: 'Key', envVar: 'HAND_TOKEN', last4: 'mnop' }] },
    ]);
    expect((await h.call('POST', '/accesses/import')).body).toEqual({ imported: [], refreshed: [] });
  });

  it('no value ever leaks through the access endpoints, logs or events — except non-secret fields', async () => {
    const A = canary('sk_A');
    const B = canary('pw_B');
    const C = canary('rot_C');
    const U = canary('user_U'); // non-secret: may be shown
    await h.call('POST', '/accesses', {
      name: 'DB',
      fields: [
        { label: 'Password', value: A },
        { label: 'User', secret: false, value: U },
      ],
    });
    await h.call('POST', '/accesses/a-db/fields', { label: 'Token', value: B });
    await h.call('PUT', '/accesses/a-db/fields/f-db-token/value', { value: C });
    await h.call('PATCH', '/accesses/a-db/fields/f-db-password', { envVar: 'DB_PASS' });
    await h.call('PUT', '/projects/kite/access/a-db');
    await h.call('GET', '/projects/kite/access');
    await h.call('POST', '/projects/kite/access/sync');
    await h.call('GET', '/accesses');
    for (const bad of [
      ['POST', '/accesses', { name: 'X', fields: [{ label: 'a', value: `${A}\n` }], extra: A }],
      ['POST', '/accesses/a-db/fields', { label: 'y', envVar: 'DB_PASS', value: A }],
      ['PUT', '/accesses/a-db/fields/nope/value', { value: A }],
      ['PATCH', '/accesses/a-db/fields/f-db-token', { value: A }],
    ] as const) {
      const r = await h.call(bad[0], bad[1], bad[2]);
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
    await h.call('DELETE', '/accesses/a-db');
    const evs = JSON.stringify(h.db.prepare('SELECT payload FROM events').all());
    for (const v of [A, B, C])
      for (const where of [h.seen.join('\n'), h.logs.join(''), evs])
        expect(where.includes(v.slice(0, -4)), 'a secret leaked').toBe(false);
    expect(h.seen.join('\n')).toContain(U); // shown on purpose
  });
});

describe('migration 21: credentials → one-field accesses', () => {
  it('keeps every credential, its value info and its grants', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const sql of MIGRATIONS.slice(0, 20)) db.exec(sql);
    db.exec('PRAGMA user_version = 20');
    db.exec(
      `INSERT INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES ('o', 'orchestrator', 'O', '{}', 0, '', '');
       INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at) VALUES ('kite', 'Kite', 'live', 'o', '{}', 0, '2026-01-01', '');
       INSERT INTO credentials (id, name, env_var, serves, docs_url, instructions, has_value, last4, position, created_at, updated_at)
         VALUES ('c-github', 'GitHub', 'GITHUB_TOKEN', 'PRs', 'https://x.dev', 'scopes: repo', 1, 'WXYZ', 0, '2026-01-02', '2026-01-03'),
                ('c-pin', 'Pin', 'PIN', '', NULL, '', 0, NULL, 1, '2026-01-04', '2026-01-04');
       INSERT INTO project_access (project_id, credential_id, granted_at) VALUES ('kite', 'c-github', '2026-01-05');`,
    );
    migrate(db);
    expect(db.prepare('SELECT * FROM accesses ORDER BY position').all()).toEqual([
      expect.objectContaining({
        id: 'c-github',
        name: 'GitHub',
        serves: 'PRs',
        docs_url: 'https://x.dev',
        instructions: 'scopes: repo',
      }),
      expect.objectContaining({ id: 'c-pin', name: 'Pin' }),
    ]);
    expect(
      db
        .prepare(
          'SELECT id, access_id, label, env_var, secret, has_value, last4 FROM access_fields ORDER BY id',
        )
        .all(),
    ).toEqual([
      {
        id: 'f-c-github',
        access_id: 'c-github',
        label: 'Key',
        env_var: 'GITHUB_TOKEN',
        secret: 1,
        has_value: 1,
        last4: 'WXYZ',
      },
      {
        id: 'f-c-pin',
        access_id: 'c-pin',
        label: 'Key',
        env_var: 'PIN',
        secret: 1,
        has_value: 0,
        last4: null,
      },
    ]);
    expect(db.prepare('SELECT * FROM access_grants').all()).toEqual([
      { project_id: 'kite', access_id: 'c-github', granted_at: '2026-01-05' },
    ]);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name);
    expect(tables).not.toContain('credentials');
    expect(tables).not.toContain('project_access');
    db.close();
  });
});
