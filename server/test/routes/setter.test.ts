import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readModules } from '../../src/blueprint/modules.ts';
import { finishDraft } from '../../src/setter/finish.ts';
import { testApp } from '../helpers.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('Project Setter API', () => {
  let h: ReturnType<typeof testApp>;
  const draft = async (body: object) => (await h.call('POST', '/drafts', body)).body as { id: string };
  const projectCount = () => h.store.projects.list().length;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('GET /blueprint lists the modules (no bodies) and the scaffold tree', async () => {
    const { body } = await h.call('GET', '/blueprint');
    expect(body.modulesDir).toBe(join(h.config.controlHome, 'modules'));
    expect(body.modules).toEqual([
      { name: 'STRUCTURE', description: 'How projects are laid out.' },
      { name: 'CODING', description: 'How code is written.' },
    ]);
    expect(body.tree.map((t: { path: string }) => t.path)).toEqual([
      '.project',
      'CLAUDE.md',
      '.gitignore',
      '.env',
      'updates/',
      'issues.txt',
    ]);
  });

  it('finish (new): creates the project, scaffolds the folder, commits, and removes the draft', async () => {
    const d = await draft({
      mode: 'new',
      name: 'Hello Studio',
      about: 'First real project.',
      orchestratorId: 'a-maestro',
    });
    await h.call('PATCH', `/drafts/${d.id}`, { plan: { teamIds: ['ship-it'], agentIds: ['a-prof'] } });
    const r = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(r.status).toBe(201);
    expect(r.body.project).toMatchObject({
      id: 'hello-studio',
      name: 'Hello Studio',
      folder: 'hello-studio',
      note: 'First real project.',
      orchestratorId: 'a-maestro',
      teamIds: ['ship-it'],
      agentIds: ['a-prof'],
    });
    expect(r.body.steps.at(-1)).toMatchObject({ step: 'commit', status: 'done' });
    expect(r.body.commit).toMatch(/^[0-9a-f]{40}$/);
    expect((await h.call('GET', `/drafts/${d.id}`)).status).toBe(404);

    const dir = join(h.config.sandbox, 'hello-studio');
    expect(git(dir, 'log', '--format=%s')).toBe('AI Studio: set up Hello Studio');
    const rep = await h.call('GET', '/projects/hello-studio/scaffold');
    expect(rep.body).toMatchObject({
      folder: 'hello-studio',
      exists: true,
      complete: true,
      git: { repo: true, commits: 1 },
    });
  });

  it('finish (adopt): brings an existing sandbox folder in without overwriting', async () => {
    const dir = join(h.config.sandbox, 'old-blog');
    mkdirSync(dir);
    writeFileSync(join(dir, 'CLAUDE.md'), 'keep\n');
    const d = await draft({ mode: 'adopt', name: 'Old Blog', folder: 'old-blog' });
    const r = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(r.status).toBe(201);
    expect(r.body.steps.find((s: { step: string }) => s.step === 'CLAUDE.md').status).toBe('kept');
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('keep\n');
    expect(r.body.project.folder).toBe('old-blog');
  });

  it('refuses unfinishable drafts with clear errors and leaves them in place', async () => {
    const noName = await draft({ mode: 'new' });
    expect((await h.call('POST', `/drafts/${noName.id}/finish`)).status).toBe(422);

    mkdirSync(join(h.config.sandbox, 'taken'));
    writeFileSync(join(h.config.sandbox, 'taken', 'x'), '');
    const clash = await draft({ mode: 'new', name: 'Taken' });
    const c = await h.call('POST', `/drafts/${clash.id}/finish`);
    expect(c.status).toBe(409);
    expect(c.body.error.message).toMatch(/adopt it instead/);

    const missing = await draft({ mode: 'adopt', name: 'Ghost', folder: 'ghost' });
    expect((await h.call('POST', `/drafts/${missing.id}/finish`)).status).toBe(422);
    expect((await h.call('POST', '/drafts/d-nope/finish')).status).toBe(404);
    expect((await h.call('GET', '/drafts')).body).toHaveLength(3);
    expect(projectCount()).toBe(9);
  });

  it('a folder can only become one project', async () => {
    const a = await draft({ mode: 'new', name: 'Twin' });
    await h.call('POST', `/drafts/${a.id}/finish`);
    const b = await draft({ mode: 'adopt', name: 'Twin again', folder: 'twin' });
    expect((await h.call('POST', `/drafts/${b.id}/finish`)).status).toBe(409);
  });

  it('is atomic: a scaffold failure inside the transaction leaves no project, keeps the draft, removes the new folder', async () => {
    const d = await draft({ mode: 'new', name: 'Doomed' });
    const deps = {
      store: h.store,
      sandbox: h.config.sandbox,
      controlHome: h.config.controlHome,
      modules: () => {
        throw new Error('modules unreadable');
      },
      today: () => '2026-11-13',
    };
    expect(() => finishDraft(deps, d.id)).toThrow(/modules unreadable/);
    expect(projectCount()).toBe(9);
    expect(h.store.projects.get('doomed')).toBeNull();
    expect(h.store.drafts.require(d.id).name).toBe('Doomed');
    expect(existsSync(join(h.config.sandbox, 'doomed'))).toBe(false);

    // a bad staffing plan fails inside the tx too, before anything is written
    const bad = await draft({ mode: 'new', name: 'Bad Plan' });
    await h.call('PATCH', `/drafts/${bad.id}`, { plan: { teamIds: ['no-such-team'] } });
    expect((await h.call('POST', `/drafts/${bad.id}/finish`)).status).toBe(422);
    expect(existsSync(join(h.config.sandbox, 'bad-plan'))).toBe(false);
    expect(projectCount()).toBe(9);
    expect(readModules(h.config.controlHome)).toHaveLength(2);
  });

  it('attempted escapes fail: a sandbox folder that symlinks out is refused with nothing written outside', async () => {
    const outside = join(h.config.home, 'outside');
    mkdirSync(outside);
    const d = await draft({ mode: 'adopt', name: 'Sneaky', folder: 'sneaky' }); // validated while it didn't exist
    symlinkSync(outside, join(h.config.sandbox, 'sneaky'));
    const r = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(r.status).toBe(422);
    expect(r.body.error.message).toMatch(/symlink/);
    expect(readdirSync(outside)).toEqual([]);
    expect(projectCount()).toBe(9);
  });

  it('GET /projects/:id/scaffold needs a folder', async () => {
    expect((await h.call('GET', '/projects/aurora/scaffold')).status).toBe(409);
    expect((await h.call('GET', '/projects/ghost/scaffold')).status).toBe(404);
  });

  it('GET /sandbox/folders lists adoptable folders only', async () => {
    const sb = h.config.sandbox;
    mkdirSync(join(sb, 'zeta'));
    mkdirSync(join(sb, 'alpha'));
    execFileSync('git', ['init', '-q'], { cwd: join(sb, 'alpha') });
    writeFileSync(join(sb, 'alpha', '.project'), 'name: alpha\n');
    mkdirSync(join(sb, '.hidden'));
    writeFileSync(join(sb, 'loose-file.txt'), '');
    symlinkSync(h.config.home, join(sb, 'link-out'));
    const d = await draft({ mode: 'new', name: 'Mine' });
    await h.call('POST', `/drafts/${d.id}/finish`);
    const { body } = await h.call('GET', '/sandbox/folders');
    expect(body).toEqual([
      { folder: 'alpha', git: true, marked: true },
      { folder: 'zeta', git: false, marked: false },
    ]);
  });
});
