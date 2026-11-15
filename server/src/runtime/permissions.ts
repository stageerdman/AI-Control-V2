/* An agent's Toolset → its run's Claude Code permissions (pure). Reading is always allowed;
   editing, the shell and the web are what the toolset grants. In dontAsk mode anything not
   pre-approved here is refused, so a scoped edit (`Edit(updates/**)`) is a real boundary. */
import type { EditScope, Toolset } from '../domain/toolset.ts';
import { shellAllowed } from './claude-cli.ts';

const READ = ['Read', 'Glob', 'Grep'];
const EDIT = ['Edit', 'Write'];

export type RunPermissions = {
  tools: string[];
  allowedTools: string[];
  /** Shell commands pre-approved for this run ([] = no shell). */
  shell: readonly string[];
  edit: EditScope;
  /** The run gets the whole studio shell, so `NAME=value <command>` (the setting-prefix hook) applies too. */
  fullShell: boolean;
  /** Web search and fetch (RunSpec.web adds them to the tools). */
  web: boolean;
};

const editAllowed = (edit: EditScope): string[] =>
  edit === 'none' ? [] : edit === 'any' ? EDIT : edit.flatMap((p) => EDIT.map((t) => `${t}(${p})`));

const shellOf = (t: Toolset, studioShell: readonly string[]): readonly string[] =>
  t.shell === 'studio' ? studioShell : t.shell === 'git' ? ['git'] : [];

export function runPermissions(t: Toolset, studioShell: readonly string[]): RunPermissions {
  const shell = shellOf(t, studioShell);
  const bash = shell.length ? ['Bash'] : [];
  return {
    tools: [...READ, ...(t.edit === 'none' ? [] : EDIT), ...bash],
    allowedTools: [...READ, ...editAllowed(t.edit), ...shellAllowed(shell)],
    shell,
    edit: t.edit,
    fullShell: t.shell === 'studio',
    web: t.web,
  };
}
