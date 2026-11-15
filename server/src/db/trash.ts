/* Delete-with-undo. Deleting an agent, role, team or draft hard-deletes it (so
   every other query stays simple) and files a JSON snapshot under a one-shot
   restore token. POST /trash/:token/restore puts it back as far as the studio's
   rules still allow (e.g. a seat on a team that has since filled up is skipped).
   Tokens expire after TRASH_TTL_MS. */
import { randomUUID } from 'node:crypto';
import { assertCanDelete, replacementOrchestrator } from '../domain/cast.ts';
import { addMember, buildRoster, type Member, removeMember } from '../domain/teams.ts';
import { AppError, conflict, notFound } from '../errors.ts';
import type { AgentRecord, AgentsRepo } from './agents.ts';
import { type Db, tx } from './connection.ts';
import type { DraftRecord, DraftsRepo } from './drafts.ts';
import type { ProjectsRepo } from './projects.ts';
import type { RoleRecord, RolesRepo } from './roles.ts';
import type { RunsRepo } from './runs.ts';
import type { TeamRecord, TeamsRepo } from './teams.ts';
import { exists, now, row } from './util.ts';

export const TRASH_TTL_MS = 7 * 24 * 3600 * 1000;

type Kind = 'agent' | 'role' | 'team' | 'draft';
export type AgentSnap = {
  agent: AgentRecord;
  seats: { teamId: string; index: number; member: Member; wasCaptain: boolean }[];
  specialistOn: { projectId: string; index: number }[];
  handedOver: { to: string; projects: string[]; drafts: string[] } | null;
};
type RoleSnap = { role: RoleRecord; agentIds: string[] };
type TeamSnap = { team: TeamRecord; members: Member[]; projects: { projectId: string; index: number }[] };
type DraftSnap = { draft: DraftRecord };

export type Deleted = { deleted: { kind: Kind; id: string }; restoreToken: string };
export type Restored = { restored: { kind: Kind; id: string } };
/** A running session that keeps an agent from being deleted. */
export type BusySession = { runId: string; projectId: string; projectName: string; task: string; startedAt: string };
export type AgentBusy = { busy: boolean; sessions: BusySession[] };

type Repos = {
  roles: RolesRepo;
  agents: AgentsRepo;
  teams: TeamsRepo;
  projects: ProjectsRepo;
  drafts: DraftsRepo;
  runs: RunsRepo;
};

