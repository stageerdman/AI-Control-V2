/* Git worktrees per checklist item (F1b): every item works on its own branch in its own checkout under
   the data dir (`<home>/worktrees/<projectId>/<item>`), so items can run in parallel without sharing an
   index, and merges back into the project's main branch when it is accepted.

   Why the data dir and not `<project>/.ai-studio/worktrees`: a checkout inside the project would show up in
   the agents' (and the user's) searches, the health check and editors, and needs an ignore rule in the
   user's repo; under the data dir the project folder stays exactly as the user knows it. The worktree's
   metadata lives in the project's own `.git/worktrees/` as usual.

   Never lose work: before a checkout is removed, everything in it is committed on its branch; a branch is
   deleted only after it landed (`git branch -d` refuses otherwise); failed or clashing work stays on its
   branch. Landing itself (land.ts) never merges in the project folder. Local git only — no remotes. */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { slugify } from '../domain/ids.ts';
import { identityEnv } from '../setter/git.ts';
import { type LandResult, land, type TestStep } from './land.ts';
import { excludeNeverCommit, git, reason, tryGit } from './run-git.ts';

/** One item's checkout. `main` = the branch it lands on; `base` = the commit it started from. */
export type Workspace = { cwd: string; branch: string; base: string; main: string };

/** The project's main branch: `main` or `master` when it has one, else the branch its folder has out — never
    merely whatever happens to be checked out when a task starts (Always Merged). */
export async function mainBranch(repo: string): Promise<string> {
  for (const b of ['main', 'master'])
    if ((await tryGit(repo, ['rev-parse', '--verify', '-q', `refs/heads/${b}`])) !== null) return b;
  return git(repo, ['symbolic-ref', '--short', 'HEAD']);
}

export function worktrees(root: string) {
  /** Commit everything the run left in the checkout (its own branch) — never secrets or regenerable
      dependency folders, even when the project's .gitignore forgets them. Returns the sha, or null when clean. */
  async function commitAll(ws: Workspace, message: string): Promise<string | null> {
    if (!existsSync(ws.cwd)) return null;
    await git(ws.cwd, ['add', '-A', '--', '.', ...excludeNeverCommit()]);
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
      const main = from?.branch ?? (await mainBranch(repo));
      const base = await git(repo, ['rev-parse', `refs/heads/${main}`]);
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
      const main = mainOk ? ws.main : await mainBranch(repo);
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

    /** Commit what's left, then land the branch on main (land.ts): main is merged in and tested in the checkout,
        and main only ever fast-forwards. A clash or failing tests leave main untouched. */
    async land(ws: Workspace, message: string, test?: TestStep): Promise<LandResult> {
      try {
        await commitAll(ws, message);
      } catch (e) {
        return { ok: false, kind: 'error', reason: `Couldn't commit the work on ${ws.branch}: ${reason(e)}` };
      }
      return land(ws, test);
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
