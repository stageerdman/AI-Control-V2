/* Contents of the standard scaffold files (STRUCTURE.md "AI Control standard"). Pure. */

export type ProjectMarker = {
  name: string;
  created: string;
  modules: readonly string[];
  secrets: readonly string[];
  generated: string;
};

const yamlList = (key: string, items: readonly string[]) =>
  items.length ? `${key}:\n${items.map((i) => `  - ${i}`).join('\n')}` : `${key}: []`;

/** `.project` in the same format as the studio's own. */
export const dotProject = (m: ProjectMarker) =>
  `${[`name: ${m.name}`, `created: ${m.created}`, yamlList('modules', m.modules), yamlList('secrets', m.secrets), `claude_md_generated: ${m.generated}`].join('\n')}\n`;

export const GITIGNORE = '.DS_Store\n.env\n.env.*\n!.env.example\n';
export const GITIGNORE_ENV_BLOCK =
  '\n# AI Studio: secrets never get committed\n.env\n.env.*\n!.env.example\n';

/** Does a .gitignore already keep `.env` out of git? */
export function gitignoreCoversEnv(text: string): boolean {
  return text
    .split('\n')
    .map((l) => l.trim())
    .some((l) => ['.env', '/.env', '.env*', '/.env*', '*.env'].includes(l));
}

export const issuesTxt = (name: string) => `${name} — known issues & TODOs
${'='.repeat(Math.max(name.length + 23, 10))}
Running list. Newest at top. Move resolved items to the bottom with a strikethrough note or delete once truly gone.

OPEN
----
(none yet)

RESOLVED
--------
(none yet)
`;

export const initUpdateDir = (date: string) => `updates/${date} INIT - OPEN`;

export const initUpdatePlan = (name: string, about: string, date: string) => `# INIT — v1

Status: **OPEN** · Opened ${date}

## Goal

${about.trim() || `Get ${name} off the ground.`}

## Roadmap

*(Written by the one leader the orchestrator names — a captain, or the orchestrator itself: phases, each ending with tests.)*

## Status
- ✅ Project set up by the Project Setter (AI Studio).
`;

export const initUpdateWiki = () => `# INIT — decisions & lessons

Durable knowledge from this update. Status lives in \`update v1.md\`.

## Lessons
- *(to be filled as the update progresses)*
`;
