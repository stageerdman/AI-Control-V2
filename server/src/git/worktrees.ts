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
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

    /** A fresh checkout on a new branch from the main branch's tip — or, for a member's sub-task (F1c), from the
        team item's branch (`from`), which it then merges back into. Null when the repo can't have one. */
    async open(
      repo: string,
      projectId: string,
      itemId: string,
      label: string,
      from?: { branch: string },
    ): Promise<Workspace | null> {
      if (!(await this.usable(repo))) return null;
      const main = from?.branch ?? ((await git(repo, ['symbolic-ref', '--short', 'HEAD'])) as string);
      const base = await git(repo, ['rev-parse', from ? `refs/heads/${from.branch}` : 'HEAD']);
      const short = itemId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
      const name = `${slugify(label, 'item').slice(0, 40)}-${short}`;
      const branch = `studio/${name}`;
      const dir = join(root, slugify(projectId, 'project'), name);
      mkdirSync(join(root, slugify(projectId, 'project')), { recursive: true, mode: 0o700 });
      await git(repo, ['worktree', 'add', '-q', '-b', branch, dir, base]);
      /* the project's .env (granted secrets, never committed) works in the checkout too */
      if (existsSync(join(repo, '.env'))) {
        copyFileSync(join(repo, '.env'), join(dir, '.env'));
        chmodSync(join(dir, '.env'), 0o600);
      }
      return { cwd: dir, branch, base, main };
    },

    /** The item's checkout again, where it was (so a resumed session finds its files): kept as-is when it's
        still there, else re-added on its branch — or on a fresh branch from main when nothing was kept. */
    async ensure(repo: string, ws: Workspace): Promise<Workspace> {
      if (existsSync(join(ws.cwd, '.git'))) return ws;
      await tryGit(repo, ['worktree', 'prune']);
      const has = (await tryGit(repo, ['rev-parse', '--verify', '-q', `refs/heads/${ws.branch}`])) !== null;
      /* the branch it merged into may be gone (a team item that already landed): fall back to the project's own */
      const mainOk = (await tryGit(repo, ['rev-parse', '--verify', '-q', `refs/heads/${ws.main}`])) !== null;
      const main = mainOk ? ws.main : await git(repo, ['symbolic-ref', '--short', 'HEAD']);
      mkdirSync(dirname(ws.cwd), { recursive: true, mode: 0o700 });
      let base = ws.base;
      if (has) await git(repo, ['worktree', 'add', '-q', ws.cwd, ws.branch]);
      else {
        base = await git(repo, ['rev-parse', `refs/heads/${main}`]);
        await git(repo, ['worktree', 'add', '-q', '-b', ws.branch, ws.cwd, base]);
      }
      if (existsSync(join(repo, '.env'))) {
        copyFileSync(join(repo, '.env'), join(ws.cwd, '.env'));
        chmodSync(join(ws.cwd, '.env'), 0o600);
      }
      return { ...ws, main, base };
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

    /** Put a checkout away for good so its item can start over from main on its own branch name: unmerged work
        moves to `<branch>-before-restart-<n>` (never lost), an empty or merged branch is deleted.
        → where the earlier work is kept, or null when there was none. */
    async retire(repo: string, ws: Workspace): Promise<{ keptOn: string | null }> {
      const { kept } = await this.close(repo, ws, { deleteBranch: true });
      if (!kept) return { keptOn: null };
      const keptOn = await unusedBranch(repo, `${ws.branch}-before-restart`);
      await git(repo, ['branch', '-m', ws.branch, keptOn]);
      return { keptOn };
    },
  };
}
/** `<prefix>-1`, `<prefix>-2`, … — the first one no branch has. */
async function unusedBranch(repo: string, prefix: string): Promise<string> {
  for (let n = 1; ; n++) {
    const name = `${prefix}-${n}`;
    if ((await tryGit(repo, ['rev-parse', '--verify', '-q', `refs/heads/${name}`])) === null) return name;
  }
}
export type Worktrees = ReturnType<typeof worktrees>;
