/* HOME "Today": the projects the user gave work today — not the ones agents kept busy. The user's hand is the
   HTTP API (agents reach the studio through /internal routes and their own tools; an agent answering an ask goes
   through runtime.answer directly), so a short allowlist of user actions stamps the project when it succeeds.
   Reads, office visits and "seen" marks are not on it, so opening an office never counts. */
import type { FastifyInstance, FastifyRequest } from 'fastify';

type Params = Record<string, string | undefined>;
/** Which project a user action belongs to (null = none we know). */
type ProjectOf = (params: Params) => string | null | undefined;

export type UserActivityDeps = {
  /** The project a run belongs to (chat routes carry only the run id). */
  projectOfRun: (runId: string) => string | null;
  markUserActive: (projectId: string) => void;
};

/** `METHOD /route/pattern` → its project. Each one is something only the user does. */
export function userActions(projectOfRun: UserActivityDeps['projectOfRun']): Map<string, ProjectOf> {
  const byProject: ProjectOf = (p) => p.id;
  const byRun: ProjectOf = (p) => (p.runId ? projectOfRun(p.runId) : null);
  return new Map<string, ProjectOf>([
    ['POST /projects/:id/threads/:agentId/messages', byProject], // a message to the orchestrator or any agent
    ['POST /projects/:id/work', byProject], // a goal
    ['POST /projects/:id/runs', byProject], // a task started by hand
    ['POST /projects/:id/asks/:askId/answer', byProject], // an answer to an agent's question
    ['POST /chats/:runId/messages', byRun], // a follow-up in a past chat
    ['POST /chats/:runId/start', byRun], // "Start it" on work a chat offered
  ]);
}

const actionKey = (req: FastifyRequest) => `${req.method} ${req.routeOptions.url ?? ''}`;

/** Stamps the project on every successful user action. onSend: done before the reply leaves, so a client that
    reads the projects right after its action already sees the stamp. */
export function trackUserActivity(app: FastifyInstance, deps: UserActivityDeps): void {
  const actions = userActions(deps.projectOfRun);
  app.addHook('onSend', async (req, reply, payload) => {
    if (reply.statusCode >= 300) return payload;
    const projectOf = actions.get(actionKey(req));
    const projectId = projectOf?.(req.params as Params);
    if (projectId) deps.markUserActive(projectId);
    return payload;
  });
}
