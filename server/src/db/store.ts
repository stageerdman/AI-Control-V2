/* The store: every repository wired to one db. Routes get this, nothing else. */
import { agentsRepo } from './agents.ts';
import { type Db, tx } from './connection.ts';
import { credentialsRepo } from './credentials.ts';
import { draftsRepo } from './drafts.ts';
import { projectsRepo } from './projects.ts';
import { rolesRepo } from './roles.ts';
import { teamsRepo } from './teams.ts';
import { trashRepo } from './trash.ts';

export function createStore(db: Db, opts: { sandbox: string }) {
  const roles = rolesRepo(db);
  const agents = agentsRepo(db, roles);
  const teams = teamsRepo(db, agents);
  const projects = projectsRepo(db, { agents, teams, sandbox: opts.sandbox });
  const drafts = draftsRepo(db, { agents, teams, sandbox: opts.sandbox });
  const trash = trashRepo(db, { roles, agents, teams, projects, drafts });
  const credentials = credentialsRepo(db);
  return {
    db,
    tx: <T>(fn: () => T): T => tx(db, fn),
    roles,
    agents,
    teams,
    projects,
    drafts,
    trash,
    credentials,
  };
}
export type Store = ReturnType<typeof createStore>;
