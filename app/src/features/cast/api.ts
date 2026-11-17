/* Cast endpoints — the shared studio.* ones plus what only the Cast needs (reporter switches,
   re-adding a member at its old place for Undo), Tinker's design chats, Recently deleted.
   Query keys: 'agents' · 'roles' · 'teams' · 'creator-sessions' · 'trash-agents'. */
import { http, studio } from '../../api';
import type { Agent, Restored, Role, Team, TeamWorkflow } from '../../api/types';

const e = encodeURIComponent;

/** An agent in the trash: hidden, kept 30 days, restorable with its token (GET /trash/agents). */
export type DeletedAgent = {
  token: string;
  id: string;
  name: string;
  role: string;
  look: Agent['look'];
  deletedAt: string;
  expiresAt: string;
  chats: number;
};
/** The restore reply; `seatsLost` (team names) if a seat filled up meanwhile — optional, older servers omit it. */
export type AgentRestored = Restored & { seatsLost?: string[] };

/** Recently deleted agents, newest first. */
export const listDeletedAgents = () =>
  http.get<{ items: DeletedAgent[] }>('/trash/agents').then((r) => r.items);
/** Bring a deleted agent back (same token as the delete's Undo). */
export const restoreAgent = (token: string) => studio.restore(token) as Promise<AgentRestored>;

export const castApi = {
  agents: studio.agents,
  roles: {
    ...studio.roles,
    /** "Files reports": agents holding this role may file reports. */
    setReporter: (id: string, reporter: boolean) => http.patch<Role>(`/roles/${e(id)}`, { reporter }),
    setToolsmith: (id: string, toolsmith: boolean) => http.patch<Role>(`/roles/${e(id)}`, { toolsmith }),
  },
  teams: {
    ...studio.teams,
    /** Undo after a remove: put the member back where it stood (0-based). */
    readd: (id: string, agentId: string, instr: string, at: number) =>
      http.post<Team>(`/teams/${e(id)}/members`, { agentId, instr, at }),
    /** The team's own way (null = none). */
    workflow: (id: string) => http.get<{ workflow: TeamWorkflow | null }>(`/teams/${e(id)}/workflow`),
    /** Save it whole (`null` clears it); 422 / 409 details pin to `workflow.…`. */
    saveWorkflow: (id: string, w: TeamWorkflow | null) =>
      http.put<{ workflow: TeamWorkflow | null }>(`/teams/${e(id)}/workflow`, {
        workflow: w && (({ scope: _s, teamId: _t, ...rest }) => rest)(w),
      }),
  },
  restore: studio.restore,
  /** Design a new agent with Tinker (saved chats with a live draft). */
  tinker: studio.creatorChat,
};

export const KEYS = {
  agents: 'agents',
  roles: 'roles',
  teams: 'teams',
  tinker: 'creator-sessions',
  deleted: 'trash-agents',
} as const;
