/* Thin, local-only git. No remotes, no network — creating a GitHub repo is a later, opt-in step. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const FALLBACK_ID = { name: 'AI Studio', email: 'studio@localhost' };

function run(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
}
const tryRun = (cwd: string, args: string[]) => {
  try {
    return run(cwd, args);
  } catch {
    return null;
  }
};

export const isRepo = (dir: string) => existsSync(join(dir, '.git'));
export const head = (dir: string) =>
  isRepo(dir) ? tryRun(dir, ['rev-parse', '--verify', '-q', 'HEAD']) : null;
export const commitCount = (dir: string) => Number(tryRun(dir, ['rev-list', '--count', 'HEAD']) ?? 0);

export function init(dir: string): void {
  run(dir, ['init', '-q', '-b', 'main']);
}

/** Use the user's git identity; fall back to "AI Studio" only when none is configured. */
function identityEnv(dir: string): NodeJS.ProcessEnv {
  const name = tryRun(dir, ['config', 'user.name']);
  const email = tryRun(dir, ['config', 'user.email']);
  if (name && email) return {};
  return {
    GIT_AUTHOR_NAME: name || FALLBACK_ID.name,
    GIT_AUTHOR_EMAIL: email || FALLBACK_ID.email,
    GIT_COMMITTER_NAME: name || FALLBACK_ID.name,
    GIT_COMMITTER_EMAIL: email || FALLBACK_ID.email,
  };
}

/** Commit exactly `paths` (relative to dir) — nothing else the user may have staged. Returns the sha. */
export function commitOnly(dir: string, paths: readonly string[], message: string): string {
  run(dir, ['add', '--', ...paths]);
  run(dir, ['commit', '-q', '--no-verify', '-m', message, '--only', '--', ...paths], identityEnv(dir));
  return run(dir, ['rev-parse', 'HEAD']);
}
