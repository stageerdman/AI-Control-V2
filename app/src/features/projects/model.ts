/* Projects home, pure: shelves (My Workplace / Today / In setup / All other), search, card view-models. */
import type { Agent, Draft, Project, Team } from '../../api';

/** Short display name (the prototype's shortName: nick, else name). */
export const nickOf = (a: Pick<Agent, 'name' | 'nick'> | null | undefined): string =>
  a ? a.nick || a.name : '';

/** Ports board only (the home uses homeShelves): live or waiting on you, or a real project that went
    idle this week. */
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

/** HOME: pinned by the user into My Workplace. */
export const pinned = (p: Pick<Project, 'pinRank'>): boolean => p.pinRank != null;

/** HOME: the user gave work here today — on or after local midnight (the client's clock and time zone). */
export function workedToday(p: Pick<Project, 'lastUserAt'>, now = Date.now()): boolean {
  if (!p.lastUserAt) return false;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Date.parse(p.lastUserAt) >= midnight.getTime();
}

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
/** All other: waiting on you first, then live, then most recent; archived last. */
const restRank = (p: Project) =>
  p.status === 'needs' ? 0 : p.status === 'live' ? 1 : p.status === 'archived' ? 3 : 2;

export type Shelves = { workplace: Project[]; today: Project[]; drafts: Draft[]; rest: Project[] };
/** The home's shelves: each project lands in exactly one; search filters them all alike. */
export function homeShelves(projects: Project[], drafts: Draft[], q: string, now = Date.now()): Shelves {
  const ps = projects.filter((p) => matchesProject(p, q));
  const workplace = ps.filter(pinned).sort((a, b) => (a.pinRank ?? 0) - (b.pinRank ?? 0));
  const today = ps
    .filter((p) => !pinned(p) && workedToday(p, now))
    .sort((a, b) => t(b.lastUserAt) - t(a.lastUserAt));
  const rest = ps
    .filter((p) => !pinned(p) && !workedToday(p, now))
    .sort(
      (a, b) => restRank(a) - restRank(b) || t(b.lastUserAt ?? b.updatedAt) - t(a.lastUserAt ?? a.updatedAt),
    );
  return { workplace, today, drafts: drafts.filter((d) => matchesDraft(d, q)), rest };
}

/** My Workplace with `id` pinned (at the end) or unpinned — the ids PUT /projects/pins takes. */
export function togglePin(projects: Project[], id: string): string[] {
  const order = projects
    .filter(pinned)
    .sort((a, b) => (a.pinRank ?? 0) - (b.pinRank ?? 0))
    .map((p) => p.id);
  return order.includes(id) ? order.filter((x) => x !== id) : [...order, id];
}

/** The projects as they'd read with this pin order (the optimistic update). */
export const withPins = (projects: Project[], ids: string[]): Project[] =>
  projects.map((p) => {
    const i = ids.indexOf(p.id);
    return { ...p, pinRank: i < 0 ? null : i };
  });

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

/** Not adopted: ~/dev folders not under AI Studio (the server leaves out projects + set-up drafts),
    minus any a draft has already picked; search matches the folder and its GitHub repo. */
export type LooseFolder = { folder: string; git: boolean; remote?: { github: string | null } | null };
export function unadopted<F extends LooseFolder>(
  folders: F[],
  drafts: Pick<Draft, 'folder'>[],
  q: string,
): F[] {
  const picked = new Set(drafts.map((d) => d.folder).filter(Boolean));
  return folders.filter(
    (f) =>
      !picked.has(f.folder) &&
      (!norm(q) ||
        f.folder.toLowerCase().includes(norm(q)) ||
        !!f.remote?.github?.toLowerCase().includes(norm(q))),
  );
}
/** The row's one quiet hint: "GitHub" when it has a GitHub remote, else "git", else nothing. */
export const folderHint = (f: LooseFolder): string => (f.remote?.github ? 'GitHub' : f.git ? 'git' : '');
