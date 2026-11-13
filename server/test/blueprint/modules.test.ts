import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compileClaudeMd,
  demoteHeadings,
  parseModule,
  readModules,
  tildePath,
} from '../../src/blueprint/modules.ts';
import { tempDir, writeModules } from '../helpers.ts';

describe('blueprint modules', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());
  const home = () => {
    const t = tempDir();
    cleanup = t.cleanup;
    return t.dir;
  };

  it('parses the description line apart from the body', () => {
    expect(parseModule('X', 'One line.\n\n# X\n\nbody\n')).toEqual({
      name: 'X',
      description: 'One line.',
      body: '# X\n\nbody',
    });
    expect(parseModule('Y', '# Y\nbody')).toEqual({ name: 'Y', description: '', body: '# Y\nbody' });
  });

  it('demotes headings but not code-fenced lines', () => {
    expect(demoteHeadings('# A\n## B\n```\n# code\n```\ntext #1')).toBe(
      '## A\n### B\n```\n# code\n```\ntext #1',
    );
  });

  it('reads *.md modules in the canonical order, others after; a missing dir is empty', () => {
    const h = home();
    expect(readModules(h)).toEqual([]);
    writeModules(h);
    writeFileSync(join(h, 'modules', 'AAA.md'), 'Extra.\n\n# AAA\n');
    expect(readModules(h).map((m) => m.name)).toEqual(['STRUCTURE', 'CODING', 'AAA']);
  });

  it('never writes to AI Control home', () => {
    const h = home();
    writeModules(h);
    const snap = () =>
      readdirSync(join(h, 'modules')).map((f) => [
        f,
        statSync(join(h, 'modules', f)).mtimeMs,
        readFileSync(join(h, 'modules', f), 'utf8'),
      ]);
    const before = snap();
    readModules(h);
    expect(snap()).toEqual(before);
    expect(readdirSync(h)).toEqual(['modules']);
  });

  it('compiles CLAUDE.md like the studio’s own: header, modules in order, project rules last', () => {
    const h = home();
    mkdirSync(h, { recursive: true });
    writeModules(h);
    const md = compileClaudeMd({
      name: 'Hello Studio',
      about: 'A tiny test app.',
      modules: readModules(h),
      controlHome: h,
    });
    const sections = md.split('\n\n---\n\n');
    expect(sections).toHaveLength(4);
    expect(sections[0]).toBe(
      [
        '# Hello Studio',
        '',
        'A tiny test app.',
        '',
        `This file is compiled from the global modules in \`${h}/modules/\``,
        '(STRUCTURE, CODING). Rebuild it with the `rebuild-claude-md` routine when the modules change.',
        'Keep project-specific rules in the last section.',
      ].join('\n'),
    );
    expect(sections[1]).toMatch(/^## Structure\n\n### Updates\n```\n# not a heading/);
    expect(sections[2]).toBe('## Coding\n\n### Keep it minimal\n- Build only what is needed.');
    expect(sections[3]).toMatch(/^## Project-specific rules/);
    expect(md).not.toContain('How code is written.'); // descriptions are index text, not rules
    expect(md.endsWith('\n')).toBe(true);
  });

  it('shows home-relative paths with ~', () => {
    expect(tildePath('/Users/x/.ai-control/modules', '/Users/x')).toBe('~/.ai-control/modules');
    expect(tildePath('/opt/x', '/Users/x')).toBe('/opt/x');
  });
});