export function trashRepo(db: Db, r: Repos) {
  const file = (kind: Kind, id: string, payload: unknown): Deleted => {
    db.prepare('DELETE FROM trash WHERE created_at < ?').run(
      new Date(Date.now() - TRASH_TTL_MS).toISOString(),
    );
    const token = randomUUID();
    db.prepare('INSERT INTO trash (token, kind, item_id, payload, created_at) VALUES (?, ?, ?, ?, ?)').run(
      token,
      kind,
      id,
      JSON.stringify(payload),
      now(),
    );
    return { deleted: { kind, id }, restoreToken: token };
  };
  const projectsWith = (kind: 'teams' | 'agents', id: string) =>
    r.projects
      .list()
      .map((p) => ({ projectId: p.id, index: (kind === 'teams' ? p.teamIds : p.agentIds).indexOf(id) }))
      .filter((x) => x.index >= 0);
  const relink = (kind: 'teams' | 'agents', id: string, at: { projectId: string; index: number }[]) => {
    for (const { projectId, index } of at) {
      if (!exists(db, 'projects', projectId)) continue;
      const ids = r.projects.links(projectId, kind);
      if (ids.includes(id)) continue;
      ids.splice(Math.min(index, ids.length), 0, id);
      r.projects.setLinks(projectId, kind, ids);
    }
  };

  /* ------------------------------------------------------------ busy */
  const busySessions = (agentId: string): BusySession[] =>
    r.runs.runningForAgent(agentId).map((run) => ({
      runId: run.id,
      projectId: run.projectId,
      projectName: r.projects.get(run.projectId)?.name ?? run.projectId,
      task: run.task,
      startedAt: run.startedAt,
    }));

  const agentBusy = (id: string): AgentBusy => {
    if (!r.agents.record(id)) throw notFound('Agent', id);
    const sessions = busySessions(id);
    return { busy: sessions.length > 0, sessions };
  };

  /* checked before anything moves, so a busy agent is never partly trashed */
  const assertNotBusy = (agent: AgentRecord) => {
    const sessions = busySessions(agent.id);
    if (sessions.length === 0) return;
    throw new AppError(
      'agent_busy',
      `${agent.name} is working in a running session right now. You can delete them when it ends.`,
      { sessions },
    );
  };

  /* ------------------------------------------------------------ delete */
  const trashAgent = (id: string): Deleted =>
    tx(db, () => {
      const agent = r.agents.record(id);
      if (!agent) throw notFound('Agent', id);
      assertNotBusy(agent);
      const cast = r.agents.records();
      assertCanDelete(agent, cast);

      let handedOver: AgentSnap['handedOver'] = null;
      if (agent.kind === 'orchestrator') {
        const to = replacementOrchestrator(agent, cast) as string; // ≥2 exist, checked above
        handedOver = {
          to,
          projects: r.projects.reassignOrchestrator(id, to),
          drafts: r.drafts.reassignOrchestrator(id, to),
        };
      }
      const seats: AgentSnap['seats'] = [];
      for (const t of r.teams.list()) {
        const rem = removeMember({ captainId: t.captainId, members: t.members }, id);
        if (!rem) continue;
        r.teams.saveRoster(t.id, rem.team);
        seats.push({ teamId: t.id, index: rem.index, member: rem.member, wasCaptain: rem.wasCaptain });
      }
      const specialistOn = projectsWith('agents', id);
      r.agents.deleteRecord(id);
      return file('agent', id, { agent, seats, specialistOn, handedOver } satisfies AgentSnap);
    });

  const trashRole = (id: string): Deleted =>
    tx(db, () => {
      const role = r.roles.record(id);
      if (!role) throw notFound('Role', id);
      const agentIds = r.agents
        .records()
        .filter((a) => a.role_id === id)
        .map((a) => a.id);
      r.roles.deleteRecord(id);
      return file('role', id, { role, agentIds } satisfies RoleSnap);
    });

  const trashTeam = (id: string): Deleted =>
    tx(db, () => {
      const team = r.teams.record(id);
      if (!team) throw notFound('Team', id);
      const snap: TeamSnap = {
        team,
        members: r.teams.roster(id).members,
        projects: projectsWith('teams', id),
      };
      r.teams.deleteRecord(id);
      return file('team', id, snap);
    });

  const trashDraft = (id: string): Deleted =>
    tx(db, () => {
      const draft = r.drafts.record(id);
      if (!draft) throw notFound('Draft', id);
      r.drafts.deleteRecord(id);
      return file('draft', id, { draft } satisfies DraftSnap);
    });

  /* ------------------------------------------------------------ restore */
  const restoreAgent = ({ agent, seats, specialistOn, handedOver }: AgentSnap) => {
    if (exists(db, 'agents', agent.id)) throw conflict(`An agent with id '${agent.id}' exists again`);
    const roleId = agent.role_id && exists(db, 'roles', agent.role_id) ? agent.role_id : null;
    r.agents.insertRecord({ ...agent, role_id: roleId });
    const ref = { id: agent.id, kind: agent.kind };
    for (const s of seats) {
      if (!exists(db, 'teams', s.teamId)) continue;
      const roster = r.teams.roster(s.teamId);
      try {
        let next = addMember(roster, ref, s.member.instr, Math.min(s.index, roster.members.length));
        if (s.wasCaptain) next = { ...next, captainId: agent.id };
        r.teams.saveRoster(s.teamId, next);
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // team filled up meanwhile → seat skipped
      }
    }
    relink('agents', agent.id, specialistOn);
    if (handedOver) {
      r.projects.reassignOrchestrator(handedOver.to, agent.id, handedOver.projects);
      r.drafts.reassignOrchestrator(handedOver.to, agent.id, handedOver.drafts);
    }
  };

  const restoreRole = ({ role, agentIds }: RoleSnap) => {
    if (exists(db, 'roles', role.id)) throw conflict(`A role with id '${role.id}' exists again`);
    if (r.roles.nameTaken(role.name_key)) throw conflict(`A role named '${role.name}' exists again`);
    r.roles.insertRecord(role);
    const upd = db.prepare('UPDATE agents SET role_id = ? WHERE id = ? AND role_id IS NULL');
    for (const a of agentIds) upd.run(role.id, a);
  };

  const restoreTeam = ({ team, members, projects }: TeamSnap) => {
    if (exists(db, 'teams', team.id)) throw conflict(`A team with id '${team.id}' exists again`);
    const alive = members.filter((m) => r.agents.record(m.agentId));
    const captain = alive.some((m) => m.agentId === team.captain_id) ? team.captain_id : null;
    const roster = buildRoster(
      alive.map((m) => ({ agent: r.agents.ref(m.agentId), instr: m.instr })),
      captain,
    );
    r.teams.insertRecord({ ...team, captain_id: null });
    r.teams.saveRoster(team.id, roster);
    relink('teams', team.id, projects);
  };

  const restoreDraft = ({ draft }: DraftSnap) => {
    if (exists(db, 'drafts', draft.id)) throw conflict(`A draft with id '${draft.id}' exists again`);
    const orch =
      draft.orchestrator_id && r.agents.record(draft.orchestrator_id) ? draft.orchestrator_id : null;
    r.drafts.insertRecord({ ...draft, orchestrator_id: orch });
  };

  const restore = (token: string): Restored =>
    tx(db, () => {
      const t = row<{ kind: Kind; item_id: string; payload: string; created_at: string }>(
        db.prepare('SELECT kind, item_id, payload, created_at FROM trash WHERE token = ?').get(token),
      );
      if (!t || Date.parse(t.created_at) < Date.now() - TRASH_TTL_MS) throw notFound('Restore token', token);
      const p = JSON.parse(t.payload);
      if (t.kind === 'agent') restoreAgent(p);
      else if (t.kind === 'role') restoreRole(p);
      else if (t.kind === 'team') restoreTeam(p);
      else restoreDraft(p);
      db.prepare('DELETE FROM trash WHERE token = ?').run(token);
      return { restored: { kind: t.kind, id: t.item_id } };
    });

  return { agentBusy, trashAgent, trashRole, trashTeam, trashDraft, restore };
}
export type TrashRepo = ReturnType<typeof trashRepo>;
