/* Team rebuild (spec-ux-team-rebuild §3–4): plan → one confirm card → apply → Undo.
   Wire types mirror the server's (server/src/office/rebuild.ts, app/src/api/types.ts). Everything past the
   card's `moves` is read defensively (`?? []`): one card renders whatever the plan carries. */
import { http, isApiError } from '../../../api';

const e = encodeURIComponent;

export type HandoverTo = 'captain' | 'director' | 'finish-first' | 'stop-now';
export type LonePick = 'specialist' | 'remove';

/** One rebuild request (§4). Names or ids, resolved on the server against the project's lineup. */
export type Rebuild = {
  remove?: string[];
  removeTeams?: string[];
  move?: { agent: string; to: string | 'specialist'; job?: string }[];
  split?: { team: string; into: { name: string; captain: string; members: string[] }[] }[];
  captain?: { team: string; agent: string }[];
  handover?: { agent: string; to: HandoverTo }[];
};

export type OpenItem = { id: string; title: string; to: HandoverTo; toName: string };
export type Person = { id: string; name: string };

export type RebuildCard = {
  planId: string;
  projectId: string;
  stale: boolean;
  leaves: {
    kind: 'agent' | 'team';
    id: string;
    name: string;
    openItems: OpenItem[];
    running: boolean;
    /** A team leaving: who sits at it (faces on the line). */
    members?: Person[];
  }[];
  specialists: Person[];
  moves: { agentId: string; name: string; fromTeam: string; toTeam: string }[];
  newTeams?: { name: string; captainId: string; captainName: string; members: Person[] }[];
  /** A captain leaves or moves: who takes over (the next member by default), and who else could. */
  captains?: { teamId: string; teamName: string; agentId: string; name: string; choices: Person[] }[];
  /** A team left with one person: make them a specialist (default) or remove them too. */
  lone?: { teamId: string; teamName: string; agentId: string; name: string; pick: LonePick }[];
  /** Teams also on other projects: this project gets its own copy. */
  copies?: { teamId: string; teamName: string; otherProjects: string[] }[];
};

export type PlanResult =
  | { ok: true; planId: string; needsConfirm: boolean; card: RebuildCard }
  | { ok: false; error: string };
export type ApplyBody = {
  handover?: { agent: string; to: HandoverTo }[];
  captain?: { team: string; agent: string }[];
  lone?: { agent: string; to: LonePick }[];
};
export type ApplyResult = { ok: true; undoToken: string; summary: string } | { ok: false; error: string };
export type UndoResult = { ok: true; summary?: string } | { ok: false; error: string };

/** What a director reply may carry (`ThreadMessage.rebuild`). */
export type RebuildOffer = {
  needsConfirm: boolean;
  card: RebuildCard;
  planId: string;
  /** Applied at once (nothing to decide): the Undo line instead of the card. */
  undoToken?: string;
  summary?: string;
};

/** Undo lasts 10 minutes (spec §3) — the server is the judge; this only hides a dead link. */
export const UNDO_MS = 10 * 60_000;

/* errors come back as {ok:false,error}, or as an HTTP error: both read as one plain line */
const plain = async <T extends { ok: boolean }>(p: Promise<T>, fallback: string): Promise<T | { ok: false; error: string }> => {
  try {
    return await p;
  } catch (x) {
    return { ok: false, error: isApiError(x) || x instanceof Error ? x.message || fallback : fallback };
  }
};

/** GET /projects/:id/lineup — who sits where on this project (server/src/office/rebuild.ts projectLineup). */
export type LineupWire = {
  teams: { id: string; name: string; captainId: string | null; members: { id: string; name: string; role: string }[] }[];
  specialists: { id: string; name: string; role: string }[];
  /** Who left this project (still in the Cast): they can be brought back as specialists. */
  left?: Leaver[];
};
export type Leaver = { id: string; name: string; role: string };
export const lineupOf = (w: LineupWire): Lineup => ({
  teams: w.teams.map((t) => ({ id: t.id, name: t.name, captain: t.captainId, members: t.members.map((m) => m.id) })),
  solo: w.specialists.map((s) => s.id),
  left: w.left ?? [],
});
export type BringBackResult = { ok: true; name: string } | { ok: false; error: string };

export const rebuildApi = {
  lineup: (pid: string) => http.get<LineupWire>(`/projects/${e(pid)}/lineup`),
  plan: (pid: string, body: Rebuild) =>
    plain(http.post<PlanResult>(`/projects/${e(pid)}/rebuild/plan`, body), 'Couldn’t plan that.'),
  apply: (planId: string, body: ApplyBody = {}) =>
    plain(http.post<ApplyResult>(`/rebuild/${e(planId)}/apply`, body), 'The rebuild didn’t go through.'),
  undo: (token: string) =>
    plain(http.post<UndoResult>(`/rebuild/undo/${e(token)}`, {}), 'Couldn’t undo that.'),
  /** Runs at once — not part of a Rearrange draft. */
  bringBack: (pid: string, agentId: string) =>
    plain(http.post<BringBackResult>(`/projects/${e(pid)}/specialists`, { agentId }), 'Couldn’t bring them back.'),
};

/** A plan that went stale on the server (a newer message, the lineup changed) — the card greys out. */
export const isStaleError = (msg: string) => /stale|changed|expired|not found|unknown plan/i.test(msg);

/* ---------- Rearrange (office path): a draft lineup → one Rebuild */

export type Place = { kind: 'team'; teamId: string } | { kind: 'solo' } | { kind: 'out' };
export type Lineup = {
  teams: { id: string; name: string; captain: string | null; members: string[] }[];
  solo: string[];
  left: Leaver[];
};
export const MAX_TEAM = 7;

export const placeKey = (p: Place) => (p.kind === 'team' ? `team:${p.teamId}` : p.kind);

/** Where everyone sits now. A person on two tables counts at the first. */
export function placesOf(l: Lineup): Record<string, Place> {
  const out: Record<string, Place> = {};
  for (const t of l.teams) for (const a of t.members) out[a] ??= { kind: 'team', teamId: t.id };
  for (const a of l.solo) out[a] ??= { kind: 'solo' };
  return out;
}

/** Who moved (agent ids), in a stable order. */
export function changesOf(from: Record<string, Place>, to: Record<string, Place>): string[] {
  return Object.keys(to).filter((a) => from[a] && placeKey(from[a]) !== placeKey(to[a]));
}

/** The draft → one Rebuild: a team whose whole table walks out leaves as a team. */
export function toRebuild(l: Lineup, from: Record<string, Place>, to: Record<string, Place>): Rebuild {
  const moved = new Set(changesOf(from, to));
  const removeTeams = l.teams
    .filter((t) => t.members.length > 0 && t.members.every((a) => to[a]?.kind === 'out'))
    .map((t) => t.id);
  const gone = new Set(l.teams.filter((t) => removeTeams.includes(t.id)).flatMap((t) => t.members));
  const remove: string[] = [];
  const move: NonNullable<Rebuild['move']> = [];
  for (const a of moved) {
    const p = to[a];
    if (p.kind === 'out') {
      if (!gone.has(a)) remove.push(a);
    } else move.push({ agent: a, to: p.kind === 'solo' ? 'specialist' : p.teamId });
  }
  return {
    ...(remove.length ? { remove } : {}),
    ...(removeTeams.length ? { removeTeams } : {}),
    ...(move.length ? { move } : {}),
  };
}

/** How many sit at a team table in the draft. */
export const seatsAt = (to: Record<string, Place>, teamId: string) =>
  Object.values(to).filter((p) => p.kind === 'team' && p.teamId === teamId).length;
