import { describe, expect, it } from 'vitest';
import { type ToolListInput, toolList } from '../../src/domain/tool-list.ts';
import type { Toolset } from '../../src/domain/toolset.ts';

const SHELL = ['git', 'npm', 'node'];
const kit = (tools: Toolset | null, more: Partial<ToolListInput> = {}) =>
  toolList({ tools, canMail: false, reporter: false, ...more }, SHELL);
const set = (t: Partial<Toolset>): Toolset => ({ edit: 'any', shell: 'studio', web: false, works: [], ...t });

describe('toolList', () => {
  it('the full kit (no toolset): any file, the studio shell, no web', () => {
    expect(kit(null)).toEqual({
      edit: ['Any file in the project'],
      run: ['git', 'npm', 'node'],
      reach: ['Reads every file in the project', 'Keys granted to its project (never their values)'],
    });
  });

  it('read only with no shell: nothing to edit or run, still reads and gets its project keys', () => {
    const l = kit(set({ edit: 'none', shell: 'none' }));
    expect(l.edit).toEqual([]);
    expect(l.run).toEqual([]);
    expect(l.reach).toContain('Reads every file in the project');
  });

  it('scoped edits list their globs; a git-only shell runs git alone', () => {
    const l = kit(set({ edit: ['updates/**', '**/wiki.md'], shell: 'git' }));
    expect(l.edit).toEqual(['updates/**', '**/wiki.md']);
    expect(l.run).toEqual(['git']);
  });

  it('reach adds the web (toolset or reporter role) and mail when allowed', () => {
    const web = 'The web (search and fetch)';
    const mail = 'Mail to other projects and HQ';
    expect(kit(set({ web: true })).reach).toContain(web);
    expect(kit(null, { reporter: true }).reach).toContain(web);
    expect(kit(null).reach).not.toContain(web);
    expect(kit(null, { canMail: true }).reach).toContain(mail);
    expect(kit(null).reach).not.toContain(mail);
  });
});
