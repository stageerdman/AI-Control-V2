/* Live check (`npm run check:push`, costs one real Claude Code run): an agent on a scratch project, started exactly
   as the studio starts one (the real CLI, allow-list and shell hook, env from scratch), pushes a commit to its own
   origin (a local bare repo) with no prompt — and its force push to master is refused, so origin keeps the commit.
   Not opted in, or no Claude Code CLI: it skips and says why. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentGitEnv } from '../../src/github/credential.ts';
import { claudeCliRunner, shellAllowed, shellHookCommand } from '../../src/runtime/claude-cli.ts';
import { AGENT_SHELL, loadRuntimeConfig } from '../../src/runtime/config.ts';
import { runEnv } from '../../src/runtime/env.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

function scratchProject(root: string) {
  const origin = join(root, 'origin.git');
  const project = join(root, 'project');
  execFileSync('git', ['init', '--bare', '-b', 'master', origin], { stdio: 'pipe' });
  execFileSync('git', ['init', '-b', 'master', project], { stdio: 'pipe' });
  git(project, 'config', 'user.name', 'Push Check');
  git(project, 'config', 'user.email', 'push-check@example.invalid');
  git(project, 'commit', '--allow-empty', '-m', 'start');
  git(project, 'remote', 'add', 'origin', origin);
  git(project, 'push', '-u', 'origin', 'master');
  return { origin, project };
}

const TASK = [
  'This is a scratch git project with an origin. Run each shell command on its own, exactly as written:',
  '1. Create notes.txt containing the word hello, then `git add notes.txt` and `git commit -m "add notes"`.',
  '2. `git push origin master`',
  '3. `git commit --amend -m "rewritten"`',
  '4. `git push --force origin master`',
  'Then reply with one line per push: pushed, or refused and the reason you were given.',
].join('\n');

describe('an agent pushes to its own origin', () => {
  it('pushes a commit with no prompt; a force push to master is refused', { timeout: 300_000 }, async (ctx) => {
    const rt = loadRuntimeConfig();
    const reason =
      process.env.AI_STUDIO_PUSH_CHECK !== '1'
        ? 'opt-in check: run `npm run check:push`'
        : !rt.claudeBin
          ? (rt.binError ?? 'no Claude Code CLI')
          : null;
    if (reason) {
      console.info(`[push.live] skipped: ${reason}`);
      return ctx.skip(reason);
    }
    const root = mkdtempSync(join(tmpdir(), 'push-check-'));
    const logDir = join(root, 'logs');
    try {
      const { origin, project } = scratchProject(root);
      const shell = AGENT_SHELL.dev;
      const runner = claudeCliRunner({
        bin: rt.claudeBin as string,
        askServer: join(import.meta.dirname, '../../src/mcp/ask-server.ts'),
        logDir,
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', ...shellAllowed(shell)],
        shellHook: shellHookCommand(join(import.meta.dirname, '../../src/runtime/shell-hook.ts'), shell),
      });
      const outcome = await runner.start(
        {
          runId: crypto.randomUUID(),
          cwd: project,
          systemPrompt: 'You are a test agent in a scratch project. Do exactly what the task says, nothing more.',
          task: TASK,
          model: rt.model,
          caps: { maxTurns: 20, maxBudgetUsd: 2 },
          env: runEnv(process.env, {}, { ...agentGitEnv(null), AI_STUDIO_PROJECT_DIR: project }),
          secretValues: [],
        },
        { emit: () => {}, ask: async () => 'no' },
      ).done;
      const log = readdirSync(logDir)
        .map((f) => readFileSync(join(logDir, f), 'utf8'))
        .join('\n');
      console.info(`[push.live] ${outcome.status}: ${outcome.result ?? outcome.error ?? ''}`);
      expect(outcome.status).toBe('succeeded');
      expect(git(origin, 'log', '-1', '--format=%s', 'master')).toBe('add notes'); // pushed, and not rewritten
      expect(log).toMatch(/Force pushes and history rewrites are refused/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
