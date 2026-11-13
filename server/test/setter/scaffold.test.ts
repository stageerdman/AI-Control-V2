import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readModules } from '../../src/blueprint/modules.ts';
import { inspect, type ScaffoldInput, scaffold } from '../../src/setter/scaffold.ts';
import { tempDir, writeModules } from '../helpers.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('Project Setter scaffold', () => {
  let t: ReturnType<typeof tempDir>;
  let sandbox: string;
  let control: string;
  let base: Omit<ScaffoldInput, 'folder' | 'mode'>;
  beforeEach(() => {
    t = tempDir();
    sandbox = join(t.dir, 'sandbox');
    control = join(t.dir, 'control');
    mkdirSync(sandbox);
    writeModules(control);
    base = {
      sandbox,
      name: 'Hello Studio',
      about: 'A tiny test app.',
      modules: readModules(control),
      controlHome: control,
      date: '2026-11-13',
    };
  });
  afterEach(() => t.cleanup());

  it('creates the full scaffold in a new folder and makes the first commit', async () => {
    const r = await scaffold({ ...base, folder: 'hello-studio', mode: 'new' });
    const dir = join(sandbox, 'hello-studio');
    expect(r.steps.map((s) => [s.step, s.status])).toEqual([
      ['folder', 'done'],
      ['.project', 'done'],
      ['CLAUDE.md', 'done'],
      ['.gitignore', 'done'],
      ['.env', 'done'],
      ['updates/', 'done'],
      ['issues.txt', 'done'],
      ['git', 'done'],
      ['commit', 'done'],
    ]);
    expect(readFileSync(join(dir, '.project'), 'utf8')).toBe(
      'name: Hello Studio\ncreated: 2026-11-13\nmodules:\n  - STRUCTURE\n  - CODING\nsecrets: []\nclaude_md_generated: 2026-11-13\n',
    );
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toMatch(/^# Hello Studio\n\nA tiny test app\./);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('');
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(dir, 'updates'))).toEqual(['2026-11-13 INIT - OPEN']);
    expect(readFileSync(join(dir, 'updates/2026-11-13 INIT - OPEN/update v1.md'), 'utf8')).toMatch(
      /## Goal\n\nA tiny test app\./,
    );
    expect(readFileSync(join(dir, 'issues.txt'), 'utf8')).toMatch(/^Hello Studio — known issues & TODOs/);

    // git: one commit on main with everything but .env; nothing left dirty; no remote
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(r.commit);
    expect(git(dir, 'branch', '--show-current')).toBe('main');
    expect(git(dir, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n').sort()).toEqual(
      [
        '.gitignore',
        '.project',
        'CLAUDE.md',
        'issues.txt',
        'updates/2026-11-13 INIT - OPEN/update v1.md',
        'updates/2026-11-13 INIT - OPEN/wiki.md',
      ].sort(),
    );
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'remote')).toBe('');
    expect(git(dir, 'log', '-1', '--format=%an %s')).toBe('AI Studio AI Studio: set up Hello Studio'); // fallback identity (no git config in tests)
  });

  it('reports progress as running → final for each step', async () => {
    const seen: string[] = [];
    await scaffold({ ...base, folder: 'p', mode: 'new', onStep: (s) => seen.push(`${s.step}:${s.status}`) });
    expect(seen.slice(0, 4)).toEqual(['folder:running', 'folder:done', '.project:running', '.project:done']);
    expect(seen.at(-1)).toBe('commit:done');
  });

  it('adopts an existing repo: keeps what exists, adds what’s missing, commits only its additions', async () => {
    const dir = join(sandbox, 'old-blog');
    mkdirSync(dir);
    git(dir, 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'README.md'), '# Old blog\n');
    writeFileSync(join(dir, 'CLAUDE.md'), 'my own rules\n');
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    git(dir, 'add', '.');
    git(dir, '-c', 'user.name=U', '-c', 'user.email=u@x', 'commit', '-q', '-m', 'mine');
    writeFileSync(join(dir, 'wip.txt'), 'uncommitted work\n'); // the user's — must stay uncommitted
    git(dir, 'add', 'wip.txt');

    const r = await scaffold({ ...base, name: 'Old Blog', folder: 'old-blog', mode: 'adopt' });
    const st = Object.fromEntries(r.steps.map((s) => [s.step, s.status]));
    expect(st).toMatchObject({
      folder: 'kept',
      '.project': 'done',
      'CLAUDE.md': 'kept',
      '.gitignore': 'done',
      '.env': 'done',
      'updates/': 'done',
      git: 'kept',
      commit: 'done',
    });
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('my own rules\n');
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toMatch(
      /^node_modules\/\n\n# AI Studio[^\n]*\n\.env\n/,
    );
    expect(git(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual(
      [
        '.gitignore',
        '.project',
        'issues.txt',
        'updates/2026-11-13 INIT - OPEN/update v1.md',
        'updates/2026-11-13 INIT - OPEN/wiki.md',
      ].sort(),
    );
    expect(git(dir, 'rev-list', '--count', 'HEAD')).toBe('2');
    expect(git(dir, 'status', '--porcelain')).toBe('A  wip.txt'); // still staged, not committed by us
  });

  it('adopt is idempotent: a second run changes nothing and commits nothing', async () => {
    await scaffold({ ...base, folder: 'p', mode: 'new' });
    const dir = join(sandbox, 'p');
    const snapshot = () =>
      ['.project', 'CLAUDE.md', '.gitignore', '.env', 'issues.txt'].map((f) =>
        readFileSync(join(dir, f), 'utf8'),
      );
    const before = { files: snapshot(), head: git(dir, 'rev-parse', 'HEAD') };
    const again = await scaffold({ ...base, folder: 'p', mode: 'adopt' });
    expect(again.added).toEqual([]);
    expect(again.commit).toBeNull();
    expect(new Set(again.steps.map((s) => s.status))).toEqual(new Set(['kept', 'skipped']));
    expect({ files: snapshot(), head: git(dir, 'rev-parse', 'HEAD') }).toEqual(before);
  });

  it('never writes outside the sandbox: a symlinked folder or file is refused before anything is written', async () => {
    const outside = join(t.dir, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'gi'), 'keep me\n');
    symlinkSync(outside, join(sandbox, 'sneaky'));
    await expect(scaffold({ ...base, folder: 'sneaky', mode: 'adopt' })).rejects.toThrow(/symlink/);
    await expect(scaffold({ ...base, folder: '../outside', mode: 'new' })).rejects.toThrow(/'\.\.'/);

    const dir = join(sandbox, 'leaky');
    mkdirSync(dir);
    symlinkSync(join(outside, 'gi'), join(dir, '.gitignore'));
    await expect(scaffold({ ...base, folder: 'leaky', mode: 'adopt' })).rejects.toThrow(/symlink/);
    expect(readdirSync(dir)).toEqual(['.gitignore']); // preflight: nothing else was written
    expect(readdirSync(outside).sort()).toEqual(['gi']);
    expect(readFileSync(join(outside, 'gi'), 'utf8')).toBe('keep me\n');
  });

  it('inspect compares disk to the expected scaffold', async () => {
    expect(inspect(sandbox, 'nothing')).toMatchObject({
      exists: false,
      complete: false,
      git: { repo: false, commits: 0 },
    });
    const r = await scaffold({ ...base, folder: 'p', mode: 'new' });
    const rep = inspect(sandbox, 'p');
    expect(rep).toMatchObject({
      exists: true,
      complete: true,
      git: { repo: true, head: r.commit, commits: 1 },
      claudeMdGenerated: base.date,
    });
    expect(rep.items.map((i) => i.path)).toEqual([
      '.project',
      'CLAUDE.md',
      '.gitignore',
      '.env',
      'updates/',
      'issues.txt',
    ]);
    execFileSync('rm', [join(sandbox, 'p', 'issues.txt')]);
    expect(inspect(sandbox, 'p').items.find((i) => i.path === 'issues.txt')?.present).toBe(false);
    expect(existsSync(join(sandbox, 'p', '.git'))).toBe(true);
  });
});
