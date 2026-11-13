/* The office on load (U1): who sits where — the project's orchestrator (the director), its teams
   (members + captain) and solo specialists, in the office-config shape the scene's layout reads
   (prototype spec-office-config.md) — plus each agent's latest status, so the scene renders right
   before the live stream takes over (open it with `?after=lastEventId`).

   Latest status = the last `agent.status` event per agent, corrected for what can't still be true:
   a "working"/"waiting" whose run has ended, or that predates this server's start, reads "idle". */
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';
import type { EventPayload } from '../domain/events.ts';
import type { Progress } from './lifecycle.ts';

type Status = EventPayload<'agent.status'>;
export type AgentState = {
  status: Status['status'];
  activity?: Status['activity'];
  runId?: string;
  /** When this status was reported (absent = never). */
  since?: string;
};
export type OfficeTeam = {
  id: string;
  name: string;
  color: string;
  emblem: string;
  captain: string | null;
  members: string[];
};
export type Office = {
  project: string;
  name: string;
  director: string;
  teams: OfficeTeam[];
  solo: string[];
  agents: Record<string, AgentState>;
  /** live / needs / idle (moves on its own) — or the user's draft / archived. */
  status: string;
  /** Overall progress: features shipped / total (else the current goal's %), the target label, the current goal. */
  progress: Progress | null;
  /** Open the project's event stream with ?after= this id to continue from here without gaps. */
  lastEventId: number;
};

export function createOffice(deps: {
  db: Db;
  store: Store;
  bootedAt?: string;
  progressOf?: (projectId: string) => Progress;
}) {
  const { db, store } = deps;
  const bootedAt = deps.bootedAt ?? new Date().toISOString();

  const latestStatuses = (projectId: string) =>
    rows<{ payload: string; at: string }>(
      db
        .prepare(
          `SELECT payload, at FROM events WHERE id IN (
             SELECT MAX(id) FROM events WHERE scope = 'project' AND scope_id = ? AND type = 'agent.status'
             GROUP BY json_extract(payload, '$.agentId'))`,
        )
        .all(projectId),
    ).map((r) => ({ ...(JSON.parse(r.payload) as Status), at: r.at }));
  const liveRuns = (projectId: string) =>
    new Set(
      rows<{ id: string }>(
        db.prepare("SELECT id FROM runs WHERE project_id = ? AND status = 'running'").all(projectId),
      ).map((r) => r.id),
    );

  return {
    get(projectId: string): Office {
      const p = store.projects.require(projectId);
      const teams: OfficeTeam[] = p.teamIds.flatMap((tid) => {
        const t = store.teams.get(tid);
        if (!t) return [];
        const members = t.members.map((m) => m.agentId);
        return [
          {
            id: t.id,
            name: t.name,
            color: t.color,
            emblem: t.emblem,
            captain: t.captainId && members.includes(t.captainId) ? t.captainId : (members[0] ?? null),
            members,
          },
        ];
      });
      const seated = new Set(teams.flatMap((t) => t.members));
      const solo = p.agentIds.filter((id) => !seated.has(id));
      const everyone = [p.orchestratorId, ...seated, ...solo];

      const live = liveRuns(projectId);
      const last = new Map(latestStatuses(projectId).map((s) => [s.agentId, s]));
      const agents: Record<string, AgentState> = {};
      for (const id of everyone) {
        const s = last.get(id);
        if (!s) {
          agents[id] = { status: 'idle' };
          continue;
        }
        const busy = s.status === 'working' || s.status === 'waiting';
        const stale = busy && (s.runId ? !live.has(s.runId) : s.at < bootedAt);
        agents[id] = stale
          ? { status: 'idle', since: s.at }
          : {
              status: s.status,
              ...(s.activity ? { activity: s.activity } : {}),
              ...(s.runId ? { runId: s.runId } : {}),
              since: s.at,
            };
      }
      const lastEventId =
        (
          db
            .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events WHERE scope = 'project' AND scope_id = ?")
            .get(projectId) as { id: number }
        ).id ?? 0;
      return {
        project: p.id,
        name: p.name,
        director: p.orchestratorId,
        teams,
        solo,
        agents,
        status: p.status,
        progress: deps.progressOf?.(p.id) ?? null,
        lastEventId,
      };
    },
  };
}
export type OfficeView = ReturnType<typeof createOffice>;
