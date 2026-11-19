import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { composePrompt } from '../../src/runtime/compose.ts';
import { resolveClaudeBin } from '../../src/runtime/config.ts';
import { runEnv } from '../../src/runtime/env.ts';
import { activityFor, createStreamParser } from '../../src/runtime/stream.ts';
import { tempDir } from '../helpers.ts';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../fixtures', name), 'utf8')
    .split('\n')
    .filter(Boolean);

describe('composePrompt', () => {
  const agent = { name: 'Pixel Pete', role: 'Frontend', prompt: 'You are a frontend engineer.' };
  it('orders brain ▸ team does ▸ team codes ▸ job ▸ project rules, and never inlines CLAUDE.md', () => {
    const p = composePrompt({
      agent,
      team: {
        name: 'The Ship-It Squad',
        instr: 'Ship behind a flag.',
        code: 'Feature-first folders.',
        job: 'Own the storefront UI.',
        isCaptain: false,
      },
      project: { name: 'Hello Studio' },
    });
    const order = [
      'You are Pixel Pete (Frontend)',
      'You are a frontend engineer.',
      '## Your team: The Ship-It Squad',
      '## What the team does\n\nShip behind a flag.',
      '## How the team codes\n\nFeature-first folders.',
      '## Your job on this team\n\nOwn the storefront UI.',
      '## Project rules',
      'CLAUDE.md',
    ];
    const at = order.map((s) => p.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(p).toContain('ask_user');
    expect(p).toContain('You are pre-approved for anything your tools allow in this project.');
    expect(p).toContain('Never ask the user for permission or confirmation');
    expect(p).toContain('Feature requests go in Features, never in issues.txt');
    expect(p).not.toContain('captain');
  });

  it('marks captains and drops team sections for a solo specialist; empty sections vanish', () => {
    const cap = composePrompt({
      agent,
      team: { name: 'T', instr: '', code: '', job: '', isCaptain: true },
      project: { name: 'P' },
    });
    expect(cap).toContain('You are the captain of this team.');
    expect(cap).not.toContain('What the team does');
    const solo = composePrompt({ agent, team: null, project: { name: 'P' } });
    expect(solo).not.toContain('Your team');
  });

  it('tells a copy who its kin are and to read their names in the shared instructions as itself', () => {
    const copy = { ...agent, name: 'Pixel Bea', prompt: 'You are Pixel Pete, a frontend engineer.' };
    const p = composePrompt({ agent: copy, kin: ['Pixel Pete', 'Pixel Sol'], project: { name: 'P' } });
    expect(p).toContain(
      'You share these instructions with your kin Pixel Pete and Pixel Sol (other copies of the same agent). Wherever they name one of your kin, read it as you, Pixel Bea.',
    );
    expect(p.indexOf('You share these instructions')).toBeLessThan(
      p.indexOf('You are Pixel Pete, a frontend'),
    );
    expect(composePrompt({ agent, kin: [], project: { name: 'P' } })).not.toContain('your kin');
  });
});

describe('stream-json parser', () => {
  it('turns a recorded stream into session, activity, tokens and a final outcome', () => {
    const parser = createStreamParser(['SECRETVALUE123']);
    const events = fixture('stream-basic.jsonl').flatMap((l) => parser.feed(l));
    expect(events[0]).toEqual({ kind: 'session', sessionId: '11111111-1111-4111-8111-111111111111' });
    expect(
      events
        .filter((e) => e.kind === 'activity')
        .map((e) => (e as { activity: { kind: string } }).activity.kind),
    ).toEqual(['thinking', 'editing', 'running']);
    // one tokens event per assistant message (repeated blocks of msg_1 don't double count)
    expect(events.filter((e) => e.kind === 'tokens')).toEqual([
      { kind: 'tokens', input: 7010, output: 30 },
      { kind: 'tokens', input: 7004, output: 20 },
      { kind: 'tokens', input: 7102, output: 12 },
    ]);
    expect(parser.turns()).toBe(3);
    expect(JSON.stringify(events)).not.toContain('SECRETVALUE123');
    expect(parser.outcome()).toEqual({
      status: 'succeeded',
      turns: 3,
      result: 'Created and committed hello.txt.',
      sessionId: '11111111-1111-4111-8111-111111111111',
      costUsd: 0.0421,
      usage: { input: 16, output: 62, cacheRead: 19100, cacheWrite: 2000 },
    });
  });

  it('reports an error result, or a missing one, as failed', () => {
    const p = createStreamParser();
    p.feed(
      JSON.stringify({
        type: 'result',
        subtype: 'error_max_budget_usd',
        is_error: true,
        num_turns: 2,
        usage: {},
      }),
    );
    expect(p.outcome()).toMatchObject({ status: 'failed', error: 'error_max_budget_usd', turns: 2 });
    expect(createStreamParser().outcome('boom')).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('names activities in plain words', () => {
    expect(activityFor('Read', { file_path: '/p/src/app.ts' }).activity).toMatchObject({
      kind: 'reading',
      label: 'Reading app.ts',
    });
    expect(activityFor('Bash', { command: 'npm test -- --run' }).activity).toMatchObject({
      kind: 'running',
      label: 'Running npm test --',
    });
    expect(activityFor('mcp__studio__ask_user', { question: 'Which color?' })).toMatchObject({
      status: 'waiting',
      activity: { kind: 'asking' },
    });
    expect(activityFor('mcp__x__do_thing', {}).activity.label).toBe('Using do_thing');
  });
});

describe('runEnv', () => {
  it('starts from nothing: base vars + granted secrets; parent secrets and auth overrides never pass', () => {
    const parent = {
      HOME: '/Users/x',
      USER: 'x',
      PATH: '/evil/bin',
      SECRET_FROM_PARENT: 'leak',
      ANTHROPIC_API_KEY: 'sk-parent',
      CLAUDECODE: '1',
    };
    const env = runEnv(parent, { STRIPE_KEY: 'sk_test_1', ANTHROPIC_API_KEY: 'sk-granted' });
    expect(env.HOME).toBe('/Users/x');
    expect(env.STRIPE_KEY).toBe('sk_test_1');
    expect(env.PATH).not.toContain('/evil/bin');
    expect(env.PATH).toContain('/usr/bin');
    for (const k of ['SECRET_FROM_PARENT', 'ANTHROPIC_API_KEY', 'CLAUDECODE']) expect(env[k]).toBeUndefined();
  });
});

describe('resolveClaudeBin', () => {
  const t = tempDir();
  afterAll(() => t.cleanup());
  const exe = (p: string) => {
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, '#!/bin/sh\n');
    chmodSync(p, 0o755);
    return p;
  };

  it('uses a configured absolute executable, resolving symlinks', () => {
    const real = exe(join(t.dir, 'lib', 'claude.exe'));
    symlinkSync(real, join(t.dir, 'claude'));
    expect(resolveClaudeBin(join(t.dir, 'claude'))).toBe(real);
  });

  it('refuses relative names (shell lookup/aliases) and non-executables', () => {
    expect(() => resolveClaudeBin('claude')).toThrow(/absolute/);
    writeFileSync(join(t.dir, 'plain'), '');
    expect(() => resolveClaudeBin(join(t.dir, 'plain'))).toThrow(/not an executable/);
  });

  it('falls back to the first executable candidate, or explains where it looked', () => {
    const b = exe(join(t.dir, 'b', 'claude'));
    expect(resolveClaudeBin(undefined, [join(t.dir, 'a', 'claude'), b])).toBe(b);
    expect(() => resolveClaudeBin(undefined, [join(t.dir, 'nope')])).toThrow(/not found/);
  });
});

describe('recorded live stream (B5 live run, interrupted while waiting on ask_user)', () => {
  it('parses the real CLI output: session, activities incl. the denied compound command, asking, no result', () => {
    const lines = fixture('live-hello-interrupted.jsonl');
    const init = JSON.parse(lines[0] as string);
    // isolation evidence from the real init line
    expect(init).toMatchObject({
      apiKeySource: 'none',
      permissionMode: 'dontAsk',
      skills: [],
      slash_commands: [],
      mcp_servers: [{ name: 'studio', status: 'connected' }],
    });
    expect(init.plugins.every((p: { path: string }) => p.path === 'builtin')).toBe(true);
    const parser = createStreamParser();
    const events = lines.flatMap((l) => parser.feed(l));
    const acts = events
      .filter((e) => e.kind === 'activity')
      .map((e) => (e as { activity: { kind: string } }).activity.kind);
    expect(acts.filter((k) => k !== 'thinking')).toEqual(['running', 'running', 'editing', 'asking']);
    expect(parser.turns()).toBe(4);
    expect(parser.outcome('interrupted')).toMatchObject({
      status: 'failed',
      error: 'interrupted',
      sessionId: '47ac8df8-c075-4577-bc37-8fd175b357b9',
    });
  });
});
