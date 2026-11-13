import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { githubRepo, gitStatus, safeRemoteUrl } from '../../src/health/git-status.ts';
import { tempDir } from '../helpers.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@x',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@x',
    },
  });

describe('git / GitHub status (local, no network unless asked)', () => {
  let t: ReturnType<typeof tempDir>;
  let dir: string;
  beforeEach(() => {
    t = tempDir();
    dir = join(t.dir, 'p');
    mkdirSync(dir);
  });
  afterEach(() => t.cleanup());

  it('not a repo / a repo with no commits', async () => {
    expect(await gitStatus(dir)).toMatchObject({
      repo: false,
      clean: null,
      github: { note: 'Not a git repository' },
    });
    git(dir, 'init', '-q', '-b', 'main');
    expect(await gitStatus(dir)).toMatchObject({
      repo: true,
      branch: 'main',
      clean: true,
      commits: 0,
      lastCommit: null,
      remote: null,
      github: { visibility: null, note: 'No remote — local only' },
    });
  });

  it('branch, dirty count, last commit', async () => {
    git(dir, 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'a.txt'), 'a');
    git(dir, 'add', 'a.txt');
    git(dir, 'commit', '-q', '-m', 'First thing');
    let s = await gitStatus(dir);
    expect(s).toMatchObject({ clean: true, changes: 0, commits: 1, lastCommit: { subject: 'First thing' } });
    expect(s.lastCommit?.hash).toMatch(/^[0-9a-f]{40}$/);
    writeFileSync(join(dir, 'a.txt'), 'changed');
    writeFileSync(join(dir, 'b.txt'), 'new');
    s = await gitStatus(dir);
    expect(s).toMatchObject({ clean: false, changes: 2 });
  });

  it('remotes: credentials never leave; gh is asked only for a GitHub remote, only when given', async () => {
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', 'https://bob:ghp_SECRET123@github.com/bob/moon-shop.git');
    const asked: string[] = [];
    const gh = async (repo: string) => {
      asked.push(repo);
      return 'private' as const;
    };
    const local = await gitStatus(dir);
    expect(local.remote).toEqual({ name: 'origin', url: 'https://github.com/bob/moon-shop.git' });
    expect(JSON.stringify(local)).not.toContain('SECRET');
    expect(local.github).toEqual({ repo: 'bob/moon-shop', visibility: null, note: 'Visibility not checked' });
    expect(asked).toEqual([]);
    expect((await gitStatus(dir, { gh })).github).toEqual({ repo: 'bob/moon-shop', visibility: 'private' });
    expect(asked).toEqual(['bob/moon-shop']);
    expect((await gitStatus(dir, { gh: null })).github.note).toBe('GitHub CLI (gh) not installed');
    const broken = async () => {
      throw new Error('HTTP 404: Not Found\nmore');
    };
    expect((await gitStatus(dir, { gh: broken })).github.note).toBe('gh could not tell: HTTP 404: Not Found');
    git(dir, 'remote', 'set-url', 'origin', 'git@gitlab.com:bob/moon-shop.git');
    const other = await gitStatus(dir, { gh });
    expect(other.github).toEqual({ repo: null, visibility: null, note: 'The remote is not on GitHub' });
    expect(asked).toHaveLength(1); // not asked for a non-GitHub remote
  });

  it('parses GitHub remotes and strips credentials', () => {
    expect(githubRepo('git@github.com:acme/app.git')).toBe('acme/app');
    expect(githubRepo('https://github.com/acme/app')).toBe('acme/app');
    expect(githubRepo('https://x:y@github.com/acme/app.git/')).toBe('acme/app');
    expect(githubRepo('https://example.com/acme/app.git')).toBeNull();
    expect(safeRemoteUrl('https://tok@github.com/a/b')).toBe('https://github.com/a/b');
    expect(safeRemoteUrl('git@github.com:a/b.git')).toBe('git@github.com:a/b.git');
  });
});
