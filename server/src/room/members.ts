/* Who is on a project: the one list the room, the whiteboard and the review gates all read, so a person the room
   shows can always be given work. The orchestrator is always on it, teams or not. */
import type { Store } from '../db/store.ts';

/** The project's members in order — the orchestrator, its team members, its specialists, the user's Cast
    guests — once each, only agents that still exist. Callers who joined a call later are not members. */
export function projectMembers(store: Store, projectId: string): string[] {
  const p = store.projects.require(projectId);
  const ids = new Set<string>([p.orchestratorId]);
  for (const tid of p.teamIds) {
    const t = store.teams.get(tid);
    if (t?.captainId) ids.add(t.captainId);
    for (const m of t?.members ?? []) ids.add(m.agentId);
  }
  for (const id of p.agentIds) ids.add(id);
  for (const id of store.guests.ids(projectId)) ids.add(id);
  return [...ids].filter((id) => store.agents.get(id));
}
