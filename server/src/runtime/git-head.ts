/* How the runtime tells a stuck run from a working one: the checkout's HEAD commit (null: not a git repo). */

import { execFileSync } from 'node:child_process';

export function gitHead(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null; // no repo or no commits yet: no mark, so the session counts as no progress
  }
}
