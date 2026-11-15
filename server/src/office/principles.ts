/* Team principles (STUDIO LIFE): each team on a project keeps `principles/<team-slug>/` in the project folder —
   short markdown files (design principles, code rules, decisions). The captain keeps them; every member reads them
   before starting; members propose changes to the captain. Read-only here: the office shows them. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from '../db/store.ts';
import { slugify } from '../domain/ids.ts';
import { conflict, notFound } from '../errors.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';

export const PRINCIPLES_DIR = 'principles';
export const principlesDir = (team: { id: string; name: string }) =>
  `${PRINCIPLES_DIR}/${slugify(team.name.replace(/^the\s+/i, ''), team.id)}`;
const FILE = /^[\w .-]{1,80}\.(md|markdown|txt)$/i;
const MAX = 200_000;

/** What an agent is told (pure). `keeper` = the team's captain. */
export function principlesBrief(p: { dir: string; keeper: boolean } | { all: true }): string {
  if ('all' in p)
    return `Before you start, read the team principles in \`${PRINCIPLES_DIR}/\` (one folder per team) that touch your work, and follow them. Don't edit them — tell the team's captain if one is wrong.`;
  return p.keeper
    ? [
        `You keep your team's principles in \`${p.dir}/\`: short markdown files (one topic each — e.g. design principles, code rules, decisions) that every member reads before starting. Read them first yourself.`,
        `When the team settles something that should hold from now on, write it down there in a few plain lines and commit it with your work. Keep them few, current and short; remove what no longer holds. When a member suggests a change, decide and update the file.`,
      ].join('\n')
    : `Before you start, read every file in \`${p.dir}/\` (your team's principles — if the folder exists) and follow them. Don't edit them; if one is wrong or missing, tell your captain (call_agent).`;
}

export function createPrinciples(deps: { store: Store; sandbox: string }) {
  const { store } = deps;
  const folderOf = (projectId: string) => {
    const p = store.projects.require(projectId);
    if (!p.folder) throw conflict('This project has no folder yet');
    return resolveInSandbox(deps.sandbox, p.folder);
  };
  const files = (dir: string) =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => FILE.test(f) && statSync(join(dir, f)).isFile())
          .sort()
          .map((f) => {
            const body = readFileSync(join(dir, f), 'utf8').slice(0, 2000);
            const title =
              /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? f.replace(/\.\w+$/, '').replace(/[-_]/g, ' ');
            return { file: f, title, updatedAt: statSync(join(dir, f)).mtime.toISOString() };
          })
      : [];
  return {
    /** Every team on the project with its folder and files (empty = nothing written yet). */
    list(projectId: string) {
      const root = folderOf(projectId);
      return {
        teams: store.projects
          .require(projectId)
          .teamIds.map((id) => store.teams.get(id))
          .filter((t) => !!t)
          .map((t) => {
            const dir = principlesDir(t);
            return { teamId: t.id, name: t.name, captainId: t.captainId, dir, files: files(join(root, dir)) };
          }),
      };
    },
    read(projectId: string, teamId: string, file: string) {
      const t = store.projects.require(projectId).teamIds.includes(teamId) ? store.teams.get(teamId) : null;
      if (!t) throw notFound('Team', teamId);
      if (!FILE.test(file)) throw notFound('Principle', file);
      const path = join(folderOf(projectId), principlesDir(t), file);
      if (!existsSync(path)) throw notFound('Principle', file);
      return { teamId, file, body: readFileSync(path, 'utf8').slice(0, MAX) };
    },
  };
}
export type Principles = ReturnType<typeof createPrinciples>;
