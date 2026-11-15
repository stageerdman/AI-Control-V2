import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../../src/cast-packs/archetypes.ts';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { composePrompt } from '../../src/runtime/compose.ts';
import { AGENT_SHELL } from '../../src/runtime/config.ts';
import { runPermissions } from '../../src/runtime/permissions.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';

const toolsOf = (id: string) => {
  const a = ARCHETYPES.agents.find((x) => x.id === id);
  if (!a) throw new Error(`no archetype ${id}`);
  return a.tools;
};
const perms = (id: string) => runPermissions(toolsOf(id), AGENT_SHELL.dev);

describe('runPermissions', () => {
  it('Sola edits only updates/ and has no shell', () => {
    const p = perms('a-sola');
    expect(p.tools).not.toContain('Bash');
    expect(p.allowedTools).toEqual(['Read', 'Glob', 'Grep', 'Edit(updates/**)', 'Write(updates/**)']);
    expect(p.fullShell).toBe(false);
  });

  it('Brisk edits only spike folders, with the full dev shell and the web', () => {
    const p = perms('a-brisk');
    expect(p.tools).toContain('Bash');
    expect(p.allowedTools).toContain('Edit(updates/*/spike*/**)');
    expect(p.allowedTools).not.toContain('Edit');
    expect(p.allowedTools).toContain('Bash(npm *)');
    expect(p).toMatchObject({ fullShell: true, web: true, shell: AGENT_SHELL.dev });
  });

  it('Sable cannot edit and gets git only', () => {
    const p = perms('a-sable');
    expect(p.tools).not.toContain('Edit');
    expect(p.tools).not.toContain('Write');
    expect(p.allowedTools).toEqual(['Read', 'Glob', 'Grep', 'Bash(git)', 'Bash(git *)']);
    expect(p.shell).toEqual(['git']);
  });
});

describe('toolset in the run', () => {
  const spec = (over: Partial<RunSpec>): RunSpec => ({
    runId: 'r1',
    cwd: '/tmp',
    systemPrompt: 'x',
    task: 't',
    model: 'm',
    caps: { maxTurns: 1, maxBudgetUsd: 1 },
    env: {},
    secretValues: [],
    ...over,
  });
  const opts = { askServer: '/ask.ts', shellHook: 'HOOK' };

  it('the setting-prefix hook runs only for a full studio shell', () => {
    const brisk = perms('a-brisk');
    const sable = perms('a-sable');
    expect(cliArgs(spec({ ...brisk, fullShell: true }), opts).join(' ')).toContain('HOOK');
    expect(cliArgs(spec({ ...sable, fullShell: false }), opts).join(' ')).not.toContain('HOOK');
  });

  it('the prompt tells each agent what it can and cannot do', () => {
    const base = { agent: { name: 'A', prompt: 'p', role: 'r' }, project: { name: 'P' } };
    const sola = perms('a-sola');
    const s = composePrompt({ ...base, shell: sola.shell, edit: sola.edit, settingsPrefix: false });
    expect(s).toContain('only under `updates/**`');
    expect(s).toContain('You have no shell.');
    expect(s).toContain('The studio commits your changes');
    expect(s).not.toContain('NAME=value');

    const sable = perms('a-sable');
    const w = composePrompt({ ...base, shell: sable.shell, edit: sable.edit, settingsPrefix: false });
    expect(w).toContain('read files but not change them');
    expect(w).toContain('`git` is pre-approved');
    expect(w).toContain('Commit your work with git');

    expect(composePrompt(base)).toContain('NAME=value');
  });
});
