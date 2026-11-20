/* Live check (opt-in: AI_STUDIO_MAC_CHECK=1, on a Mac with Swift): a sample SwiftUI package
   (test/fixtures/mac-sample) builds and passes its tests from the agent shell — each command is the one the
   brief tells agents to run, approved by the real shell hook, then run in the package's folder. */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTPUT_FLAGS } from '../../src/runtime/mac-build.ts';
import { hookDecision } from './shell-hook-run.ts';

const live = process.env.AI_STUDIO_MAC_CHECK === '1' && process.platform === 'darwin';
const out = OUTPUT_FLAGS.swift.map(([flag, dir]) => `${flag} ${dir}`).join(' ');

describe.skipIf(!live)('a SwiftUI package from an agent shell', () => {
  it('builds and passes its tests, with its output inside the project', { timeout: 600_000 }, () => {
    const project = mkdtempSync(join(tmpdir(), 'mac-sample-'));
    cpSync(join(import.meta.dirname, '../fixtures/mac-sample'), project, { recursive: true });
    const run = (command: string) => {
      expect(hookDecision(project, command)).toBe('allow');
      return execFileSync('/bin/sh', ['-c', command], { cwd: project, encoding: 'utf8', stdio: 'pipe' });
    };
    run(`swift build ${out}`);
    expect(run(`swift test ${out}`)).toMatch(/Executed 3 tests, with 0 failures/);
    for (const [, dir] of OUTPUT_FLAGS.swift) expect(existsSync(join(project, dir))).toBe(true);
  });
});
