import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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

  it('GET /blueprint lists the modules (with their text + last change) and the scaffold tree', async () => {
    const { body } = await h.call('GET', '/blueprint');
    expect(body.modulesDir).toBe(join(h.config.controlHome, 'modules'));
    expect(body.modules.map((m: { name: string }) => m.name)).toEqual(['STRUCTURE', 'CODING']);
    expect(body.modules[1]).toMatchObject({
      name: 'CODING',
      description: 'How code is written.',
      body: '# Coding\n\n## Keep it minimal\n- Build only what is needed.',
    });
    expect(Number.isNaN(Date.parse(body.modules[0].updatedAt))).toBe(false);
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
    await h.call('PATCH', `/drafts/${d.id}`, {
      plan: {
        teams: [{ teamId: 'ship-it', why: 'builds it' }],
        specialists: [{ agentId: 'a-prof', why: 'research first' }],
        summary: 'Ship-It builds, the Professor researches.',
      },
    });
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
    expect(r.body.steps.at(-2)).toMatchObject({ step: 'commit', status: 'done' });
    expect(r.body.steps.at(-1)).toMatchObject({ step: 'github', status: 'skipped' }); // no gh in tests
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
    expect(rep.body.claudeMdGenerated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
      events: h.events,
      sandbox: h.config.sandbox,
      controlHome: h.config.controlHome,
      modules: () => {
        throw new Error('modules unreadable');
      },
      today: () => '2026-11-13',
    };
    await expect(finishDraft(deps, d.id)).rejects.toThrow(/modules unreadable/);
    expect(projectCount()).toBe(9);
    expect(h.store.projects.get('doomed')).toBeNull();
    expect(h.store.drafts.require(d.id).name).toBe('Doomed');
    expect(existsSync(join(h.config.sandbox, 'doomed'))).toBe(false);

    // a staffing plan gone stale (its team deleted since) fails before anything is written
    const bad = await draft({ mode: 'new', name: 'Bad Plan' });
    const plan = { teams: [{ teamId: 'polish', why: 'tidy' }], summary: 'Polish it.' };
    expect((await h.call('PATCH', `/drafts/${bad.id}`, { plan })).status).toBe(200);
    h.store.teams.deleteRecord('polish');
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

  describe('setup on the draft (Setter first, then the team, then finish)', () => {
    const plan = { teams: [{ teamId: 'ship-it', why: 'builds it' }], summary: 'Ship-It builds.' };
    const fileList = (dir: string) => readdirSync(dir).sort();

    it('POST /setup scaffolds + commits, streams the steps, records the folder; again = only what is missing', async () => {
      const d = await draft({ mode: 'new', name: 'Kite Notes', orchestratorId: 'a-pixel' });
      const r = await h.call('POST', `/drafts/${d.id}/setup`);
      expect(r.status).toBe(200);
      expect(r.body.draft).toMatchObject({ folder: 'kite-notes', setupCommit: r.body.commit });
      expect(r.body.draft.setupAt).toBeTruthy();
      expect(r.body.steps.at(-2)).toMatchObject({ step: 'commit', status: 'done' });
      expect(r.body.steps.at(-1)).toMatchObject({ step: 'github', status: 'skipped' }); // no gh in tests
      const streamed = h.events.after('draft', d.id).filter((e) => e.type === 'setup.step');
      expect(streamed.length).toBeGreaterThanOrEqual(r.body.steps.length);
      const dir = join(h.config.sandbox, 'kite-notes');
      const before = fileList(dir);

      const again = await h.call('POST', `/drafts/${d.id}/setup`);
      expect(again.status).toBe(200);
      expect(again.body.commit).toBeNull();
      expect(again.body.draft.setupCommit).toBe(r.body.commit); // the first commit is remembered
      expect(again.body.steps.every((s: { status: string }) => s.status !== 'done')).toBe(true);
      expect(fileList(dir)).toEqual(before);
      expect(git(dir, 'rev-list', '--count', 'HEAD')).toBe('1');

      // the folder can't move now; the team step works as before
      expect((await h.call('PATCH', `/drafts/${d.id}`, { folder: 'elsewhere' })).status).toBe(409);
      expect(
        (await h.call('PATCH', `/drafts/${d.id}`, { folder: 'kite-notes', name: 'Kite Notes', plan })).status,
      ).toBe(200);
      expect(
        (await h.call('GET', '/sandbox/folders')).body.map((f: { folder: string }) => f.folder),
      ).not.toContain('kite-notes');

      // finish only creates the project: on set, the draft's tile, no new commit
      const f = await h.call('POST', `/drafts/${d.id}/finish`);
      expect(f.status).toBe(201);
      expect(f.body).toMatchObject({ steps: [], commit: r.body.commit });
      expect(f.body.project).toMatchObject({
        id: 'kite-notes',
        folder: 'kite-notes',
        status: 'live',
        teamIds: ['ship-it'],
        tile: { g1: '#ff6f73', g2: '#ffc24b', glyph: 'quill' }, // = the app's / prototype's tile for the name
      });
      expect(git(dir, 'rev-list', '--count', 'HEAD')).toBe('1');
      expect(h.events.after('project', 'kite-notes').some((e) => e.type === 'setup.step')).toBe(true);
      expect((await h.call('GET', `/drafts/${d.id}`)).status).toBe(404);
    });

    it('adopt: setup keeps what is there; a second draft cannot claim the same folder', async () => {
      const dir = join(h.config.sandbox, 'old-blog');
      mkdirSync(dir);
      writeFileSync(join(dir, 'CLAUDE.md'), 'keep\n');
      const a = await draft({ mode: 'adopt', name: 'Old Blog', folder: 'old-blog' });
      const r = await h.call('POST', `/drafts/${a.id}/setup`);
      expect(r.body.steps.find((s: { step: string }) => s.step === 'CLAUDE.md').status).toBe('kept');
      expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('keep\n');
      const b = await draft({ mode: 'adopt', name: 'Twin', folder: 'old-blog' });
      const c = await h.call('POST', `/drafts/${b.id}/setup`);
      expect(c.status).toBe(409);
      expect(c.body.error.message).toMatch(/Another draft/);
    });

    it('deleting a set-up draft never touches the folder (keptFolder); undo brings the draft back set up', async () => {
      const d = await draft({ mode: 'new', name: 'Keep Me' });
      await h.call('POST', `/drafts/${d.id}/setup`);
      const dir = join(h.config.sandbox, 'keep-me');
      const files = fileList(dir);
      const del = await h.call('DELETE', `/drafts/${d.id}`);
      expect(del.body).toMatchObject({ deleted: { kind: 'draft', id: d.id }, keptFolder: 'keep-me' });
      expect(fileList(dir)).toEqual(files);
      // the folder is adoptable again
      expect(
        (await h.call('GET', '/sandbox/folders')).body.map((f: { folder: string }) => f.folder),
      ).toContain('keep-me');
      await h.call('POST', `/trash/${del.body.restoreToken}/restore`);
      expect((await h.call('GET', `/drafts/${d.id}`)).body).toMatchObject({
        folder: 'keep-me',
        setupAt: expect.any(String),
      });
      const plain = await draft({ mode: 'new', name: 'Never Set Up' });
      expect((await h.call('DELETE', `/drafts/${plain.id}`)).body.keptFolder).toBeNull();
    });

    it('finish refuses a set-up folder that vanished, and pending briefs; setup needs a name', async () => {
      const noName = await draft({ mode: 'new' });
      expect((await h.call('POST', `/drafts/${noName.id}/setup`)).status).toBe(422);
      const d = await draft({ mode: 'new', name: 'Vanish' });
      await h.call('POST', `/drafts/${d.id}/setup`);
      await h.call('PATCH', `/drafts/${d.id}`, { plan: { ...plan, newTeams: [{ brief: 'mobile' }] } });
      expect((await h.call('POST', `/drafts/${d.id}/finish`)).status).toBe(409);
      await h.call('PATCH', `/drafts/${d.id}`, { plan });
      rmSync(join(h.config.sandbox, 'vanish'), { recursive: true });
      const r = await h.call('POST', `/drafts/${d.id}/finish`);
      expect(r.status).toBe(409);
      expect(r.body.error.message).toMatch(/gone/);
      expect(projectCount()).toBe(9);
    });
  });
});
