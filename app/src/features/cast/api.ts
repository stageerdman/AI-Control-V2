/* Cast endpoints — the shared studio.* ones plus what only the Cast needs (reporter switches,
   re-adding a member at its old place for Undo). Query keys: 'agents' · 'roles' · 'teams'. */
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
};

export const KEYS = { agents: 'agents', roles: 'roles', teams: 'teams' } as const;
