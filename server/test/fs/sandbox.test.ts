import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveInSandbox, SandboxError } from '../../src/fs/sandbox.ts';
import { tempDir } from '../helpers.ts';

describe('resolveInSandbox', () => {
  const t = tempDir();
  const root = join(t.dir, 'sandbox');
  const outside = join(t.dir, 'outside');

  beforeAll(() => {
    mkdirSync(join(root, 'proj', 'src'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'x');
    symlinkSync(outside, join(root, 'escape')); // dir symlink pointing out
    symlinkSync(join(outside, 'secret.txt'), join(root, 'proj', 'leak.txt')); // file symlink out
    symlinkSync(join(root, 'proj', 'src'), join(root, 'alias')); // symlink that stays inside
  });
  afterAll(() => t.cleanup());

  it('resolves existing and not-yet-existing paths inside the root', () => {
    expect(resolveInSandbox(root, 'proj/src')).toBe(join(root, 'proj', 'src'));
    expect(resolveInSandbox(root, 'proj/new/deep/file.md')).toBe(
      join(root, 'proj', 'new', 'deep', 'file.md'),
    );
    expect(resolveInSandbox(root, '.')).toBe(root);
  });

  it('accepts an absolute path that is inside the root', () => {
    expect(resolveInSandbox(root, join(root, 'proj'))).toBe(join(root, 'proj'));
  });

  it('follows symlinks that stay inside', () => {
    expect(resolveInSandbox(root, 'alias/x.ts')).toBe(join(root, 'proj', 'src', 'x.ts'));
  });

  it.each([
    ['..', /'\.\.'/],
    ['../outside', /'\.\.'/],
    ['proj/../../outside', /'\.\.'/],
    ['proj/..', /'\.\.'/],
    ['proj\\..\\..\\x', /'\.\.'/],
  ])('rejects dot-dot segments: %s', (p, msg) => {
    expect(() => resolveInSandbox(root, p)).toThrow(msg);
  });

  it('rejects absolute paths outside the root, including prefix look-alikes', () => {
    expect(() => resolveInSandbox(root, '/etc/passwd')).toThrow(/outside the sandbox/);
    expect(() => resolveInSandbox(root, outside)).toThrow(/outside the sandbox/);
    expect(() => resolveInSandbox(root, `${root}-evil/x`)).toThrow(/outside the sandbox/);
  });

  it('rejects symlink escapes, for existing targets and for paths beneath them', () => {
    expect(() => resolveInSandbox(root, 'escape')).toThrow(/symlink/);
    expect(() => resolveInSandbox(root, 'escape/secret.txt')).toThrow(/symlink/);
    expect(() => resolveInSandbox(root, 'escape/not/yet/here')).toThrow(/symlink/);
    expect(() => resolveInSandbox(root, 'proj/leak.txt')).toThrow(/symlink/);
  });

  it('rejects empty and NUL paths', () => {
    expect(() => resolveInSandbox(root, '')).toThrow(SandboxError);
    expect(() => resolveInSandbox(root, 'a\0b')).toThrow(SandboxError);
  });
});
