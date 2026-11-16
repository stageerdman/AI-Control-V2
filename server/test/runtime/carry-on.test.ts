/* A build that reaches its step limit carries on as the SAME run in a fresh session while it keeps committing
   (runtime/limits.ts); it stops only when its fresh sessions bring nothing new. Real git: HEAD is the progress mark. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { MAX_STALLS, turnCapError } from '../../src/runtime/limits.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const CAP: FakeStep = { fail: turnCapError(120) };

describe('carry on after a limit', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  /** A git project; `script` gets the session number and a `commit()` that lands a new commit. */
  const app = (script: (n: number, commit: () => void) => FakeStep[]) => {
    const specs: RunSpec[] = [];
    h = testApp({
      seed: true,
      runner: fakeRunner((s) => {
        specs.push(s);
        return script(specs.length, () => commit(specs.length));
      }),
    });
    const dir = join(h.config.sandbox, 'aurora');
    mkdirSync(dir);
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: dir,
        stdio: 'ignore',
      });
    const commit = (n: number) => {
      writeFileSync(join(dir, `f${n}.txt`), String(n));
      git('add', '.');
      git('commit', '-m', `session ${n}`);
    };
    git('init', '-q');
    commit(0);
    h.store.projects.update('aurora', { folder: 'aurora' });
    return specs;
  };
  const build = () =>
    h.runtime.start('aurora', { agentId: 'a-pete', task: 'Build checkout.', kind: 'building' });

  it('carries on in fresh sessions while it commits, and ends as one succeeded run with the turns summed', async () => {
    const specs = app((n, commit) => {
      if (n < 3) commit();
      return n < 3
        ? [{ tokens: { input: 10, output: 1 } }, CAP]
        : [{ tokens: { input: 10, output: 1 } }, { result: 'Done.' }];
    });
    const run = await h.runtime.settled(build().id);
    expect(run).toMatchObject({ status: 'succeeded', result: 'Done.', turns: 3 });
    expect(specs.map((s) => s.runId)).toEqual([run.id, run.id, run.id]);
    expect(specs[2]?.task).toContain('You reached the step limit of a session (120 steps)');
    expect(specs[2]?.task).toContain('Build checkout.');
  });

  it(`stops as stuck after ${MAX_STALLS} sessions without a new commit`, async () => {
    const specs = app(() => [CAP]);
    const run = await h.runtime.settled(build().id);
    expect(specs).toHaveLength(MAX_STALLS);
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(
      /^Stopped: no new work \(a commit, a report or a desk note\) in its last 2 sessions/,
    );
  });

  /* live check 2026-11-16: report items run as `research` and used to just fail at the cap */
  it('a report run carries on too, with a brief that asks for findings, not commits', async () => {
    const specs = app((n) => (n < 2 ? [CAP] : [{ result: 'Filed.' }]));
    const r = h.runtime.start('aurora', { agentId: 'a-pete', task: 'Audit the docs.', kind: 'research' });
    const run = await h.runtime.settled(r.id);
    expect(run).toMatchObject({ status: 'succeeded', result: 'Filed.' });
    expect(specs).toHaveLength(2);
    expect(specs[1]?.task).toContain('Audit the docs.');
    expect(specs[1]?.task).not.toContain('commit what is done');
  });

  /* live check 2026-11-16: a read-only run that was really moving was stopped as stuck (progress was only commits) */
  it('a session with no commit but a desk note counts as new work, not a stall', async () => {
    const specs = app((n) =>
      n === 1
        ? [CAP]
        : n === 2
          ? [
              { tool: 'forget', args: { where: '6 of 30 files read', doing: 'reading', next: 'file 7' } },
              { wait: 500 },
            ]
          : n === 3
            ? [CAP]
            : [{ result: 'Read all 30.' }],
    );
    const r = h.runtime.start('aurora', { agentId: 'a-pete', task: 'Read every file.', kind: 'research' });
    const run = await h.runtime.settled(r.id);
    expect(run).toMatchObject({ status: 'succeeded', result: 'Read all 30.' });
    expect(specs).toHaveLength(4);
  });

  it('a session with no commit but a filed report counts as new work', async () => {
    const REPORT = {
      title: 'Docs',
      summary: 'Half done.',
      body: 'So far.',
      kind: 'research',
      question: 'Docs?',
    };
    const specs = app((n) => (n === 2 ? [{ report: REPORT }, CAP] : n < 4 ? [CAP] : [{ result: 'Done.' }]));
    const r = h.runtime.start('aurora', { agentId: 'a-pete', task: 'Audit the docs.', kind: 'research' });
    const run = await h.runtime.settled(r.id);
    expect(run).toMatchObject({ status: 'succeeded', result: 'Done.' });
    expect(specs).toHaveLength(4);
  });

  it('a run that is not a build is never carried on', async () => {
    const specs = app(() => [CAP]);
    const r = h.runtime.start('aurora', { agentId: 'a-pete', task: 'Review.', kind: 'reviewing' });
    const run = await h.runtime.settled(r.id);
    expect(specs).toHaveLength(1);
    expect(run.error).toBe(turnCapError(120));
  });
});
