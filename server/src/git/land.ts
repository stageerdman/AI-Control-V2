/* Landing an accepted task (Always Merged): its work reaches main by itself, and nothing is ever merged in the
   user's folder.
     1. main is merged into the task's own checkout (a clash is aborted there and reported; main is untouched);
     2. the project's tests run in the checkout (optional `test:` line), so what lands is a tree somebody tested;
     3. main moves to the checkout's tip — always a fast-forward: `merge --ff-only` where main is checked out, or a
        guarded `update-ref` when it is checked out nowhere. Unsaved edits there in files the landing touches are
        first saved as their own commit on main (never lost), and the landing goes round again.
   Main moving meanwhile (another landing, the user's own commit) sends it round again, up to MAX_ROUNDS. */
import { identityEnv } from '../setter/git.ts';
import { excludeNeverCommit, git, lines, reason, tryGit } from './run-git.ts';
import type { Workspace } from './worktrees.ts';

export const MAX_ROUNDS = 3;
export const SAVED_MESSAGE = 'AI Studio: saved changes found in the project folder';

export type LandResult =
  | { ok: true; commit: string | null }
  | { ok: false; kind: 'conflict'; files: string[]; reason: string }
  | { ok: false; kind: 'tests'; reason: string }
  | { ok: false; kind: 'error'; reason: string };
/** The project's tests on the checkout's files (null: the project has no `test:` line). */
export type TestStep = (cwd: string) => Promise<{ ok: true } | { ok: false; reason: string } | null>;

/** Land the checkout's branch (everything already committed) on `ws.main`. */
export async function land(ws: Workspace, test?: TestStep): Promise<LandResult> {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const mainTip = await git(ws.cwd, ['rev-parse', `refs/heads/${ws.main}`]);
    const merged = await mergeMainIn(ws, mainTip);
    if (merged) return merged;
    const tip = await git(ws.cwd, ['rev-parse', 'HEAD']);
    if (tip === mainTip) return { ok: true, commit: null }; // nothing main doesn't have
    const tested = test ? await test(ws.cwd) : null;
    if (tested && !tested.ok) return { ok: false, kind: 'tests', reason: tested.reason };
    const moved = await moveMain(ws, mainTip, tip);
    if (moved === 'moved') return { ok: true, commit: tip };
    if (moved !== 'again') return { ok: false, kind: 'error', reason: moved.error };
  }
  return {
    ok: false,
    kind: 'error',
    reason: `${ws.main} kept moving while ${ws.branch} landed (${MAX_ROUNDS} rounds)`,
  };
}

/** Step 1: main into the checkout. → null when the branch now contains main, else why not. */
async function mergeMainIn(ws: Workspace, mainTip: string): Promise<LandResult | null> {
  if ((await tryGit(ws.cwd, ['merge-base', '--is-ancestor', mainTip, 'HEAD'])) !== null) return null;
  try {
    await git(
      ws.cwd,
      ['merge', '-q', '--no-edit', '-m', `Merge ${ws.main} into ${ws.branch}`, mainTip],
      identityEnv(ws.cwd),
    );
    return null;
  } catch (e) {
    const files = lines(await tryGit(ws.cwd, ['diff', '--name-only', '--diff-filter=U']));
    await tryGit(ws.cwd, ['merge', '--abort']);
    return files.length
      ? {
          ok: false,
          kind: 'conflict',
          files,
          reason: `Merging ${ws.main} into ${ws.branch} conflicts in ${files.join(', ')}`,
        }
      : { ok: false, kind: 'error', reason: `Couldn't merge ${ws.main} into ${ws.branch}: ${reason(e)}` };
  }
}

type Move = 'moved' | 'again' | { error: string };

/** Step 3: main from `from` to `to` (a descendant), without a merge in anyone's folder. */
async function moveMain(ws: Workspace, from: string, to: string): Promise<Move> {
  const where = await checkedOutAt(ws.cwd, ws.main);
  if (!where) {
    const ok = await tryGit(ws.cwd, ['update-ref', `refs/heads/${ws.main}`, to, from]);
    return ok === null ? 'again' : 'moved';
  }
  const clash = await unsavedIn(where, from, to);
  if (clash.length) return saveEdits(where, clash);
  return (await tryGit(where, ['merge', '-q', '--ff-only', to])) === null ? 'again' : 'moved';
}

/** The folder that has `branch` checked out (the project folder, or a team task's checkout), or null. */
async function checkedOutAt(cwd: string, branch: string): Promise<string | null> {
  const out = await git(cwd, ['worktree', 'list', '--porcelain']);
  for (const block of out.split('\n\n')) {
    const fields = block.split('\n');
    const path = fields.find((f) => f.startsWith('worktree '))?.slice('worktree '.length);
    if (path && fields.includes(`branch refs/heads/${branch}`)) return path;
  }
  return null;
}

/** Files with unsaved edits (or untracked) in `folder` that the landing `from..to` would touch. */
async function unsavedIn(folder: string, from: string, to: string): Promise<string[]> {
  const touched = new Set(lines(await git(folder, ['diff', '--name-only', from, to])));
  const dirty = [
    ...lines(await git(folder, ['diff', '--name-only', 'HEAD'])),
    ...lines(await git(folder, ['ls-files', '--others', '--exclude-standard'])),
  ];
  return [...new Set(dirty)].filter((f) => touched.has(f));
}

/** Save those edits as their own commit on main, so the landing merges them in on the next round. */
async function saveEdits(folder: string, files: string[]): Promise<Move> {
  try {
    await git(folder, ['add', '-A', '--', ...files, ...excludeNeverCommit()]);
    if ((await tryGit(folder, ['diff', '--cached', '--quiet'])) !== null)
      return { error: `Unsaved edits in ${files.join(', ')} in ${folder} can't be saved for the studio` };
    await git(folder, ['commit', '-q', '--no-verify', '-m', SAVED_MESSAGE], identityEnv(folder));
    return 'again';
  } catch (e) {
    return { error: `Couldn't save the edits in ${files.join(', ')} in ${folder}: ${reason(e)}` };
  }
}
