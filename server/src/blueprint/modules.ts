/* The Blueprint: global modules in <AI Control home>/modules/*.md, compiled into a
   project's CLAUDE.md. READ-ONLY on AI Control home — nothing here ever writes there. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Module = { name: string; description: string; body: string };

/* the order this studio's own CLAUDE.md uses; any other module follows alphabetically */
const CANONICAL = ['STRUCTURE', 'CODING', 'UX', 'WORKFLOW'];
const rank = (n: string) => (CANONICAL.includes(n) ? CANONICAL.indexOf(n) : CANONICAL.length);

export const modulesDir = (controlHome: string) => join(controlHome, 'modules');

/** A module file = one description line, then markdown starting at `# Title`. */
export function parseModule(name: string, text: string): Module {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const hasDescription = first >= 0 && !(lines[first] as string).startsWith('#');
  const description = hasDescription ? (lines[first] as string).trim() : '';
  const body = (hasDescription ? lines.slice(first + 1) : lines).join('\n').trim();
  return { name, description, body };
}

/** Last change to each module file (ISO) — the Blueprint compares it to a project's compile date. */
export function moduleTimes(controlHome: string): Record<string, string> {
  const dir = modulesDir(controlHome);
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => [f.slice(0, -3), statSync(join(dir, f)).mtime.toISOString()]),
  );
}

export function readModules(controlHome: string): Module[] {
  const dir = modulesDir(controlHome);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseModule(f.slice(0, -3), readFileSync(join(dir, f), 'utf8')))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Push every markdown heading one level down (outside code fences): `# X` → `## X`. */
export function demoteHeadings(md: string): string {
  let fenced = false;
  return md
    .split('\n')
    .map((l) => {
      if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
      return !fenced && /^#{1,5}\s/.test(l) ? `#${l}` : l;
    })
    .join('\n');
}

/** `/Users/x/.ai-control` → `~/.ai-control` for display in generated files. */
export const tildePath = (p: string, home = homedir()) =>
  p === home || p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p;

export type CompileInput = { name: string; about: string; modules: readonly Module[]; controlHome: string };

/** Same shape as this studio's own CLAUDE.md: header, the modules in order, project rules last. */
export function compileClaudeMd({ name, about, modules, controlHome }: CompileInput): string {
  const list = modules.map((m) => m.name).join(', ');
  const header = [
    `# ${name}`,
    '',
    about.trim() || 'A project set up by AI Studio.',
    '',
    `This file is compiled from the global modules in \`${tildePath(modulesDir(controlHome))}/\``,
    `(${list || 'none'}). Rebuild it with the \`rebuild-claude-md\` routine when the modules change.`,
    'Keep project-specific rules in the last section.',
  ].join('\n');
  const parts = [
    header,
    ...modules.map((m) => demoteHeadings(m.body)),
    "## Project-specific rules\n\n- *(none yet — add this project's own rules here)*",
  ];
  return `${parts.join('\n\n---\n\n')}\n`;
}
