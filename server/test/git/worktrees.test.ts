import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { worktrees } from '../../src/git/worktrees.ts';
import { tempDir } from '../helpers.ts';

const ID = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...ID } }).trim();

describe('worktrees (temp git repos)', () => {
  let t: ReturnType<typeof tempDir>;
  let repo: string;
  let wt: ReturnType<typeof worktrees>;
  beforeEach(() => {
    t = tempDir();
    repo = join(t.dir, 'proj');
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.name', 't');
    git(repo, 'config', 'user.email', 't@t');
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'init');
    wt = worktrees(join(t.dir, 'home', 'worktrees'));
  });
  afterEach(() => t.cleanup());

  it('not usable without git, without a commit, or on a detached HEAD', async () => {
    const plain = join(t.dir, 'plain');
    mkdirSync(plain);
    expect(await wt.open(plain, 'p', 'i1', 'x')).toBeNull();
    const empty = join(t.dir, 'empty');
    mkdirSync(empty);
    git(empty, 'init', '-q');
    expect(await wt.usable(empty)).toBe(false);
    git(repo, 'checkout', '-q', '--detach');
    expect(await wt.usable(repo)).toBe(false);
  });

  it('open → work → merge fast-forwards into main → close deletes the merged branch and the checkout', async () => {
    const ws = await wt.open(repo, 'proj', 'item-1234abcd', 'Build the page');
    expect(ws).toMatchObject({ branch: 'studio/build-the-page-item1234', main: 'main' });
    expect(ws?.cwd.startsWith(join(t.dir, 'home', 'worktrees', 'proj'))).toBe(true);
    if (!ws) throw new Error('no ws');
    writeFileSync(join(ws.cwd, 'page.html'), '<h1>hi</h1>\n');
    // a project .env (gitignored) would be copied in; here the checkout gets none
    // secrets and dependency folders never land in the safety-net commit
    writeFileSync(join(ws.cwd, '.env'), 'KEY=secret\n');
    mkdirSync(join(ws.cwd, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(ws.cwd, 'node_modules', 'x', 'i.js'), '1');
    const r = await wt.merge(repo, ws, 'AI Studio: Build the page');
    expect(r).toMatchObject({ ok: true, commit: expect.any(String) });
    expect(readFileSync(join(repo, 'page.html'), 'utf8')).toBe('<h1>hi</h1>\n');
    expect(git(repo, 'ls-files')).toBe('a.txt\npage.html');
    expect(git(repo, 'log', '--format=%s', '-1')).toBe('AI Studio: Build the page'); // fast-forward: the work commit
    await wt.close(repo, ws, { deleteBranch: true });
    expect(existsSync(ws.cwd)).toBe(false);
    expect(git(repo, 'branch', '--list', 'studio/*')).toBe('');
  });

  it('copies the project .env (never committed) into the checkout, 0600', async () => {
    writeFileSync(join(repo, '.gitignore'), '.env\n');
    git(repo, 'add', '.gitignore');
    git(repo, 'commit', '-q', '-m', 'ignore');
    writeFileSync(join(repo, '.env'), 'KEY=v\n');
    const ws = await wt.open(repo, 'proj', 'eeeeeeee1', 'E');
    if (!ws) throw new Error('no ws');
    expect(readFileSync(join(ws.cwd, '.env'), 'utf8')).toBe('KEY=v\n');
    expect((statSync(join(ws.cwd, '.env')).mode & 0o777).toString(8)).toBe('600');
    writeFileSync(join(ws.cwd, 'x.txt'), 'x\n');
    await wt.merge(repo, ws, 'E');
    expect(git(repo, 'ls-files')).not.toContain('.env');
  });

  it('two items in parallel: the second merges with a merge commit; nothing to merge is fine', async () => {
    const a = await wt.open(repo, 'proj', 'aaaaaaaa1', 'A');
    const b = await wt.open(repo, 'proj', 'bbbbbbbb1', 'B');
    const c = await wt.open(repo, 'proj', 'cccccccc1', 'C');
    if (!a || !b || !c) throw new Error('no ws');
    writeFileSync(join(a.cwd, 'a2.txt'), 'a\n');
    writeFileSync(join(b.cwd, 'b.txt'), 'b\n');
    expect((await wt.merge(repo, a, 'A')).ok).toBe(true);
    const rb = await wt.merge(repo, b, 'B');
    expect(rb.ok).toBe(true);
    expect(git(repo, 'log', '--format=%s', '-1')).toBe('B'); // the merge commit
    expect(git(repo, 'rev-list', '--count', 'HEAD')).toBe('4'); // init, A, B work, merge
    expect(await wt.merge(repo, c, 'C')).toEqual({ ok: true, commit: null });
  });

  it('a conflict is aborted (main untouched), files listed; close keeps the unmerged branch with the work', async () => {
    const a = await wt.open(repo, 'proj', 'aaaaaaaa2', 'A');
    const b = await wt.open(repo, 'proj', 'bbbbbbbb2', 'B');
    if (!a || !b) throw new Error('no ws');
    writeFileSync(join(a.cwd, 'a.txt'), 'from A\n');
    writeFileSync(join(b.cwd, 'a.txt'), 'from B\n');
    expect((await wt.merge(repo, a, 'A')).ok).toBe(true);
    const head = git(repo, 'rev-parse', 'HEAD');
    const r = await wt.merge(repo, b, 'B');
    expect(r).toMatchObject({ ok: false, conflict: true, files: ['a.txt'] });
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('from A\n');
    await wt.close(repo, b, { deleteBranch: true });
    expect(git(repo, 'show', `${b.branch}:a.txt`)).toBe('from B'); // never lose work
  });

  it('refuses when the project folder is on another branch', async () => {
    const a = await wt.open(repo, 'proj', 'aaaaaaaa3', 'A');
    if (!a) throw new Error('no ws');
    git(repo, 'checkout', '-q', '-b', 'other');
    const r = await wt.merge(repo, a, 'A');
    expect(r).toMatchObject({ ok: false, conflict: false });
    expect((r as { reason: string }).reason).toMatch(/on 'other', not 'main'/);
  });

  it('ensure re-makes a put-away checkout on its kept branch (or a fresh one), at the same place', async () => {
    const ws = await wt.open(repo, 'proj', 'item-1234abcd', 'Build the page');
    if (!ws) throw new Error('no checkout');
    expect(await wt.ensure(repo, ws)).toEqual(ws); // still there: as-is
    writeFileSync(join(ws.cwd, 'b.txt'), 'two\n');
    expect((await wt.close(repo, ws, { deleteBranch: true })).kept).toBe(true);
    expect(existsSync(ws.cwd)).toBe(false);
    const back = await wt.ensure(repo, ws);
    expect(back.cwd).toBe(ws.cwd);
    expect(readFileSync(join(back.cwd, 'b.txt'), 'utf8')).toBe('two\n'); // the kept work
    expect(git(back.cwd, 'branch', '--show-current')).toBe(ws.branch);
    /* nothing kept (branch deleted) and its merge target gone: a fresh branch from the project's own */
    await wt.close(repo, back, { deleteBranch: false });
    git(repo, 'branch', '-q', '-D', ws.branch);
    const fresh = await wt.ensure(repo, { ...ws, main: 'studio/gone' });
    expect(fresh.main).toBe('main');
    expect(git(fresh.cwd, 'branch', '--show-current')).toBe(ws.branch);
  });
});
