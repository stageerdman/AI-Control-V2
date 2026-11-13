import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BLOCK_BEGIN, BLOCK_END, projectAccess } from '../../src/secrets/projectAccess.ts';
import { fileSecretStore } from '../../src/secrets/secretStore.ts';
import { secretsApp } from '../secrets/harness.ts';

const GH = 'ghp_0123456789abcdefWXYZ';
const OAI = 'sk-proj-zyxwvutsrq9876';

describe('credentials API (Key Cabinet)', () => {
  let h: ReturnType<typeof secretsApp>;
  beforeEach(() => {
    h = secretsApp();
    writeFileSync(h.envPath, '# Global secrets — AI Control\n\nUNRELATED=keep # mine\n', { mode: 0o644 });
  });
  afterEach(() => h.close());

  it('creates with a value: value → global .env (0600, other lines kept), response masked', async () => {
    const { status, body } = await h.call('POST', '/credentials', {
      name: 'GitHub',
      serves: 'Clone, commit, push, open PRs',
      docsUrl: 'https://docs.github.com',
      instructions: 'Never force-push main.',
      value: `  ${GH}\n`,
    });
    expect(status).toBe(201);
    expect(body).toEqual({
      id: 'c-github',
      name: 'GitHub',
      envVar: 'GITHUB',
      serves: 'Clone, commit, push, open PRs',
      docsUrl: 'https://docs.github.com',
      instructions: 'Never force-push main.',
      hasValue: true,
      last4: 'WXYZ',
      projectIds: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(readFileSync(h.envPath, 'utf8')).toBe(
      `# Global secrets — AI Control\n\nUNRELATED=keep # mine\nGITHUB=${GH}\n`,
    );
    expect(statSync(h.envPath).mode & 0o777).toBe(0o600);
  });

  it('explicit envVar; duplicates are 409; short values show no last-4', async () => {
    const c = await h.call('POST', '/credentials', { name: 'Pin', envVar: 'MY_PIN', value: '1234' });
    expect(c.body).toMatchObject({ envVar: 'MY_PIN', hasValue: true, last4: null });
    const dup = await h.call('POST', '/credentials', { name: 'Other', envVar: 'MY_PIN' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual({ existingId: 'c-pin' });
  });

  it('without a value adopts what the .env already has, or has none', async () => {
    const a = await h.call('POST', '/credentials', { name: 'Mine', envVar: 'UNRELATED' });
    expect(a.body).toMatchObject({ hasValue: true, last4: null }); // 'keep' is too short to show
    const b = await h.call('POST', '/credentials', { name: 'Stripe', serves: 'Payments' });
    expect(b.body).toMatchObject({ envVar: 'STRIPE', hasValue: false, last4: null });
  });

  it('validates: bad env var, multi-line key, unknown keys, bad docs url → 422', async () => {
    for (const body of [
      { name: 'X', envVar: '1ABC' },
      { name: 'X', envVar: 'A-B' },
      { name: 'X', value: 'line1\nline2' },
      { name: 'X', value: '   ' },
      { name: 'X', color: 'red' },
      { name: 'X', docsUrl: 'javascript:alert(1)' },
      { serves: 'no name' },
    ])
      expect((await h.call('POST', '/credentials', body)).status).toBe(422);
  });

  it('PATCH edits metadata only; envVar and value are not patchable', async () => {
    await h.call('POST', '/credentials', { name: 'GitHub', value: GH });
    const p = await h.call('PATCH', '/credentials/c-github', { serves: 'PRs', docsUrl: null });
    expect(p.body).toMatchObject({ name: 'GitHub', serves: 'PRs', docsUrl: null, last4: 'WXYZ' });
    expect((await h.call('PATCH', '/credentials/c-github', { envVar: 'GH' })).status).toBe(422);
    expect((await h.call('PATCH', '/credentials/c-github', { value: GH })).status).toBe(422);
    expect((await h.call('PATCH', '/credentials/nope', { serves: 'x' })).status).toBe(404);
  });

  it('PUT …/value replaces the key in place (write-only)', async () => {
    await h.call('POST', '/credentials', { name: 'GitHub', value: GH });
    const r = await h.call('PUT', '/credentials/c-github/value', { value: 'ghp_rotated_key_000Q7x2' });
    expect(r.body).toMatchObject({ hasValue: true, last4: 'Q7x2' });
    expect(readFileSync(h.envPath, 'utf8')).toContain('GITHUB=ghp_rotated_key_000Q7x2\n');
    expect(readFileSync(h.envPath, 'utf8')).not.toContain(GH);
    expect((await h.call('PUT', '/credentials/nope/value', { value: GH })).status).toBe(404);
  });

  it('DELETE removes metadata, value and grants — not restorable', async () => {
    await h.call('POST', '/credentials', { name: 'GitHub', value: GH });
    await h.call('PUT', '/projects/aurora/access', { grants: { 'c-github': true } });
    const d = await h.call('DELETE', '/credentials/c-github');
    expect(d).toEqual({
      status: 200,
      body: { deleted: { kind: 'credential', id: 'c-github' }, restorable: false, projectIds: ['aurora'] },
    });
    expect(readFileSync(h.envPath, 'utf8')).toBe('# Global secrets — AI Control\n\nUNRELATED=keep # mine\n');
    expect((await h.call('GET', '/credentials/c-github')).status).toBe(404);
    expect((await h.call('GET', '/projects/aurora/access')).body.entries).toEqual([]);
    expect((await h.call('DELETE', '/credentials/c-github')).status).toBe(404);
  });

  it('import registers keys already in the .env (masked) and refreshes hand edits', async () => {
    writeFileSync(h.envPath, `# c\nOPENAI_API_KEY=${OAI}\nPLACEHOLDER=\nexport GH_TOKEN="${GH}"\n`);
    const first = await h.call('POST', '/credentials/import');
    expect(
      first.body.imported.map((c: { envVar: string; hasValue: boolean; last4: string | null }) => [
        c.envVar,
        c.hasValue,
        c.last4,
      ]),
    ).toEqual([
      ['OPENAI_API_KEY', true, '9876'],
      ['PLACEHOLDER', false, null],
      ['GH_TOKEN', true, 'WXYZ'],
    ]);
    expect(first.body.imported[0]).toMatchObject({ id: 'c-openai-api-key', name: 'OPENAI_API_KEY' });
    expect((await h.call('POST', '/credentials/import')).body).toEqual({ imported: [], refreshed: [] });
    writeFileSync(h.envPath, `OPENAI_API_KEY=${OAI}-newABCD\nPLACEHOLDER=filled-in-by-hand\n`);
    const again = await h.call('POST', '/credentials/import');
    expect(again.body.refreshed.sort()).toEqual(['c-gh-token', 'c-openai-api-key', 'c-placeholder']);
    const list = (await h.call('GET', '/credentials')).body;
    expect(list.map((c: { last4: string | null; hasValue: boolean }) => [c.hasValue, c.last4])).toEqual([
      [true, 'ABCD'],
      [true, 'hand'],
      [false, null], // GH_TOKEN vanished from the file
    ]);
  });
});

describe('project access API', () => {
  let h: ReturnType<typeof secretsApp>;
  beforeEach(async () => {
    h = secretsApp();
    await h.call('POST', '/credentials', { name: 'GitHub', envVar: 'GITHUB_TOKEN', value: GH });
    await h.call('POST', '/credentials', { name: 'OpenAI', envVar: 'OPENAI_API_KEY', value: OAI });
    await h.call('POST', '/credentials', { name: 'Stripe', envVar: 'STRIPE_KEY' }); // no value yet
    await h.call('POST', '/projects', { name: 'Kite', folder: 'kite' });
  });
  afterEach(() => h.close());
  const projEnv = () => readFileSync(join(h.project('kite'), '.env'), 'utf8');

  it('a project reaches nothing by default; grants toggle and round-trip', async () => {
    const v = await h.call('GET', '/projects/kite/access');
    expect(v.body).toMatchObject({ projectId: 'kite', granted: 0, total: 3 });
    expect(v.body.entries[0]).toEqual({
      credentialId: 'c-github',
      name: 'GitHub',
      envVar: 'GITHUB_TOKEN',
      serves: '',
      hasValue: true,
      last4: 'WXYZ',
      granted: false,
    });
    const on = await h.call('PUT', '/projects/kite/access', {
      grants: { 'c-github': true, 'c-stripe': true },
    });
    expect(on.body.granted).toBe(2);
    const off = await h.call('PUT', '/projects/kite/access', { grants: { 'c-stripe': false } });
    expect(
      off.body.entries
        .filter((e: { granted: boolean }) => e.granted)
        .map((e: { credentialId: string }) => e.credentialId),
    ).toEqual(['c-github']);
    expect((await h.call('GET', '/credentials/c-github')).body.projectIds).toEqual(['kite']);
  });

  it('grant errors: unknown credential 422, unknown project 404, bad body 422', async () => {
    expect((await h.call('PUT', '/projects/kite/access', { grants: { nope: true } })).status).toBe(422);
    expect((await h.call('PUT', '/projects/ghost/access', { grants: {} })).status).toBe(404);
    expect((await h.call('GET', '/projects/ghost/access')).status).toBe(404);
    expect((await h.call('PUT', '/projects/kite/access', { grants: { 'c-github': 'yes' } })).status).toBe(
      422,
    );
    expect((await h.call('PUT', '/projects/kite/access', { 'c-github': true })).status).toBe(422);
  });

  it('sync needs a real folder: no folder / missing folder → 409', async () => {
    const noFolder = await h.call('POST', '/projects/aurora/access/sync');
    expect(noFolder.status).toBe(409);
    expect(noFolder.body.error.message).toMatch(/no folder yet/);
    const missing = await h.call('POST', '/projects/kite/access/sync');
    expect(missing.status).toBe(409);
    expect(missing.body.error.message).toMatch(/doesn't exist yet/);
    expect((await h.call('POST', '/projects/ghost/access/sync')).status).toBe(404);
  });

  it('sync writes only granted secrets (0600), keeps hand-written lines, adds .gitignore; ungrant removes on next sync', async () => {
    mkdirSync(h.project('kite'));
    writeFileSync(join(h.project('kite'), '.env'), '# project secrets\nLOCAL_ONLY=1\nGITHUB_TOKEN=stale\n');
    writeFileSync(join(h.project('kite'), '.gitignore'), 'node_modules');
    await h.call('PUT', '/projects/kite/access', {
      grants: { 'c-github': true, 'c-openai': true, 'c-stripe': true },
    });

    const s1 = await h.call('POST', '/projects/kite/access/sync');
    expect(s1).toEqual({
      status: 200,
      body: {
        file: 'kite/.env',
        written: ['GITHUB_TOKEN', 'OPENAI_API_KEY'],
        removed: [],
        missing: ['STRIPE_KEY'],
        gitignore: 'added',
      },
    });
    expect(projEnv()).toBe(
      `# project secrets\nLOCAL_ONLY=1\n\n${BLOCK_BEGIN}\nGITHUB_TOKEN=${GH}\nOPENAI_API_KEY=${OAI}\n${BLOCK_END}\n`,
    );
    expect(statSync(join(h.project('kite'), '.env')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(h.project('kite'), '.gitignore'), 'utf8')).toBe('node_modules\n.env\n');

    /* idempotent */
    const s2 = await h.call('POST', '/projects/kite/access/sync');
    expect(s2.body).toMatchObject({ removed: [], gitignore: 'present' });
    const before = projEnv();

    await h.call('PUT', '/projects/kite/access', { grants: { 'c-github': false } });
    const s3 = await h.call('POST', '/projects/kite/access/sync');
    expect(s3.body).toMatchObject({ written: ['OPENAI_API_KEY'], removed: ['GITHUB_TOKEN'] });
    expect(projEnv()).not.toContain(GH);
    expect(before).toContain(GH);

    await h.call('PUT', '/projects/kite/access', { grants: { 'c-openai': false, 'c-stripe': false } });
    const s4 = await h.call('POST', '/projects/kite/access/sync');
    expect(s4.body).toMatchObject({ written: [], removed: ['OPENAI_API_KEY'], missing: [] });
    expect(projEnv()).toBe('# project secrets\nLOCAL_ONLY=1\n\n');
  });

  it('sync with nothing granted and no .env creates nothing; a rotated key flows in on next sync', async () => {
    mkdirSync(h.project('kite'));
    const s = await h.call('POST', '/projects/kite/access/sync');
    expect(s.body).toMatchObject({ written: [], gitignore: 'added' });
    expect(() => projEnv()).toThrow();
    await h.call('PUT', '/projects/kite/access', { grants: { 'c-github': true } });
    await h.call('POST', '/projects/kite/access/sync');
    await h.call('PUT', '/credentials/c-github/value', { value: 'ghp_brand_new_rotated_9999' });
    await h.call('POST', '/projects/kite/access/sync');
    expect(projEnv()).toContain('GITHUB_TOKEN=ghp_brand_new_rotated_9999\n');
    expect(projEnv()).not.toContain(GH);
  });

  it('sync never writes outside the sandbox (folder swapped for a symlink out) → 409', async () => {
    const outside = join(h.config.home, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, h.project('kite'));
    await h.call('PUT', '/projects/kite/access', { grants: { 'c-github': true } });
    const r = await h.call('POST', '/projects/kite/access/sync');
    expect(r.status).toBe(409);
    expect(existsSync(join(outside, '.env'))).toBe(false);
  });

  it('envFor (for the agent runtime) returns exactly the granted values', async () => {
    const access = projectAccess(h.store, fileSecretStore(h.envPath), h.config.sandbox);
    expect(access.envFor('kite')).toEqual({});
    await h.call('PUT', '/projects/kite/access', { grants: { 'c-openai': true, 'c-stripe': true } });
    expect(access.envFor('kite')).toEqual({ OPENAI_API_KEY: OAI });
  });

  it('deleting a project drops its grants', async () => {
    await h.call('PUT', '/projects/kite/access', { grants: { 'c-github': true } });
    await h.call('DELETE', '/projects/kite');
    expect((await h.call('GET', '/credentials/c-github')).body.projectIds).toEqual([]);
  });
});
