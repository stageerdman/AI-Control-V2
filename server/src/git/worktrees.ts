/* Git worktrees per checklist item (F1b): every item works on its own branch in its own checkout under
   the data dir (`<home>/worktrees/<projectId>/<item>`), so items can run in parallel without sharing an
   index, and merges back into the project's main branch when it is accepted.

   Why the data dir and not `<project>/.ai-studio/worktrees`: a checkout inside the project would show up in
   the agents' (and the user's) searches, the health check and editors, and needs an ignore rule in the
   user's repo; under the data dir the project folder stays exactly as the user knows it. The worktree's
   metadata lives in the project's own `.git/worktrees/` as usual.

   Never lose work: before a checkout is removed, everything in it is committed on its branch; a branch is
   deleted only after it was merged (`git branch -d` refuses otherwise); failed or conflicted work stays
   on its branch. Local git only — no remotes, no network. */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { slugify } from '../domain/ids.ts';
import { identityEnv } from '../setter/git.ts';

const exec = promisify(execFile);
const ENV = { GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' };

async function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  const { stdout } = await exec('git', args, {
    cwd,
    env: { ...process.env, ...ENV, ...env },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}
const tryGit = async (cwd: string, args: string[]) => {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
};
/** Left out of the safety-net commit: secrets and folders an install recreates. */
const NEVER_COMMIT = [
  '**/.env',
  '**/.env.*',
  '**/node_modules/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/.DS_Store',
];
const reason = (e: unknown) =>
  ((e as { stderr?: string }).stderr || (e as Error).message || 'git failed').trim().slice(0, 1000);

/** One item's checkout. `main` = the branch it merges back into; `base` = the commit it started from. */
export type Workspace = { cwd: string; branch: string; base: string; main: string };
export type MergeResult =
  | { ok: true; commit: string | null }
  | { ok: false; conflict: true; files: string[]; reason: string }
  | { ok: false; conflict: false; reason: string };

export function worktrees(root: string) {
  /** Commit everything the run left in the checkout (its own branch) — never secrets or regenerable
      dependency folders, even when the project's .gitignore forgets them. Returns the sha, or null when clean. */
  async function commitAll(ws: Workspace, message: string): Promise<string | null> {
    if (!existsSync(ws.cwd)) return null;
    await git(ws.cwd, ['add', '-A', '--', '.', ...NEVER_COMMIT.map((p) => `:(exclude,glob)${p}`)]);
    if ((await tryGit(ws.cwd, ['diff', '--cached', '--quiet'])) !== null) return null; // nothing staged
    await git(ws.cwd, ['commit', '-q', '--no-verify', '-m', message], identityEnv(ws.cwd));
    return git(ws.cwd, ['rev-parse', 'HEAD']);
  }

  return {
    root,
    /** A repo with at least one commit, on a branch (not detached)? Then items get worktrees. */
    async usable(repo: string): Promise<boolean> {
      if (!existsSync(join(repo, '.git'))) return false;
      return (
        (await tryGit(repo, ['rev-parse', '--verify', '-q', 'HEAD'])) !== null &&
        (await tryGit(repo, ['symbolic-ref', '-q', '--short', 'HEAD'])) !== null
      );
    },

    /** A fresh checkout on a new branch from the main branch's tip. Null when the repo can't have one. */
    async open(repo: string, projectId: string, itemId: string, label: string): Promise<Workspace | null> {
      if (!(await this.usable(repo))) return null;
      const main = (await git(repo, ['symbolic-ref', '--short', 'HEAD'])) as string;
      const base = await git(repo, ['rev-parse', 'HEAD']);
      const short = itemId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
      const name = `${slugify(label, 'item').slice(0, 40)}-${short}`;
      const branch = `studio/${name}`;
      const dir = join(root, slugify(projectId, 'project'), name);
      mkdirSync(join(root, slugify(projectId, 'project')), { recursive: true, mode: 0o700 });
      await git(repo, ['worktree', 'add', '-q', '-b', branch, dir, base]);
      return { cwd: dir, branch, base, main };
    },

    commitAll,

    /** Commit what's left, then merge the branch into main in the project folder: fast-forward when possible,
        else a merge commit. On a conflict the merge is aborted (main untouched) and the files are listed. */
    async merge(repo: string, ws: Workspace, message: string): Promise<MergeResult> {
      try {
        await commitAll(ws, message);
      } catch (e) {
        return {
          ok: false,
          conflict: false,
          reason: `Couldn't commit the work on ${ws.branch}: ${reason(e)}`,
        };
      }
      const on = await tryGit(repo, ['symbolic-ref', '-q', '--short', 'HEAD']);
      if (on !== ws.main)
        return {
          ok: false,
          conflict: false,
          reason: `The project folder is on '${on ?? 'a detached HEAD'}', not '${ws.main}' — switch back to merge ${ws.branch}`,
        };
      const ahead = Number(await git(repo, ['rev-list', '--count', `${ws.main}..${ws.branch}`]));
      if (ahead === 0) return { ok: true, commit: null };
      try {
        await git(repo, ['merge', '-q', '--ff-only', ws.branch]);
        return { ok: true, commit: await git(repo, ['rev-parse', 'HEAD']) };
      } catch {
        /* main moved on (another item merged first): a real merge */
      }
      try {
        await git(repo, ['merge', '-q', '--no-ff', '--no-edit', '-m', message, ws.branch], identityEnv(repo));
        return { ok: true, commit: await git(repo, ['rev-parse', 'HEAD']) };
      } catch (e) {
        const files = ((await tryGit(repo, ['diff', '--name-only', '--diff-filter=U'])) ?? '')
          .split('\n')
          .filter(Boolean);
        await tryGit(repo, ['merge', '--abort']);
        return files.length
          ? {
              ok: false,
              conflict: true,
              files,
              reason: `Merging ${ws.branch} into ${ws.main} conflicts in ${files.join(', ')}`,
            }
          : {
              ok: false,
              conflict: false,
              reason: `Couldn't merge ${ws.branch} into ${ws.main}: ${reason(e)}`,
            };
      }
    },

    /** Remove the checkout. Everything is committed first; the branch is deleted only when merged
        (`git branch -d` refuses otherwise), so unmerged work always stays on its branch. */
    async close(repo: string, ws: Workspace, opts: { deleteBranch: boolean }): Promise<{ kept: boolean }> {
      try {
        await commitAll(ws, 'AI Studio: work in progress (kept on its branch)');
      } catch {
        /* nothing to commit, or the checkout is gone */
      }
      await tryGit(repo, ['worktree', 'remove', '--force', ws.cwd]);
      await tryGit(repo, ['worktree', 'prune']);
      if (opts.deleteBranch) await tryGit(repo, ['branch', '-q', '-d', ws.branch]);
      /* kept = the branch still holds work main doesn't have */
      const left = await tryGit(repo, ['rev-list', '--count', `${ws.main}..${ws.branch}`]);
      return { kept: left !== null && Number(left) > 0 };
    },
  };
}
export type Worktrees = ReturnType<typeof worktrees>;
