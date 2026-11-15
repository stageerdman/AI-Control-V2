import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeCliRunner } from '../../src/runtime/claude-cli.ts';
import type { RunEvent, RunSpec } from '../../src/runtime/runner.ts';
import { tempDir } from '../helpers.ts';

/* A stand-in `claude`: records argv/env/cwd/stdin, then plays a mode. */
const FAKE = `#!${process.execPath}
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const out = process.env.FAKE_OUT;
let stdin = '';
process.stdin.on('data', (d) => { stdin += d; if (stdin.includes('\\n')) go(); });
let started = false;
function go() {
  if (started) return; started = true;
  fs.writeFileSync(out, JSON.stringify({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), stdin }));
  const mode = process.env.FAKE_MODE;
  if (mode === 'replay') {
    process.stdout.write(fs.readFileSync(process.env.FAKE_FIXTURE, 'utf8'));
    process.stdin.on('end', () => process.exit(0));
  } else if (mode === 'hang') {
    const kid = spawn('/bin/sleep', ['1000'], { stdio: 'ignore' });
    fs.writeFileSync(out + '.pids', JSON.stringify([process.pid, kid.pid]));
    setInterval(() => {}, 1000);
  } else if (mode === 'linger') {
    // answers, then keeps waiting on a background command it started (the CLI's real behaviour)
    process.stdout.write(fs.readFileSync(process.env.FAKE_FIXTURE, 'utf8'));
    const kid = spawn('/bin/sleep', ['1000'], { stdio: 'ignore' });
    fs.writeFileSync(out + '.pids', JSON.stringify([process.pid, kid.pid]));
    setInterval(() => {}, 1000);
  } else if (mode === 'orphan') {
    // starts a server, answers and exits without stopping it
    const kid = spawn('/bin/sleep', ['1000'], { stdio: 'ignore' });
    kid.unref();
    fs.writeFileSync(out + '.pids', JSON.stringify([process.pid, kid.pid]));
    process.stdout.write(fs.readFileSync(process.env.FAKE_FIXTURE, 'utf8'));
    process.stdin.on('end', () => process.exit(0));
  } else if (mode === 'chatty') {
    let i = 0;
    setInterval(() => process.stdout.write(JSON.stringify({ type: 'assistant', message: { id: 'm' + (i++), content: [{ type: 'text', text: 'hi' }] } }) + '\\n'), 5);
  } else if (mode === 'crash') {
    process.stderr.write('kaboom: not logged in');
    process.exit(3);
  }
}
`;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('ClaudeCliRunner', () => {
  let t: ReturnType<typeof tempDir>;
  let bin: string;
  let out: string;
  let cwd: string;
  beforeEach(() => {
    t = tempDir();
    bin = join(t.dir, 'claude');
    writeFileSync(bin, FAKE);
    chmodSync(bin, 0o755);
    out = join(t.dir, 'out.json');
    cwd = join(t.dir, 'sandbox', 'hello');
    mkdirSync(cwd, { recursive: true });
  });
  afterEach(() => t.cleanup());

  const spec = (mode: string, extra: Partial<RunSpec> = {}): RunSpec => ({
    runId: '22222222-2222-4222-8222-222222222222',
    cwd,
    systemPrompt: '# Pixel Pete\nBe nice.',
    task: 'Create hello.txt',
    model: 'claude-opus-5-5',
    caps: { maxTurns: 5, maxBudgetUsd: 0.25 },
    env: {
      HOME: '/Users/x',
      PATH: '/usr/bin:/bin',
      STRIPE_KEY: 'sk_test_granted',
      FAKE_OUT: out,
      FAKE_MODE: mode,
      FAKE_FIXTURE: join(import.meta.dirname, '../fixtures/stream-basic.jsonl'),
    },
    secretValues: ['SECRETVALUE123'],
    askBridge: { url: 'http://127.0.0.1:9/internal/runs/x/asks', token: 'tok' },
    ...extra,
  });
  const run = (s: RunSpec, logDir?: string) => {
    const events: RunEvent[] = [];
    const h = claudeCliRunner({
      bin,
      afterResultMs: 200,
      askServer: '/srv/ask-server.ts',
      node: '/usr/local/bin/node',
      ...(logDir ? { logDir } : {}),
    }).start(s, {
      emit: (e) => events.push(e),
      ask: async () => 'n/a',
    });
    return { h, events };
  };
  const recorded = () =>
    JSON.parse(readFileSync(out, 'utf8')) as {
      argv: string[];
      env: Record<string, string>;
      cwd: string;
      stdin: string;
    };

  it('passes model, prompt, caps, isolation flags and our MCP server; streams the task in on stdin', async () => {
    const logDir = join(t.dir, 'logs');
    const { h, events } = run(spec('replay'), logDir);
    const o = await h.done;
    const { argv, env, cwd: ranIn, stdin } = recorded();
    const flag = (f: string) => argv[argv.indexOf(f) + 1];
    expect(argv.slice(0, 6)).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      '--verbose',
    ]);
    expect(flag('--model')).toBe('claude-opus-5-5');
    expect(flag('--append-system-prompt')).toBe('# Pixel Pete\nBe nice.');
    expect(flag('--max-budget-usd')).toBe('0.25');
    expect(flag('--permission-mode')).toBe('dontAsk');
    expect(flag('--permission-prompts')).toBe('none');
    expect(flag('--tools')).toBe('Read,Edit,Write,Glob,Grep,Bash');
    expect(flag('--allowed-tools')).toContain('mcp__studio__ask_user');
    expect(flag('--session-id')).toBe('22222222-2222-4222-8222-222222222222');
    for (const f of ['--restricted', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome'])
      expect(argv).toContain(f);
    expect(argv).not.toContain('--add-dir');
    expect(argv).not.toContain('--plugin-dir');
    expect(argv).not.toContain('--dangerously-skip-permissions');
    expect(JSON.parse(flag('--mcp-config') as string)).toEqual({
      mcpServers: {
        studio: {
          type: 'stdio',
          command: '/usr/local/bin/node',
          args: ['/srv/ask-server.ts'],
          env: { AI_STUDIO_ASK_URL: 'http://127.0.0.1:9/internal/runs/x/asks', AI_STUDIO_RUN_TOKEN: 'tok' },
        },
      },
    });
    expect(ranIn).toBe(cwd);
    expect(JSON.parse(stdin)).toEqual({
      type: 'user',
      message: { role: 'user', content: 'Create hello.txt' },
    });
    // env is exactly what the spec says (+ the MCP timeout) — nothing from this test process
    expect(env.STRIPE_KEY).toBe('sk_test_granted');
    expect(env.MCP_TOOL_TIMEOUT).toBeDefined();
    expect(env.VITEST).toBeUndefined();
    expect(env.HOME).toBe('/Users/x');

    expect(o).toMatchObject({ status: 'succeeded', turns: 3, costUsd: 0.0421 });
    expect(events.some((e) => e.kind === 'tokens')).toBe(true);
    const log = readFileSync(join(logDir, '22222222-2222-4222-8222-222222222222.jsonl'), 'utf8');
    expect(log).toContain('"type":"result"');
    expect(log).not.toContain('SECRETVALUE123');
  });

  it('ends the CLI after the real result line (whose keys are not type-first) by closing stdin', async () => {
    const live = join(import.meta.dirname, '../fixtures/live-hello-commit.jsonl');
    const o = await run(spec('replay', { env: { ...spec('replay').env, FAKE_FIXTURE: live } })).h.done;
    expect(o).toMatchObject({
      status: 'succeeded',
      turns: 3,
      costUsd: 0.1389382,
      usage: { input: 6, output: 296, cacheRead: 35586, cacheWrite: 656 },
    });
  });

  it('a CLI that lingers after its answer (a background command left running) is stopped; the answer stands', async () => {
    const { h } = run(spec('linger'));
    const o = await h.done;
    expect(o.status).toBe('succeeded');
    expect(o.result).toBeTruthy();
    const pids = JSON.parse(readFileSync(`${out}.pids`, 'utf8')) as number[];
    await new Promise((r) => setTimeout(r, 100));
    for (const pid of pids) expect(alive(pid)).toBe(false);
  });

  it('a command the CLI left running when it exited is swept (never an invisible leftover); the handle has a pid', async () => {
    const { h } = run(spec('orphan'));
    expect(h.pid).toBeGreaterThan(0);
    expect((await h.done).status).toBe('succeeded');
    const [, kid] = JSON.parse(readFileSync(`${out}.pids`, 'utf8')) as number[];
    const until = Date.now() + 2000;
    while (alive(kid as number) && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
    expect(alive(kid as number)).toBe(false);
  });

  it('resumes a session with --resume instead of a new --session-id', async () => {
    await run(spec('replay', { resumeSessionId: 'abc-session' })).h.done;
    const { argv } = recorded();
    expect(argv[argv.indexOf('--resume') + 1]).toBe('abc-session');
    expect(argv).not.toContain('--session-id');
  });

  it('cancel kills the whole process group (the CLI and what it spawned)', async () => {
    const { h } = run(spec('hang'));
    const pidsFile = `${out}.pids`;
    const until = Date.now() + 3000;
    while (!existsSync(pidsFile) && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
    const [cli, kid] = JSON.parse(readFileSync(pidsFile, 'utf8')) as number[];
    expect(alive(cli as number) && alive(kid as number)).toBe(true);
    h.cancel();
    const o = await h.done;
    expect(o.status).toBe('cancelled');
    await new Promise((r) => setTimeout(r, 100));
    expect(alive(cli as number)).toBe(false);
    expect(alive(kid as number)).toBe(false);
  });

  it('stops a run that goes past its turn cap', async () => {
    const o = await run(spec('chatty', { caps: { maxTurns: 3, maxBudgetUsd: 1 } })).h.done;
    expect(o).toMatchObject({ status: 'failed', error: 'Stopped: reached the turn cap (3)' });
  });

  it('a crash becomes a failed outcome with the (redacted) stderr', async () => {
    const o = await run(spec('crash')).h.done;
    expect(o.status).toBe('failed');
    expect(o.error).toMatch(/code 3.*kaboom: not logged in/);
  });

  it('a missing binary fails the run instead of throwing', async () => {
    bin = join(t.dir, 'nope');
    const o = await run(spec('replay')).h.done;
    expect(o).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/Could not start Claude Code/),
    });
  });
});
