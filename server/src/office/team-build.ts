/* One-Step Team Building: the Agent Creator turns one approved request into Cast agents plus a staffed project team.
   build: the team design (a TeamDef: new agents inline, Cast agents by id, one captain) is checked against the
   studio's rules and its look rules, then — all in one transaction — its new agents and roles join the Cast, the team
   is created and put on the project, and the request records what it built. The director's chat gets one line.
   undo: everything one request built goes to the trash (restorable there), and the request says so. */
import { type Design, type Minted, unstring } from '../crew/creator.ts';
import type { Agent } from '../db/agents.ts';
import { castView } from '../db/drafts.ts';
import type { Store } from '../db/store.ts';
import type { Built, TeamRequest, TeamRequestsRepo } from '../db/team-requests.ts';
import type { Team } from '../db/teams.ts';
import { type TeamDef, TeamDefSchema, teamDefIssues } from '../domain/creator.ts';
import { type MemberLook, teamLookIssues } from '../domain/team-looks.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import type { Staffing } from './staffing.ts';

export type TeamBuildDeps = {
  store: Store;
  requests: TeamRequestsRepo;
  events: EventLog;
  staffing: Staffing;
  /** The Agent Creator's persist (crew/creator.ts): roles reused by name, agents and the team created. */
  persist: (designs: Design[]) => Minted & { ids: string[] };
  /** A line in the director's chat (threads.record as the director), carrying the request: the chat's card. */
  tellDirector: (projectId: string, directorId: string, text: string, requestId: string) => void;
};
export type BuildResult = { request: TeamRequest; team: Team; agents: Agent[]; line: string };

const key = (s: string) => s.trim().toLowerCase();

/** The design, or a refusal listing everything to fix (so the Agent Creator can fix it all and call again). */
function checkedDesign(store: Store, input: unknown): TeamDef {
  const r = TeamDefSchema.safeParse(unstring(input));
  if (!r.success)
    throw invalid(
      `Not yet — fix this and call again:\n${r.error.issues.map((i) => `- ${i.path.join('.') || 'team'}: ${i.message}`).join('\n')}`,
    );
  const def = r.data;
  const issues = [
    ...teamDefIssues(def, {
      agentNames: store.agents.records().map((a) => a.name),
      teamNames: store.teams.list().map((t) => t.name),
      agent: castView(store.agents, store.teams).agent,
    }),
    ...teamLookIssues(
      def.members.flatMap((m): MemberLook[] => {
        if ('newAgent' in m) {
          const { name, look } = m.newAgent;
          return [{ name, look, fresh: true, captain: key(name) === key(def.captain) }];
        }
        const a = store.agents.get(m.agentId);
        return a ? [{ name: a.name, look: a.look, fresh: false, captain: a.id === def.captain }] : [];
      }),
    ),
  ];
  if (issues.length)
    throw invalid(`Not yet — fix this and call again:\n${issues.map((i) => `- ${i}`).join('\n')}`);
  return def;
}

function requireOpen(requests: TeamRequestsRepo, projectId: string, id: string): TeamRequest {
  const req = requests.get(id);
  if (!req || req.projectId !== projectId) throw notFound('Approved team request', id);
  if (req.built && !req.undoneAt)
    throw conflict(`Request ${id} is already built — change its team and agents in the Cast instead`);
  return req;
}

