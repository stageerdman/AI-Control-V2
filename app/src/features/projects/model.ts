/* Projects home, pure: shelves (on set / back lot / in setup), search, card view-models. */
import type { Agent, Draft, Project, Team } from '../../api';

/** Short display name (the prototype's shortName: nick, else name). */
export const nickOf = (a: Pick<Agent, 'name' | 'nick'> | null | undefined): string =>
  a ? a.nick || a.name : '';

/** On set = live or waiting on you — and a real project that went idle this week (the server moves
    status on its own: a project between goals is idle, not shelved); the back lot = the rest. */
const RECENT_MS = 7 * 24 * 3600 * 1000;
export const isOnSet = (p: Project, now = Date.now()): boolean =>
  p.status === 'live' ||
  p.status === 'needs' ||
  (p.status === 'idle' && !!p.folder && now - Date.parse(p.updatedAt) < RECENT_MS);

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
    onSet: ps.filter((p) => isOnSet(p)),
    backLot: ps.filter((p) => !isOnSet(p)),
  };
}

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

/** Shown only when a project is on GitHub (G3 cut the "not connected" chip: it was on most cards and was noise). */
export const ghBadge = (g: Project['github']): string =>
  g.private ? '🔒 GitHub · private' : '🌐 GitHub · public';

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

/** The card's progress line: "64% to v1.0" with a target, else "64% done". */
export const progressLine = (p: Pick<Project, 'progress' | 'target'>): string =>
  `${Math.round(p.progress)}% ${p.target?.trim() ? `to ${p.target.trim()}` : 'done'}`;
