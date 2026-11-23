/* The project's tests before a task lands (Always Merged): its `.project` `test:` command, run in the task's checkout
   with main merged in. Bounded: a timeout counts as a fail, and only the output's tail is kept for the builder. */
import { spawn } from 'node:child_process';
import type { TestStep } from '../git/land.ts';
import { testCommandOf } from './run-command.ts';

export const TEST_TIMEOUT_MS = 10 * 60 * 1000;
export const TAIL_LINES = 60;

export type TestOutcome = { ok: boolean; timedOut: boolean; tail: string };

/** Run `command` in `cwd` through the shell. Never rejects: a command that can't start is a fail. */
export function runTests(
  cwd: string,
  command: string,
  opts: { port?: number; timeoutMs?: number } = {},
): Promise<TestOutcome> {
  return new Promise((resolve) => {
    const out: string[] = [];
    /* CI=1: watch-mode test runners finish instead of waiting for keys */
    const env = { ...process.env, CI: '1', ...(opts.port ? { PORT: String(opts.port) } : {}) };
    const child = spawn('/bin/sh', ['-c', command], { cwd, env, detached: true });
    const keep = (b: Buffer) => out.push(b.toString('utf8'));
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, opts.timeoutMs ?? TEST_TIMEOUT_MS);
    const finish = (ok: boolean, extra = '') => {
      clearTimeout(timer);
      resolve({ ok: ok && !timedOut, timedOut, tail: tail(out.join('') + extra) });
    };
    child.once('error', (e) => finish(false, `\n${e.message}`));
    child.once('close', (code) => finish(code === 0));
  });
}

const killGroup = (pid: number | undefined) => {
  try {
    if (pid) process.kill(-pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
};
const tail = (text: string) => text.trimEnd().split('\n').slice(-TAIL_LINES).join('\n');

/** The landing's test step for a checkout: its own `test:` line (the branch's `.project`), on `port`. */
export function testStep(port: () => { port: number; release: () => void }, timeoutMs?: number): TestStep {
  return async (cwd) => {
    const command = testCommandOf(cwd);
    if (!command) return null;
    const held = port();
    try {
      const r = await runTests(cwd, command, { port: held.port, ...(timeoutMs ? { timeoutMs } : {}) });
      if (r.ok) return { ok: true };
      const why = r.timedOut
        ? `timed out after ${Math.round((timeoutMs ?? TEST_TIMEOUT_MS) / 60000)} min`
        : 'fails';
      return { ok: false, reason: `main plus this work: \`${command}\` ${why}:\n${r.tail || '(no output)'}` };
    } finally {
      held.release();
    }
  };
}