export function createTeamBuild(deps: TeamBuildDeps) {
  const { store, requests, events } = deps;
  const name = (id: string) => store.agents.get(id)?.name ?? id;

  /** "Marina (Storyteller, captain) and Slidewright (Presentation Creator). They’re in the Cast and on …" */
  const summary = (team: Team): string => {
    const people = team.members.map((m) => {
      const a = store.agents.get(m.agentId);
      const tags = [a?.role, m.agentId === team.captainId ? 'captain' : ''].filter(Boolean).join(', ');
      return `${a?.name ?? m.agentId}${tags ? ` (${tags})` : ''}`;
    });
    const list =
      people.length > 1 ? `${people.slice(0, -1).join(', ')} and ${people.at(-1)}` : people.join('');
    return `${list}. They’re in the Cast and on this project. Change them in the Cast, or undo the whole build.`;
  };

  function build(projectId: string, requestId: string, byId: string, input: unknown): BuildResult {
    const req = requireOpen(requests, projectId, requestId);
    const def = checkedDesign(store, input);
    const { minted, built } = store.tx(() => {
      const minted = deps.persist([{ kind: 'team', brief: req.work, def }]);
      const team = minted.teams[0] as Team;
      deps.staffing.apply(projectId, { teams: [team.name] }, req.directorId);
      const built: Built = {
        teamId: team.id,
        agentIds: minted.agents.map((a) => a.id),
        roleIds: minted.roles.map((r) => r.id),
      };
      requests.markBuilt(req.id, built);
      return { minted, built };
    });
    const created = (kind: 'agent' | 'team' | 'role', id: string, n: string) =>
      events.append('project', projectId, { type: 'cast.created', payload: { kind, id, name: n, by: byId } });
    for (const r of minted.roles) created('role', r.id, r.name);
    for (const a of minted.agents) created('agent', a.id, a.name);
    const team = store.teams.get(built.teamId) as Team;
    created('team', team.id, team.name);
    const agents = built.agentIds.map((id) => store.agents.require(id));
    const line = `${name(byId)} built ${team.name} for you: ${summary(team)}`;
    deps.tellDirector(projectId, req.directorId, line, req.id);
    return { request: requests.get(req.id) as TeamRequest, team, agents, line };
  }

  /** Take back everything one request built: the team and its new agents and roles go to the trash. */
  function undo(projectId: string, requestId: string): TeamRequest {
    const req = requests.get(requestId);
    if (!req || req.projectId !== projectId) throw notFound('Approved team request', requestId);
    if (!req.built || req.undoneAt) throw conflict('Nothing to undo: this request has no build standing');
    const built = req.built;
    const onProject = store.projects.require(projectId).teamIds.includes(built.teamId);
    const members = store.teams.get(built.teamId)?.members.map((m) => m.agentId) ?? [];
    store.tx(() => {
      const tokens: string[] = [];
      if (store.teams.get(built.teamId)) tokens.push(store.trash.trashTeam(built.teamId).restoreToken);
      for (const id of built.agentIds)
        if (store.agents.get(id)) tokens.push(store.trash.trashAgent(id).restoreToken);
      const inUse = new Set(store.agents.list().map((a) => a.roleId));
      for (const id of built.roleIds)
        if (!inUse.has(id) && store.roles.get(id)) tokens.push(store.trash.trashRole(id).restoreToken);
      requests.markUndone(req.id, { ...built, restoreTokens: tokens });
    });
    staffChanged(projectId, { added: [], removed: onProject ? members : [] });
    return requests.get(req.id) as TeamRequest;
  }

  const staffChanged = (projectId: string, d: { added: string[]; removed: string[] }) => {
    const p = store.projects.require(projectId);
    events.append('project', projectId, {
      type: 'staff.changed',
      payload: { teamIds: p.teamIds, agentIds: p.agentIds, ...d },
    });
  };

  /** Undo the undo: bring back what `undo` put in the trash (roles, then agents, then the team with its seats). */
  function restore(projectId: string, requestId: string): TeamRequest {
    const req = requests.get(requestId);
    if (!req || req.projectId !== projectId) throw notFound('Approved team request', requestId);
    const tokens = req.built?.restoreTokens;
    if (!req.built || !req.undoneAt || !tokens) throw conflict('Nothing to bring back: this build is standing');
    const { restoreTokens: _, ...built } = req.built;
    store.tx(() => {
      for (const t of [...tokens].reverse()) store.trash.restore(t);
      requests.markRestored(req.id, built);
    });
    const team = store.teams.get(built.teamId);
    staffChanged(projectId, { added: team?.members.map((m) => m.agentId) ?? [], removed: [] });
    return requests.get(req.id) as TeamRequest;
  }

  return { build, undo, restore, list: (projectId: string) => requests.list(projectId) };
}
export type TeamBuild = ReturnType<typeof createTeamBuild>;
