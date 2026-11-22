/* G1 GitHub: a repo by default at setup (private, pushed), the opt-outs, publish / visibility routes and their
   refusals, auto-push after a merge (a failure is a calm note), agents never push. A stub gh; no network. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ghCli } from '../../src/github/github.ts';
import { cliArgs, PUSH_BACKSTOP } from '../../src/runtime/claude-cli.ts';
import { tempDir, testApp } from '../helpers.ts';
import { stubGh } from './stub-gh.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const until = async (ok: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('GitHub', () => {
  let h: ReturnType<typeof testApp>;
  let t: ReturnType<typeof tempDir>;
  let gh: ReturnType<typeof stubGh>;
  const boot = (opts: { gh?: boolean } = {}) => {
    t = tempDir('ais-gh-');
    gh = stubGh(t.dir);
    h = testApp({ seed: true, ghRun: opts.gh === false ? null : ghCli(gh.bin), gitEnv: gh.gitEnv });
  };
  afterEach(async () => {
    await h.close();
    t.cleanup();
  });
  /** draft → setup → finish, the app's way. */
  const make = async (name: string, draft: object = {}, setup?: object) => {
    const d = (await h.call('POST', '/drafts', { mode: 'new', name, orchestratorId: 'a-pixel', ...draft }))
      .body;
    const s = await h.call('POST', `/drafts/${d.id}/setup`, setup);
    expect(s.status).toBe(200);
    await h.call('PATCH', `/drafts/${d.id}`, {
      plan: { teams: [{ teamId: 'ship-it', why: 'x' }], summary: 'x' },
    });
    const f = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(f.status).toBe(201);
    return {
      step: s.body.steps.at(-1),
      project: f.body.project,
      dir: join(h.config.sandbox, f.body.project.folder),
    };
  };

  it('setup creates a private repo by default, sets origin and pushes main; health + payload say so', async () => {
    boot();
    const { step, project, dir } = await make('Kite Notes');
    expect(step).toEqual({
      step: 'github',
      status: 'done',
      detail: 'Created https://github.com/stub-owner/kite-notes (private) and pushed',
    });
    expect(gh.calls()).toEqual(['auth status', 'repo create kite-notes --private']);
    expect(git(dir, 'remote', 'get-url', 'origin')).toBe('https://github.com/stub-owner/kite-notes.git');
    expect(git(gh.remote('kite-notes'), 'rev-parse', 'main')).toBe(git(dir, 'rev-parse', 'HEAD'));
    expect(project.github).toEqual({
      connected: true,
      private: true,
      published: true,
      url: 'https://github.com/stub-owner/kite-notes',
      visibility: 'private',
    });
    const health = (await h.call('GET', `/projects/${project.id}/health`)).body;
    expect(health.github).toMatchObject({ published: true, visibility: 'private', lastPush: { ok: true } });
    expect(health.github.note).toBeUndefined();
  });

  it('opt-outs: github:false on the setup or the draft, or the studio setting off → no repo; Publish later', async () => {
    boot();
    const a = await make('No Hub', {}, { github: false });
    expect(a.step).toMatchObject({ step: 'github', status: 'skipped' });
    expect(a.step.detail).toContain('off for this project');
    const b = await make('Draft Off', { github: false });
    expect(b.step.status).toBe('skipped');
    expect((await h.call('GET', '/settings')).body).toEqual({
      githubByDefault: true,
      autoApprove: true,
      hqProjectId: null,
    });
    expect((await h.call('PATCH', '/settings', { githubByDefault: false })).body).toEqual({
      githubByDefault: false,
      autoApprove: true,
      hqProjectId: null,
    });
    const c = await make('Studio Off');
    expect(c.step.status).toBe('skipped');
    expect(gh.calls()).toEqual([]); // gh never asked
    const health = (await h.call('GET', `/projects/${a.project.id}/health`)).body;
    expect(health.github).toEqual({
      published: false,
      url: null,
      visibility: null,
      lastPush: null,
      note: 'GitHub not connected — Publish',
    });

    /* the user's button */
    const p = await h.call('POST', `/projects/${a.project.id}/github/publish`, { visibility: 'public' });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({
      published: true,
      url: 'https://github.com/stub-owner/no-hub',
      visibility: 'public',
      pushed: true,
    });
    expect(gh.visibility('no-hub')).toBe('PUBLIC');
    const again = await h.call('POST', `/projects/${a.project.id}/github/publish`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.message).toContain(
      'already has a remote (origin → https://github.com/stub-owner/no-hub.git)',
    );
    const named = await h.call('POST', `/projects/${b.project.id}/github/publish`, { name: 'custom-name' });
    expect(named.body).toMatchObject({
      url: 'https://github.com/stub-owner/custom-name',
      visibility: 'private',
    });
    expect(
      (await h.call('POST', `/projects/${c.project.id}/github/publish`, { name: 'bad name!' })).status,
    ).toBe(422);
    const evs = h.events.after('project', a.project.id).filter((e) => e.type === 'github.changed');
    expect(evs.map((e) => e.payload)).toEqual([
      { published: true, url: 'https://github.com/stub-owner/no-hub', visibility: 'public' },
    ]);
  });

  it('gh not logged in or missing: setup still finishes; publish refuses clearly', async () => {
    boot();
    gh.logOut();
    const { step, project } = await make('Offline');
    expect(step.status).toBe('skipped');
    expect(step.detail).toBe(
      'GitHub not connected — Publish — gh isn’t logged in — run `gh auth login` in Terminal, then publish again',
    );
    const r = await h.call('POST', `/projects/${project.id}/github/publish`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.message).toContain('gh auth login');
    await h.close();
    t.cleanup();
    boot({ gh: false });
    const m = await make('No Gh');
    expect(m.step.detail).toContain('isn’t installed');
    expect(
      (await h.call('POST', `/projects/${m.project.id}/github/publish`, {})).body.error.message,
    ).toContain('brew install gh');
  });

  it('a name already taken on GitHub never fails the setup', async () => {
    boot();
    execFileSync('git', ['init', '-q', '--bare', gh.remote('taken')]);
    const { step, project } = await make('Taken');
    expect(step.status).toBe('skipped');
    expect(step.detail).toContain('Name already exists');
    expect(project.github.published).toBe(false);
  });

  it('the public/private switch wraps gh repo edit (and needs a published project)', async () => {
    boot();
    const { project } = await make('Switch');
    const r = await h.call('PATCH', `/projects/${project.id}/github`, { visibility: 'public' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ published: true, visibility: 'public' });
    expect(gh.calls().at(-1)).toBe(
      'repo edit stub-owner/switch --visibility public --accept-visibility-change-consequences',
    );
    expect(gh.visibility('switch')).toBe('PUBLIC');
    expect((await h.call('GET', `/projects/${project.id}`)).body.github).toMatchObject({
      private: false,
      visibility: 'public',
    });
    expect((await h.call('PATCH', `/projects/${project.id}/github`, { visibility: 'secret' })).status).toBe(
      422,
    );
    const off = await make('Local', {}, { github: false });
    expect(
      (await h.call('PATCH', `/projects/${off.project.id}/github`, { visibility: 'private' })).status,
    ).toBe(409);
  });

  it('pushes main after every merge; a failed push is a calm note + event, never an error', async () => {
    boot();
    const { project, dir } = await make('Pushy');
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    git(dir, 'add', 'a.txt');
    git(dir, '-c', 'user.name=T', '-c', 'user.email=t@x', 'commit', '-qm', 'a');
    const merged = () =>
      h.events.append('project', project.id, {
        type: 'item.merged',
        payload: { itemId: 'i1', goalId: 'g1', branch: 'studio/x' },
      });
    const pushes = () => h.events.after('project', project.id).filter((e) => e.type === 'github.push');
    merged();
    await until(() => pushes().length === 1);
    expect(pushes()[0]?.payload).toEqual({ ok: true, commit: git(dir, 'rev-parse', 'HEAD') });
    expect(git(gh.remote('pushy'), 'rev-parse', 'main')).toBe(git(dir, 'rev-parse', 'HEAD'));

    rmSync(gh.remote('pushy'), { recursive: true, force: true }); // GitHub is unreachable now
    merged();
    await until(() => pushes().length === 2);
    expect(pushes()[1]?.payload).toMatchObject({ ok: false, note: expect.any(String) });
    const health = (await h.call('GET', `/projects/${project.id}/health`)).body;
    expect(health.github.lastPush).toMatchObject({ ok: false });
    expect(health.github.note).toMatch(/^Couldn’t push to GitHub: /);

    /* "Try again" (G3): GitHub is back → the push goes through and the note is gone */
    execFileSync('git', ['init', '-q', '--bare', gh.remote('pushy')]);
    const again = await h.call('POST', `/projects/${project.id}/github/push`);
    expect(again.status).toBe(200);
    expect(again.body.lastPush).toMatchObject({ ok: true });
    expect(again.body.note).toBeUndefined();
    expect(pushes()).toHaveLength(3);

    /* not published → no push at all */
    const off = await make('Quiet', {}, { github: false });
    expect((await h.call('POST', `/projects/${off.project.id}/github/push`)).status).toBe(409);
    h.events.append('project', off.project.id, {
      type: 'item.merged',
      payload: { itemId: 'i2', goalId: 'g2', branch: 'b' },
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(h.events.after('project', off.project.id).some((e) => e.type === 'github.push')).toBe(false);
  });

  it('adopting a folder that already has a GitHub origin keeps it', async () => {
    boot();
    const dir = join(h.config.sandbox, 'old-repo');
    mkdirSync(dir);
    git(dir, 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'x'), 'x');
    git(dir, 'add', 'x');
    git(dir, '-c', 'user.name=T', '-c', 'user.email=t@x', 'commit', '-qm', 'x');
    git(dir, 'remote', 'add', 'origin', 'git@github.com:someone/old-repo.git');
    const d = (await h.call('POST', '/drafts', { mode: 'adopt', name: 'Old Repo', folder: 'old-repo' })).body;
    const s = await h.call('POST', `/drafts/${d.id}/setup`);
    expect(s.body.steps.at(-1)).toEqual({
      step: 'github',
      status: 'kept',
      detail: 'Kept its GitHub repo someone/old-repo',
    });
    expect(gh.calls()).toEqual(['auth status', 'repo view someone/old-repo --json visibility']);
    expect(git(dir, 'remote', 'get-url', 'origin')).toBe('git@github.com:someone/old-repo.git');
  });

  it('agent runs push through the hook (force and deletes stay denied); a shell without the hook never pushes', () => {
    const hooked = cliArgs(
      {
        runId: 'r',
        cwd: '/x',
        systemPrompt: '',
        task: '',
        model: 'm',
        caps: { maxTurns: 1, maxBudgetUsd: 1 },
        env: {},
        secretValues: [],
      },
      { askServer: '/a.ts', shellHook: 'HOOK' },
    );
    expect(hooked[hooked.indexOf('--disallowed-tools') + 1]).toBe(PUSH_BACKSTOP.join(','));
    expect(PUSH_BACKSTOP).toContain('Bash(git push --force*)');
    const args = cliArgs(
      {
        runId: 'r',
        cwd: '/x',
        systemPrompt: '',
        task: '',
        model: 'm',
        caps: { maxTurns: 1, maxBudgetUsd: 1 },
        env: {},
        secretValues: [],
      },
      { askServer: '/a.ts' },
    );
    expect(args[args.indexOf('--disallowed-tools') + 1]).toBe('Bash(git push),Bash(git push *)');
    const crew = cliArgs(
      {
        runId: 'r',
        cwd: '/x',
        systemPrompt: '',
        task: '',
        model: 'm',
        caps: { maxTurns: 1, maxBudgetUsd: 1 },
        env: {},
        secretValues: [],
        tools: [],
      },
      { askServer: '/a.ts' },
    );
    expect(crew).not.toContain('--disallowed-tools');
  });

  it('GET /github/status: ready with the login, signed out, missing (G3: the publish form + hints)', async () => {
    boot();
    expect((await h.call('GET', '/github/status')).body).toEqual({ gh: 'ready', login: 'stub-owner' });
    gh.logOut();
    expect((await h.call('GET', '/github/status')).body).toEqual({ gh: 'signed-out', login: null });
    await h.close();
    t.cleanup();
    boot({ gh: false });
    expect((await h.call('GET', '/github/status')).body).toEqual({ gh: 'missing', login: null });
  });
});
