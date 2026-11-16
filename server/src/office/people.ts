/* Who is who, as the director (or voice) says it: an agent by name, and where someone sits on a project. Shared
   by the office chat (threads.ts) and the director's tools (stop, ask, features). */
import type { Agent } from '../db/agents.ts';
import type { Project } from '../db/projects.ts';
import type { Store } from '../db/store.ts';
import { conflict } from '../errors.ts';

/** An agent by name, nick or id, as the director (or voice) says it. */
export function agentByName(store: Store, said: string): Agent | undefined {
  const k = said.trim().toLowerCase();
  return store.agents
    .list()
    .find((a) => a.name.toLowerCase() === k || a.nick?.toLowerCase() === k || a.id === said.trim());
}

export type Seat = { agent: Agent; teamId: string | null; orchestrator: boolean };

/** Who the user may talk to here: the orchestrator, a specialist, a member of a project team, or a guest. */
export function seatOf(store: Store, p: Project, agentId: string): Seat {
  const agent = store.agents.require(store.agents.ref(agentId).id);
  if (agent.id === p.orchestratorId) return { agent, teamId: null, orchestrator: true };
  const teamId = p.teamIds.find((t) => store.teams.get(t)?.members.some((m) => m.agentId === agent.id));
  if (teamId) return { agent, teamId, orchestrator: false };
  if (p.agentIds.includes(agent.id)) return { agent, teamId: null, orchestrator: false };
  if (store.guests.get(p.id, agent.id)) return { agent, teamId: null, orchestrator: false }; // brought in by the user
  throw conflict(`${agent.name} isn’t on ${p.name}`, { agentId: agent.id });
}

/** Seat a Cast agent handed work in a call (a side quest) as a guest the director may plan with; staff stay as they are. */
export function seatForWork(store: Store, projectId: string, agentId: string, brief: string): void {
  const p = store.projects.require(projectId);
  try {
    seatOf(store, p, agentId);
    return;
  } catch {
    /* not on the project yet: seated below */
  }
  store.guests.put({ projectId, agentId, brief: brief.slice(0, 2000), orchestratorMay: true });
}
