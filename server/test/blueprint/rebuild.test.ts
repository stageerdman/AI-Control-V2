/* G1: rebuild CLAUDE.md from the modules — only the generated part; the project's own rules stay byte for byte. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { rebuildText, rulesStart } from '../../src/blueprint/rebuild.ts';
import { testApp } from '../helpers.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('CLAUDE.md rebuild', () => {
  let h: ReturnType<typeof testApp> | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('finds the rules heading outside code fences only', () => {
    expect(rulesStart('# X\n\n## Project-specific rules\n- a\n')).toBe(5);
    expect(rulesStart('```\n## Project-specific rules\n```\n')).toBe(-1);
    expect(
      rebuildText('# Old\nno rules here\n', { name: 'X', about: '', modules: [], controlHome: '/c' }),
    ).toBeNull();
  });

  it('POST /projects/:id/claude-md/rebuild: new module text in, project rules kept, .project stamped, committed', async () => {
    const app = testApp({ seed: true });
    h = app;
    const d = (
      await app.call('POST', '/drafts', { mode: 'new', name: 'Rulebook', orchestratorId: 'a-pixel' })
    ).body;
    await app.call('PATCH', `/drafts/${d.id}`, {
      plan: { teams: [{ teamId: 'ship-it', why: 'x' }], summary: 'x' },
    });
    const p = (await app.call('POST', `/drafts/${d.id}/finish`)).body.project;
    const dir = join(app.config.sandbox, p.folder);
    const md = join(dir, 'CLAUDE.md');
    const ownRules =
      '## Project-specific rules\n\n- Stack: Node 25, no framework.\n- Run: `node server.js`.\n';
    const text = readFileSync(md, 'utf8');
    writeFileSync(md, text.slice(0, rulesStart(text)) + ownRules);
    writeFileSync(
      join(dir, '.project'),
      readFileSync(join(dir, '.project'), 'utf8').replace(
        /claude_md_generated: .*/,
        'claude_md_generated: 2020-01-01',
      ),
    );
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=T', '-c', 'user.email=t@x', 'commit', '-qm', 'own rules');
    /* a module changed since */
    writeFileSync(
      join(app.config.controlHome, 'modules', 'CODING.md'),
      'How code is written.\n\n# Coding\n\n## Keep it minimal\n- Build only what is needed.\n- NEW: name things plainly.\n',
    );
    const r = await app.call('POST', `/projects/${p.id}/claude-md/rebuild`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      file: 'CLAUDE.md',
      changed: true,
      modules: ['STRUCTURE', 'CODING'],
      commit: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    const after = readFileSync(md, 'utf8');
    expect(after).toContain('- NEW: name things plainly.');
    expect(after.endsWith(ownRules)).toBe(true);
    expect(after.match(/## Project-specific rules/g)).toHaveLength(1);
    expect(readFileSync(join(dir, '.project'), 'utf8')).not.toContain('2020-01-01');
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('AI Studio: rebuild CLAUDE.md from the modules');
    expect(git(dir, 'status', '--porcelain')).toBe('');
    /* again: nothing to do */
    expect((await app.call('POST', `/projects/${p.id}/claude-md/rebuild`)).body).toMatchObject({
      changed: false,
      commit: null,
    });
    /* no rules heading → refused, file untouched */
    writeFileSync(md, '# Hand-written\n\nMy rules.\n');
    const no = await app.call('POST', `/projects/${p.id}/claude-md/rebuild`);
    expect(no.status).toBe(409);
    expect(readFileSync(md, 'utf8')).toBe('# Hand-written\n\nMy rules.\n');
    expect((await app.call('POST', '/projects/aurora/claude-md/rebuild')).status).toBe(409); // no folder
  });
});
