import { describe, expect, it } from 'vitest';
import {
  buildPath,
  commitVerdict,
  freshBundle,
  installPath,
  namesProduct,
  needsDeps,
  parseLsDump,
  targetDirs,
  trashName,
  uniqueCopies,
} from './plan.mjs';

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

  it('names copies of the product, whatever the version suffix or spacing, and nothing else', () => {
    for (const n of ['AI Studio.app', 'AI Studio 2.app', 'ai-studio.app', 'AI Studio_0.1.0_aarch64.dmg'])
      expect(namesProduct(n, 'AI Studio')).toBe(true);
    for (const n of ['AI Studio notes.txt', 'Visual Studio Code.app', 'Studio AI.app'])
      expect(namesProduct(n, 'AI Studio')).toBe(false);
  });

  it('reads the registered paths for the bundle id out of an lsregister dump', () => {
    const dump = [
      'path:                       /Applications/AI Studio.app (0x7610)\nidentifier:                 xyz.erdman.aistudio',
      'path:                       /Applications/Other.app (0x11)\nidentifier:                 xyz.erdman.aistudio.helper',
      'path:                       /Users/u/old/AI Studio.app (0x2a)\nname: AI Studio\nidentifier:   xyz.erdman.aistudio',
    ].join('\n--------------------------------------------------------------------------------\n');
    expect(parseLsDump(dump, 'xyz.erdman.aistudio')).toEqual(['/Applications/AI Studio.app', '/Users/u/old/AI Studio.app']);
  });

  it('sorts found paths into apps, disk images, mounted volumes and ghosts, once each', () => {
    const present = new Set(['/Applications/AI Studio.app', '/u/Downloads/AI Studio.dmg']);
    const ctx = { exists: (p) => present.has(p), trash: '/u/.Trash' };
    const found = [
      '/Applications/AI Studio.app',
      '/Applications/AI Studio.app/',
      '/Applications/AI Studio.app/Contents/Resources/AI Studio.app',
      '/u/Downloads/AI Studio.dmg',
      '/u/Downloads/gone.dmg',
      '/Volumes/AI Studio/AI Studio.app',
      '/Volumes/AI Studio',
      '/u/old/AI Studio.app',
      '/u/.Trash/AI Studio.app',
      '/u/notes.txt',
    ];
    expect(uniqueCopies(found, ctx)).toEqual([
      { kind: 'app', path: '/Applications/AI Studio.app' },
      { kind: 'dmg', path: '/u/Downloads/AI Studio.dmg' },
      { kind: 'volume', path: '/Volumes/AI Studio' },
      { kind: 'ghost', path: '/u/old/AI Studio.app' },
    ]);
  });

  it('never clobbers something already in the Trash', () => {
    expect(trashName('/A/AI Studio.app', () => false, '1.2.3')).toBe('AI Studio.app');
    expect(trashName('/A/AI Studio.app', () => true, '1.2.3')).toBe('AI Studio 1.2.3.app');
  });

  it('calls MATCH only for the same commit', () => {
    expect(commitVerdict('abc', 'abc')).toBe('MATCH');
    expect(commitVerdict('abc', 'def')).toBe('MISMATCH');
    expect(commitVerdict('', '')).toBe('MISMATCH');
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
