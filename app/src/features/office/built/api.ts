/* The "built for you" card's data (design/team-built-card.md): the project's approved team requests
   (server/src/db/team-requests.ts), undo of a whole build and its undo, and remove-one-with-undo for an
   agent or the team. Removing one keeps its restore token here, so the card can offer Undo on its row. */
import { http, invalidate, isApiError, setQueryData } from '../../../api';
import type { Agent, BusySession, Team } from '../../../api/types';
import { castApi, KEYS } from '../../cast/api';
import { busyReason } from '../../cast/store';

const e = encodeURIComponent;

export type Built = { teamId: string; agentIds: string[]; roleIds: string[]; restoreTokens?: string[] };
export type TeamRequest = {
  id: string;
  projectId: string;
  directorId: string;
  work: string;
  /** The user's yes, word for word, and when they said it. */
  yes: { words: string; at: string; messageId: string };
  createdAt: string;
  built: Built | null;
  builtAt: string | null;
  undoneAt: string | null;
};

export const requestsKey = (pid: string) => `project:${pid}:team-requests`;

export const builtApi = {
  list: (pid: string) =>
    http.get<{ requests: TeamRequest[] }>(`/projects/${e(pid)}/team-requests`).then((r) => r.requests),
  undo: (pid: string, id: string) => http.post<TeamRequest>(`/projects/${e(pid)}/team-requests/${e(id)}/undo`),
  restore: (pid: string, id: string) =>
    http.post<TeamRequest>(`/projects/${e(pid)}/team-requests/${e(id)}/restore`),
};

/** A plain line from any failure (`name`: who, when they're busy in a session). */
export const plainError = (x: unknown, fallback: string, name = 'They') =>
  isApiError(x) && x.code === 'agent_busy'
    ? busyReason(name, ((x.details as { sessions?: BusySession[] } | undefined)?.sessions ?? []))
    : isApiError(x) || x instanceof Error
      ? x.message || fallback
      : fallback;

/** Everything the card shows comes from these: refresh them after a change. */
const refresh = async (pid: string) => {
  await Promise.all([invalidate(KEYS.agents), invalidate(KEYS.teams), invalidate(KEYS.roles)]);
  void invalidate(requestsKey(pid));
  void invalidate(KEYS.deleted);
  void invalidate('projects');
  void invalidate(`project:${pid}`);
};

/* ---------- one at a time: item id → its restore token and name (this app session) */
const tokens = new Map<string, { token: string; name: string }>();
export const removedOne = (id: string) => tokens.get(id) ?? null;
/** For tests. */
export const resetBuiltTokens = () => tokens.clear();

export async function removeOne(pid: string, x: { kind: 'agent'; agent: Agent } | { kind: 'team'; team: Team }) {
  const id = x.kind === 'agent' ? x.agent.id : x.team.id;
  const res = x.kind === 'agent' ? await castApi.agents.remove(id) : await castApi.teams.remove(id);
  tokens.set(id, { token: res.restoreToken, name: x.kind === 'agent' ? x.agent.name : x.team.name });
  if (x.kind === 'agent') setQueryData<Agent[]>(KEYS.agents, (l) => (l ?? []).filter((a) => a.id !== id));
  else setQueryData<Team[]>(KEYS.teams, (l) => (l ?? []).filter((t) => t.id !== id));
  await refresh(pid);
}

export async function bringOneBack(pid: string, id: string) {
  const t = tokens.get(id);
  if (!t) throw new Error('It’s in Recently deleted in the Cast.');
  await castApi.restore(t.token);
  tokens.delete(id);
  await refresh(pid);
}

/* ---------- the whole build */
export async function removeAll(pid: string, id: string) {
  const r = await builtApi.undo(pid, id);
  setQueryData<TeamRequest[]>(requestsKey(pid), (l) => (l ?? []).map((x) => (x.id === id ? r : x)));
  await refresh(pid);
}
export async function bringAllBack(pid: string, id: string) {
  const r = await builtApi.restore(pid, id);
  setQueryData<TeamRequest[]>(requestsKey(pid), (l) => (l ?? []).map((x) => (x.id === id ? r : x)));
  await refresh(pid);
}
