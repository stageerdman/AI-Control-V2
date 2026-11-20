import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedSince, snapshot } from './folder-snapshot.ts';

describe('folder snapshot', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'snap-'));
    mkdirSync(join(root, 'cache'));
    writeFileSync(join(root, 'cache/a.db'), 'x');
    symlinkSync(join(root, 'cache'), join(root, 'link'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('sees nothing when an identical symlink is re-created', () => {
    const before = snapshot([root]);
    rmSync(join(root, 'link'));
    symlinkSync(join(root, 'cache'), join(root, 'link'));
    expect(changedSince(before, snapshot([root]))).toEqual([]);
  });

  it('reports created, modified and removed entries — and a folder that appears', () => {
    const missing = join(root, 'later');
    const before = snapshot([root, missing]);
    writeFileSync(join(root, 'cache/b.db'), 'y');
    utimesSync(join(root, 'cache/a.db'), 1, 1);
    rmSync(join(root, 'link'));
    mkdirSync(missing);
    expect(changedSince(before, snapshot([root, missing]))).toEqual([
      `${root} (modified)`,
      `${join(root, 'cache')} (modified)`,
      `${join(root, 'cache/a.db')} (modified)`,
      `${join(root, 'cache/b.db')} (created)`,
      `${join(root, 'later')} (created)`,
      `${join(root, 'link')} (removed)`,
    ]);
  });
});
