/* Cast endpoints — the shared studio.* ones plus what only the Cast needs (reporter switches,
   re-adding a member at its old place for Undo), Tinker's design chats.
   Query keys: 'agents' · 'roles' · 'teams' · 'creator-sessions'. */
import { http, studio } from '../../api';
import type { Role, Team } from '../../api/types';

const e = encodeURIComponent;

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
  },
  restore: studio.restore,
  /** Design a new agent with Tinker (saved chats with a live draft). */
  tinker: studio.creatorChat,
};

export const KEYS = { agents: 'agents', roles: 'roles', teams: 'teams', tinker: 'creator-sessions' } as const;
