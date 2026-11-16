/* An agent's tools in plain words for the Cast: what it can edit, run and reach. Derived from the
   stored Toolset with the runtime's own rules (runtime/permissions.ts), so the list never promises
   more — or hides more — than a run really gets. An empty list means "nothing". */
import type { Toolset } from './toolset.ts';

export type ToolList = { edit: string[]; run: string[]; reach: string[] };

export type ToolListInput = {
  /** null = the studio's full kit. */
  tools: Toolset | null;
  canMail: boolean;
  /** Its role files reports — report runs always get the web. */
  reporter: boolean;
};

const ANY_FILE = 'Any file in the project';
const READS = 'Reads every file in the project';
const WEB = 'The web (search and fetch)';
const MAIL = 'Mail to other projects and HQ';
const KEYS = 'Keys granted to its project (never their values)';

function editList(edit: Toolset['edit']): string[] {
  if (edit === 'any') return [ANY_FILE];
  if (edit === 'none') return [];
  return [...edit];
}

function runList(shell: Toolset['shell'], studioShell: readonly string[]): string[] {
  if (shell === 'studio') return [...studioShell];
  if (shell === 'git') return ['git'];
  return [];
}

/** `studioShell` = the commands the studio grants agent runs (config AGENT_SHELL). */
export function toolList(a: ToolListInput, studioShell: readonly string[]): ToolList {
  const t = a.tools;
  const web = (t?.web ?? false) || a.reporter;
  return {
    edit: t ? editList(t.edit) : [ANY_FILE],
    run: runList(t?.shell ?? 'studio', studioShell),
    reach: [READS, ...(web ? [WEB] : []), ...(a.canMail ? [MAIL] : []), KEYS],
  };
}
