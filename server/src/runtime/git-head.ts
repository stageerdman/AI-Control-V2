/* How the runtime tells a stuck run from a working one: the checkout's HEAD commit (null: not a git repo),
   and its uncommitted changes (did the run change any file?). */

import { execFileSync } from 'node:child_process';

const git = (cwd: string, args: string[]): string | null => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null; // no repo or no commits yet: no mark, so the session counts as no progress
  }
};

export const gitHead = (cwd: string): string | null => git(cwd, ['rev-parse', 'HEAD']);

/** The checkout's uncommitted changes, untracked files included (null: not a git repo). */
export const gitChanges = (cwd: string): string | null => git(cwd, ['status', '--porcelain', '-uall']);
