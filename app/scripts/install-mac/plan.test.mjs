import { describe, expect, it } from 'vitest';
import { buildPath, freshBundle, installPath, needsDeps, staleCopies, targetDirs } from './plan.mjs';

describe('Mac installer plan', () => {
  it('installs into /Applications under the product name', () => {
    expect(installPath('AI Studio')).toBe('/Applications/AI Studio.app');
  });

  it('looks in CARGO_TARGET_DIR first, then the shared target, then the local one, without repeats', () => {
    const dirs = targetDirs({ env: { CARGO_TARGET_DIR: '/h/.cargo-shared-target' }, home: '/h', appDir: '/r/app' });
    expect(dirs).toEqual(['/h/.cargo-shared-target', '/r/app/src-tauri/target']);
    expect(targetDirs({ env: {}, home: '/h', appDir: '/r/app' })[0]).toBe('/h/.cargo-shared-target');
  });

  it('picks the newest bundle written by this build and ignores older ones', () => {
    const c = [
      { path: '/old.app', mtimeMs: 50 },
      { path: '/a.app', mtimeMs: 120 },
      { path: '/b.app', mtimeMs: 150 },
    ];
    expect(freshBundle(c, 100)).toBe('/b.app');
    expect(freshBundle(c, 200)).toBeNull();
  });

  it('marks every other copy stale: old builds, duplicates, repeats once, never the installed one', () => {
    const found = [
      '/Applications/AI Studio.app',
      '/Users/u/.cargo-shared-target/release/bundle/macos/AI Studio.app',
      '/Users/u/Applications/AI Studio.app',
      '/Users/u/Applications/AI Studio.app',
      '',
      '/Users/u/Downloads/notes.txt',
    ];
    expect(staleCopies(found, ['/Applications/AI Studio.app'])).toEqual([
      '/Users/u/.cargo-shared-target/release/bundle/macos/AI Studio.app',
      '/Users/u/Applications/AI Studio.app',
    ]);
  });

  it('builds with cargo and Homebrew on PATH even from a bare Spotlight PATH, without repeats', () => {
    const p = buildPath('/usr/bin:/bin:/usr/sbin:/sbin', '/Users/u').split(':');
    expect(p[0]).toBe('/Users/u/.cargo/bin');
    expect(p).toContain('/opt/homebrew/bin');
    expect(p.filter((d) => d === '/usr/bin')).toHaveLength(1);
    expect(buildPath(undefined, '/h')).toContain('/h/.cargo/bin');
  });

  it('installs dependencies when missing or when the lockfile is newer', () => {
    expect(needsDeps(10, undefined)).toBe(true);
    expect(needsDeps(20, 10)).toBe(true);
    expect(needsDeps(10, 20)).toBe(false);
  });
});
