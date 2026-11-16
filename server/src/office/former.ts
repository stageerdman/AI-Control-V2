/* Who is on a project now, and who used to be (spec-ux-team-rebuild §1: bring someone back as a specialist).
   "Used to be" comes from the project's own staffing history: every `staff.changed` (staffing and rebuilds) and
   `room.left` (rebuilds). A help call's `room.joined` is not staffing, so it doesn't count. */
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';

/** Everyone on the project: its teams' members and its specialists. */
export function staffIds(store: Store, projectId: string): Set<string> {
  const p = store.projects.require(projectId);
  const onTeams = p.teamIds.flatMap((t) => store.teams.get(t)?.members.map((m) => m.agentId) ?? []);
  return new Set([...onTeams, ...p.agentIds]);
}

type Staffed = {
  agentId?: string;
  agentIds?: string[];
  added?: string[];
  removed?: string[];
  moved?: string[];
};
const named = (e: Staffed) => [
  ...(e.agentId ? [e.agentId] : []),
  ...(e.removed ?? []),
  ...(e.added ?? []),
  ...(e.moved ?? []),
  ...(e.agentIds ?? []),
];

/** Cast agents who were staff here once and aren't now, most recently seen first. */
export function formerStaff(store: Store, projectId: string): Agent[] {
  const here = staffIds(store, projectId);
  const director = store.projects.require(projectId).orchestratorId;
  const events = rows<{ payload: string }>(
    store.db
      .prepare(
        "SELECT payload FROM events WHERE scope = 'project' AND scope_id = ? AND type IN ('staff.changed', 'room.left') ORDER BY id DESC",
      )
      .all(projectId),
  );
  const seen = new Map<string, Agent>();
  for (const e of events)
    for (const id of named(JSON.parse(e.payload) as Staffed)) {
      if (seen.has(id) || here.has(id) || id === director) continue;
      const a = store.agents.get(id);
      if (a?.kind === 'agent') seen.set(id, a);
    }
  return [...seen.values()];
}
