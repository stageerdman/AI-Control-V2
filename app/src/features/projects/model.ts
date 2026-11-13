/* Projects home, pure: shelves (on set / back lot / in setup), search, card view-models. */
import type { Agent, Draft, Project, Team } from '../../api';

/** Short display name (the prototype's shortName: nick, else name). */
export const nickOf = (a: Pick<Agent, 'name' | 'nick'> | null | undefined): string =>
  a ? a.nick || a.name : '';

/** On set = live or waiting on you; the back lot = idle, draft, archived. */
export const isOnSet = (p: Project): boolean => p.status === 'live' || p.status === 'needs';

const norm = (s: string) => s.trim().toLowerCase();
export const matchesProject = (p: Project, q: string): boolean =>
  !norm(q) || p.name.toLowerCase().includes(norm(q)) || p.note.toLowerCase().includes(norm(q));
export const matchesDraft = (d: Draft, q: string): boolean =>
  !norm(q) || (d.name || 'untitled').toLowerCase().includes(norm(q));

export type Shelves = { drafts: Draft[]; onSet: Project[]; backLot: Project[] };
export function shelves(projects: Project[], drafts: Draft[], q: string): Shelves {
  const ps = projects.filter((p) => matchesProject(p, q));
  return {
    drafts: drafts.filter((d) => matchesDraft(d, q)),
    onSet: ps.filter(isOnSet),
    backLot: ps.filter((p) => !isOnSet(p)),
  };
}
/** "1 in setup · 3 on set · 6 in the back lot" */
export const shelfCount = (s: Shelves): string =>
  `${s.drafts.length ? `${s.drafts.length} in setup · ` : ''}${s.onSet.length} on set · ${s.backLot.length} in the back lot`;

/** Everyone on the project: its teams' members (teams first), then the specialists — once each. */
export function castOf(p: Pick<Project, 'teamIds' | 'agentIds'>, teams: Team[]): string[] {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  for (const tid of p.teamIds) for (const m of teams.find((t) => t.id === tid)?.members ?? []) add(m.agentId);
  for (const id of p.agentIds) add(id);
  return ids;
}

export const ghBadge = (g: Project['github']): string =>
  !g.connected ? 'GitHub not connected' : g.private ? '🔒 GitHub · private' : '🌐 GitHub · public';

const TAGS = {
  draft: 'Draft',
  archived: 'Archived',
  idle: 'Idle',
  live: 'Live',
  needs: 'Needs input',
} as const;
export const backLotTag = (p: Project) => ({ label: TAGS[p.status], tone: p.status });

/** "edited 2d ago" (the prototype's back-lot line). */
export function editedAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, 'y'],
    [60 * 60 * 24 * 30, 'mo'],
    [60 * 60 * 24 * 7, 'w'],
    [60 * 60 * 24, 'd'],
    [60 * 60, 'h'],
    [60, 'm'],
  ];
  for (const [n, u] of units) if (s >= n) return `edited ${Math.floor(s / n)}${u} ago`;
  return 'edited just now';
}
