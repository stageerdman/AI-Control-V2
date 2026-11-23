/* Plain local git calls shared by the checkout (worktrees.ts) and landing (land.ts) code: no prompts, no editor,
   no network. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ENV = { GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' };

export async function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  const { stdout } = await exec('git', args, {
    cwd,
    env: { ...process.env, ...ENV, ...env },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}
/** The output, or null when git fails (a question answered "no", a ref that isn't there). */
export const tryGit = async (cwd: string, args: string[]): Promise<string | null> => {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
};
/** Left out of every commit the studio makes for someone: secrets and folders an install recreates. */
export const NEVER_COMMIT = [
  '**/.env',
  '**/.env.*',
  '**/node_modules/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/.DS_Store',
];
export const excludeNeverCommit = () => NEVER_COMMIT.map((p) => `:(exclude,glob)${p}`);
/** Why git failed, in its own words (clipped). */
export const reason = (e: unknown) =>
  ((e as { stderr?: string }).stderr || (e as Error).message || 'git failed').trim().slice(0, 1000);
export const lines = (out: string | null) => (out ?? '').split('\n').filter(Boolean);
