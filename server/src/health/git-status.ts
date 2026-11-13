/* Git / GitHub status of a project folder. Local git only (no fetch, no network); the one
   network call — GitHub visibility via `gh repo view --json visibility` (read-only) — happens
   only when asked, a remote exists, it points at GitHub, and `gh` is installed. Remote URLs
   lose any embedded credentials before they leave this module. */
import { execFile, execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { promisify } from 'node:util';
import { isRepo } from '../setter/git.ts';

export type GitStatus = {
  repo: boolean;
  branch: string | null;
  clean: boolean | null;
  /** Changed / untracked / staged paths (porcelain lines). */
  changes: number;
  lastCommit: { hash: string; subject: string; date: string } | null;
  commits: number;
  remote: { name: string; url: string } | null;
  github: {
    repo: string | null;
    visibility: 'public' | 'private' | 'internal' | null;
    /** Why visibility is unknown (no remote, not GitHub, gh missing, not asked, gh error). */
    note?: string;
  };
};

const git = (cwd: string, args: string[]): string | null => {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    }).trimEnd();
  } catch {
    return null;
  }
};

/** `https://user:token@host/x` → `https://host/x`; scp-style `git@host:x` is kept (no secret in it). */
export function safeRemoteUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]*@/i, '$1');
}

/** owner/repo for GitHub remotes (https or ssh), else null. */
export function githubRepo(url: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(safeRemoteUrl(url));
  return m ? `${m[1]}/${m[2]}` : null;
}

export type GhProbe = (repo: string) => Promise<GitStatus['github']['visibility']>;

const GH_CANDIDATES = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
export function findGh(candidates = GH_CANDIDATES): string | null {
  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

/** The real probe: `gh repo view <repo> --json visibility` (read-only), 10 s timeout. */
export function ghProbe(bin: string): GhProbe {
  const run = promisify(execFile);
  return async (repo) => {
    const { stdout } = await run(bin, ['repo', 'view', repo, '--json', 'visibility'], {
      timeout: 10_000,
      env: { HOME: process.env.HOME ?? '', PATH: process.env.PATH ?? '', GH_PROMPT_DISABLED: '1' },
    });
    const v = String((JSON.parse(stdout) as { visibility?: string }).visibility ?? '').toLowerCase();
    return v === 'public' || v === 'private' || v === 'internal' ? v : null;
  };
}

/** Local status; pass `gh` to also learn the GitHub visibility (network). */
export async function gitStatus(dir: string, opts: { gh?: GhProbe | null } = {}): Promise<GitStatus> {
  if (!isRepo(dir))
    return {
      repo: false,
      branch: null,
      clean: null,
      changes: 0,
      lastCommit: null,
      commits: 0,
      remote: null,
      github: { repo: null, visibility: null, note: 'Not a git repository' },
    };
  const porcelain = git(dir, ['status', '--porcelain']) ?? '';
  const changes = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;
  const log = git(dir, ['log', '-1', '--format=%H%x1f%s%x1f%cI']);
  const [hash, subject, date] = log ? log.split('\x1f') : [];
  const remoteName = (git(dir, ['remote']) ?? '').split('\n').filter(Boolean)[0] ?? null;
  const rawUrl = remoteName ? git(dir, ['remote', 'get-url', remoteName]) : null;
  const remote = remoteName && rawUrl ? { name: remoteName, url: safeRemoteUrl(rawUrl) } : null;
  const repo = remote ? githubRepo(remote.url) : null;

  let github: GitStatus['github'] = { repo, visibility: null };
  if (!remote) github.note = 'No remote — local only';
  else if (!repo) github.note = 'The remote is not on GitHub';
  else if (opts.gh === undefined) github.note = 'Visibility not checked';
  else if (opts.gh === null) github.note = 'GitHub CLI (gh) not installed';
  else {
    try {
      github = { repo, visibility: await opts.gh(repo) };
    } catch (e) {
      github = {
        repo,
        visibility: null,
        note: `gh could not tell: ${(e as Error).message.split('\n')[0]?.slice(0, 200)}`,
      };
    }
  }
  return {
    repo: true,
    branch: git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']) || git(dir, ['rev-parse', '--short', 'HEAD']),
    clean: changes === 0,
    changes,
    lastCommit: hash ? { hash, subject: subject ?? '', date: date ?? '' } : null,
    commits: Number(git(dir, ['rev-list', '--count', 'HEAD']) ?? 0),
    remote,
    github,
  };
}
