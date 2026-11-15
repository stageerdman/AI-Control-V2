import { describe, expect, it } from 'vitest';
import { freshBundle, installPath, needsDeps, staleCopies, targetDirs } from './plan.mjs';

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

  it('installs dependencies when missing or when the lockfile is newer', () => {
    expect(needsDeps(10, undefined)).toBe(true);
    expect(needsDeps(20, 10)).toBe(true);
    expect(needsDeps(10, 20)).toBe(false);
  });
});
