/* Live check (`npm run check:mac`, on a Mac with Swift): a sample SwiftUI package (test/fixtures/mac-sample)
   builds and passes its tests from the agent shell — each command is the one the brief tells agents to run,
   approved by the real shell hook, then run in the package's folder — and every byte of build output lands
   in that folder: SwiftPM's and Xcode's default folders in ~/Library are left untouched.
   Without a Swift toolchain (or not opted in) it skips and says why; it never fails for that. */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTPUT_FLAGS } from '../../src/runtime/mac-build.ts';
import { changedSince, snapshot } from './folder-snapshot.ts';
import { hookDecision } from './shell-hook-run.ts';

/** Where SwiftPM and Xcode write when nobody points them elsewhere. */
const SYSTEM_FOLDERS = [
  'Library/Caches/org.swift.swiftpm',
  'Library/org.swift.swiftpm',
  '.swiftpm',
  'Library/Developer/Xcode/DerivedData',
].map((p) => join(homedir(), p));

const out = OUTPUT_FLAGS.swift.map(([flag, dir]) => `${flag} ${dir}`).join(' ');

function swiftVersion(): string | null {
  try {
    return execFileSync('swift', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function skipReason(): string | null {
  if (process.env.AI_STUDIO_MAC_CHECK !== '1') return 'opt-in check: run `npm run check:mac`';
  if (process.platform !== 'darwin') return `needs macOS (this is ${process.platform})`;
  if (!swiftVersion()) return 'no Swift toolchain on this machine (`swift --version` failed) — install Xcode';
  return null;
}

describe('a SwiftUI package from an agent shell', () => {
  it('builds and passes its tests, with all output inside the package', { timeout: 600_000 }, (ctx) => {
    const reason = skipReason();
    if (reason) {
      console.info(`[mac-build.live] skipped: ${reason}`);
      return ctx.skip(reason);
    }
    const project = mkdtempSync(join(tmpdir(), 'mac-sample-'));
    cpSync(join(import.meta.dirname, '../fixtures/mac-sample'), project, { recursive: true });
    const run = (command: string) => {
      expect(hookDecision(project, command), command).toBe('allow');
      return execFileSync('/bin/sh', ['-c', command], { cwd: project, encoding: 'utf8', stdio: 'pipe' });
    };
    try {
      const before = snapshot(SYSTEM_FOLDERS);
      run(`swift build ${out}`);
      expect(run(`swift test ${out}`)).toMatch(/Executed 3 tests, with 0 failures/);
      expect(changedSince(before, snapshot(SYSTEM_FOLDERS))).toEqual([]);
      for (const [, dir] of OUTPUT_FLAGS.swift) expect(existsSync(join(project, dir)), dir).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
