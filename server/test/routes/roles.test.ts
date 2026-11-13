import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

describe('roles API', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('lists roles in order with usage counts', async () => {
    const { status, body } = await h.call('GET', '/roles');
    expect(status).toBe(200);
    expect(body.map((r: { name: string }) => r.name)).toEqual([
      'Frontend',
      'Backend',
      'Design',
      'QA',
      'Data',
      'DevOps',
      'Research',
      'Writer',
      'Release',
      'Quality',
    ]);
    expect(body[0]).toEqual({ id: 'r-frontend', name: 'Frontend', agentCount: 1 });
  });

  it('creates a role with a normalized name; duplicates (any case) are 409 with the existing id', async () => {
    const c = await h.call('POST', '/roles', { name: '  Voice   UX ' });
    expect(c).toEqual({ status: 201, body: { id: 'r-voice-ux', name: 'Voice UX', agentCount: 0 } });
    const dup = await h.call('POST', '/roles', { name: 'voice ux' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'conflict', details: { existingId: 'r-voice-ux' } });
  });

  it('rejects empty names and unknown body keys with 422', async () => {
    expect((await h.call('POST', '/roles', { name: '   ' })).status).toBe(422);
    const extra = await h.call('POST', '/roles', { name: 'Ok', color: 'red' });
    expect(extra.status).toBe(422);
    expect(extra.body.error.code).toBe('invalid');
    expect((await h.call('POST', '/roles', {})).body.error.details[0].path).toBe('name');
  });

  it('rename propagates to every agent holding the role', async () => {
    const r = await h.call('PATCH', '/roles/r-frontend', { name: 'Interface' });
    expect(r.body).toMatchObject({ id: 'r-frontend', name: 'Interface' });
    expect((await h.call('GET', '/agents/a-pete')).body).toMatchObject({
      roleId: 'r-frontend',
      role: 'Interface',
    });
  });

  it('rename to a name another role has is 409; renaming to its own name in a new case is fine', async () => {
    expect((await h.call('PATCH', '/roles/r-frontend', { name: 'backend' })).status).toBe(409);
    expect((await h.call('PATCH', '/roles/r-frontend', { name: 'FRONTEND' })).body.name).toBe('FRONTEND');
    expect((await h.call('PATCH', '/roles/r-nope', { name: 'x' })).status).toBe(404);
  });

  it('delete leaves agents role-less and returns a token that restores role and holders', async () => {
    const d = await h.call('DELETE', '/roles/r-qa');
    expect(d.status).toBe(200);
    expect(d.body.deleted).toEqual({ kind: 'role', id: 'r-qa' });
    expect((await h.call('GET', '/agents/a-scar')).body).toMatchObject({ roleId: null, role: '' });
    expect((await h.call('GET', '/roles/r-qa')).status).toBe(404);

    const r = await h.call('POST', `/trash/${d.body.restoreToken}/restore`);
    expect(r).toEqual({ status: 200, body: { restored: { kind: 'role', id: 'r-qa' } } });
    expect((await h.call('GET', '/agents/a-scar')).body.role).toBe('QA');
    // one-shot token
    expect((await h.call('POST', `/trash/${d.body.restoreToken}/restore`)).status).toBe(404);
  });

  it('restore is refused (409) if the name was taken meanwhile', async () => {
    const d = await h.call('DELETE', '/roles/r-qa');
    await h.call('POST', '/roles', { name: 'qa' });
    expect((await h.call('POST', `/trash/${d.body.restoreToken}/restore`)).status).toBe(409);
  });

  it('malformed restore tokens are 422, unknown ones 404', async () => {
    expect((await h.call('POST', '/trash/not-a-token/restore')).status).toBe(422);
    expect((await h.call('POST', '/trash/00000000-0000-4000-8000-000000000000/restore')).status).toBe(404);
  });
});
