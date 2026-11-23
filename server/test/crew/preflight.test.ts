/* Builder preflight (No Silent Stuck Tasks): the rules for "this checkout can't be built", and the real facts. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatherFacts, preflightProblems } from '../../src/crew/preflight.ts';
import { tempDir } from '../helpers.ts';
import { git } from './aurora-studio.ts';

describe('preflightProblems', () => {
  it('is empty for a git checkout with its tools', () => {
    expect(preflightProblems({ gitRepo: true, manifests: ['package.json'], missingTools: [] })).toEqual([]);
  });

  it('names a missing repo and each project file whose tools are missing', () => {
    const problems = preflightProblems({
      gitRepo: false,
      manifests: ['package.json', 'Cargo.toml', 'pyproject.toml'],
      missingTools: ['npm', 'cargo'],
    });
    expect(problems).toEqual([
      "The checkout isn't a git repository, so work can't be committed.",
      "package.json needs npm, but it isn't on PATH.",
      "Cargo.toml needs cargo, but it isn't on PATH.",
    ]);
  });
});

describe('gatherFacts', () => {
  it('sees the repo, the project files and what PATH lacks', async () => {
    const t = tempDir();
    try {
      const repo = join(t.dir, 'repo');
      const bin = join(t.dir, 'bin');
      mkdirSync(repo);
      mkdirSync(bin);
      writeFileSync(join(bin, 'node'), '');
      writeFileSync(join(repo, 'package.json'), '{}');
      expect(await gatherFacts(repo, bin)).toEqual({
        gitRepo: false,
        manifests: ['package.json'],
        missingTools: ['npm'],
      });
      git(repo, 'init', '-q');
      expect((await gatherFacts(repo, bin)).gitRepo).toBe(true);
    } finally {
      t.cleanup();
    }
  });
});
