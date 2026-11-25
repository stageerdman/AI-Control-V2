/* `/projects/:id/agents/:agentId/…`: an agent's work is only ever read inside one project. The agent is known
   while it is in the Cast or has a chat in this project (a run's history outlives its agent). */
import { z } from 'zod';
import { type AgentInProject, latestAgentChat } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { notFound, parse } from '../errors.ts';
import { Id } from './schemas.ts';

export const AgentInProjectParams = z.object({ id: Id, agentId: Id });

/** The (project, agent) a request names; 404 for an unknown project or agent. */
export function agentInProject(db: Db, store: Store, params: unknown): AgentInProject {
  const { id: projectId, agentId } = parse(AgentInProjectParams, params);
  if (!store.projects.get(projectId)) throw notFound('Project', projectId);
  const who = { projectId, agentId };
  if (!store.agents.get(agentId) && !latestAgentChat(db, who)) throw notFound('Agent', agentId);
  return who;
}
