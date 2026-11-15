/* Delete-with-undo. Deleting a role, team or draft hard-deletes it (so every
   other query stays simple). Deleting an AGENT only hides its row (deleted_at),
   so nothing cascades and its chats, work and comms stay linked to the same id;
   every agent read skips hidden rows. Each delete files a JSON snapshot under a
   one-shot restore token. POST /trash/:token/restore puts it back as far as the
   studio's rules still allow (e.g. a seat on a team that has since filled up is
   skipped). Tokens expire after TRASH_TTL_MS; only then is a hidden agent row
   hard-deleted. */
import { randomUUID } from 'node:crypto';
import { assertCanDelete, replacementOrchestrator } from '../domain/cast.ts';
import type { Look } from '../domain/look.ts';
import { addMember, buildRoster, type Member, removeMember } from '../domain/teams.ts';
import { AppError, conflict, notFound } from '../errors.ts';
import type { AgentRecord, AgentsRepo } from './agents.ts';
import { type Db, tx } from './connection.ts';
import type { DraftRecord, DraftsRepo } from './drafts.ts';
import type { ProjectsRepo } from './projects.ts';
import type { RoleRecord, RolesRepo } from './roles.ts';
import { runsRepo } from './runs.ts';
import type { TeamRecord, TeamsRepo } from './teams.ts';
import { exists, now, row, rows } from './util.ts';

export const TRASH_TTL_MS = 30 * 24 * 3600 * 1000;

/** A row of the Cast's "Recently deleted" list. */
export type DeletedAgent = {
  token: string;
  id: string;
  name: string;
  role: string;
  look: Look;
  deletedAt: string;
  /** deletedAt + TRASH_TTL_MS: when the agent can no longer be restored (its past chats stay as history). */
  expiresAt: string;
  /** How many chats (runs) come back with it. */
  chats: number;
};
type TrashRow = { token: string; kind: Kind; item_id: string; payload: string; created_at: string };

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
/** `seatsLost`: team names whose seat a restored agent could not get back (the team filled up). */
export type Restored = { restored: { kind: Kind; id: string }; seatsLost?: string[] };

type Repos = {
  roles: RolesRepo;
  agents: AgentsRepo;
  teams: TeamsRepo;
  projects: ProjectsRepo;
  drafts: DraftsRepo;
};

export function trashRepo(db: Db, r: Repos) {
  const cutoff = () => new Date(Date.now() - TRASH_TTL_MS).toISOString();
  const isLive = (t: Pick<TrashRow, 'created_at'>) => t.created_at >= cutoff();

  /** Expired tokens go, and with them the hidden agent rows they kept — unless a newer token still keeps it. */
  const purge = () => {
    const before = cutoff();
    const expired = rows<{ item_id: string }>(
      db
        .prepare(
          `SELECT item_id FROM trash WHERE kind = 'agent' AND created_at < ?1
           AND item_id NOT IN (SELECT item_id FROM trash WHERE kind = 'agent' AND created_at >= ?1)`,
        )
        .all(before),
    );
    for (const { item_id } of expired) if (r.agents.hiddenRecord(item_id)) r.agents.deleteRecord(item_id);
    db.prepare('DELETE FROM trash WHERE created_at < ?').run(before);
  };

  const file = (kind: Kind, id: string, payload: unknown): Deleted => {
    purge();
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
  const unlink = (kind: 'teams' | 'agents', id: string, at: { projectId: string }[]) => {
    for (const { projectId } of at)
      r.projects.setLinks(
        projectId,
        kind,
        r.projects.links(projectId, kind).filter((x) => x !== id),
      );
  };

  /* ------------------------------------------------------------ delete */
  const trashAgent = (id: string): Deleted =>
    tx(db, () => {
      const agent = r.agents.record(id);
      if (!agent) throw notFound('Agent', id);
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
      unlink('agents', id, specialistOn);
      r.agents.hide(id, now());
      return file('agent', id, { agent, seats, specialistOn, handedOver } satisfies AgentSnap);
    });

  const trashRole = (id: string): Deleted =>
    tx(db, () => {
      const role = r.roles.record(id);
      if (!role) throw notFound('Role', id);
      // hidden agents too, so a trashed agent restored later still gets its role back
      const agentIds = rows<{ id: string }>(
        db.prepare('SELECT id FROM agents WHERE role_id = ?').all(id),
      ).map((a) => a.id);
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
  /** Un-hide the row; a snapshot filed before soft delete (row hard-deleted) is re-inserted instead. */
  const bringBackRecord = (agent: AgentRecord) => {
    if (r.agents.hiddenRecord(agent.id)) return r.agents.unhide(agent.id);
    if (exists(db, 'agents', agent.id)) throw conflict(`An agent with id '${agent.id}' exists again`);
    const roleId = agent.role_id && exists(db, 'roles', agent.role_id) ? agent.role_id : null;
    r.agents.insertRecord({ ...agent, role_id: roleId });
  };

  /** Returns the names of teams whose seat could not come back (the team filled up meanwhile). */
  const restoreAgent = ({ agent, seats, specialistOn, handedOver }: AgentSnap): string[] => {
    bringBackRecord(agent);
    const ref = { id: agent.id, kind: agent.kind };
    const seatsLost: string[] = [];
    for (const s of seats) {
      if (!exists(db, 'teams', s.teamId)) continue;
      const roster = r.teams.roster(s.teamId);
      try {
        let next = addMember(roster, ref, s.member.instr, Math.min(s.index, roster.members.length));
        if (s.wasCaptain) next = { ...next, captainId: agent.id };
        r.teams.saveRoster(s.teamId, next);
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // team filled up meanwhile → seat skipped
        seatsLost.push(r.teams.record(s.teamId)?.name ?? s.teamId);
      }
    }
    relink('agents', agent.id, specialistOn);
    if (handedOver) {
      r.projects.reassignOrchestrator(handedOver.to, agent.id, handedOver.projects);
      r.drafts.reassignOrchestrator(handedOver.to, agent.id, handedOver.drafts);
    }
    return seatsLost;
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
      purge();
      const t = row<TrashRow>(db.prepare('SELECT * FROM trash WHERE token = ?').get(token));
      if (!t || !isLive(t)) throw notFound('Restore token', token);
      const p = JSON.parse(t.payload);
      let seatsLost: string[] = [];
      if (t.kind === 'agent') seatsLost = restoreAgent(p);
      else if (t.kind === 'role') restoreRole(p);
      else if (t.kind === 'team') restoreTeam(p);
      else restoreDraft(p);
      db.prepare('DELETE FROM trash WHERE token = ?').run(token);
      const restored = { kind: t.kind, id: t.item_id };
      return seatsLost.length ? { restored, seatsLost } : { restored };
    });

  /* ------------------------------------------------------------ list */
  const toDeletedAgent = (t: TrashRow): DeletedAgent => {
    const { agent } = JSON.parse(t.payload) as AgentSnap;
    return {
      token: t.token,
      id: agent.id,
      name: agent.name,
      role: r.agents.roleLabel(agent),
      look: JSON.parse(agent.look) as Look,
      deletedAt: t.created_at,
      expiresAt: new Date(Date.parse(t.created_at) + TRASH_TTL_MS).toISOString(),
      chats: runsRepo(db).countByAgent(agent.id),
    };
  };

  /** Agents in the trash that can still come back, newest first (one already back in the Cast is left out). */
  const deletedAgents = (): DeletedAgent[] => {
    purge();
    return rows<TrashRow>(
      db
        .prepare(
          "SELECT * FROM trash WHERE kind = 'agent' AND created_at >= ? ORDER BY created_at DESC, rowid DESC",
        )
        .all(cutoff()),
    )
      .filter((t) => !r.agents.record(t.item_id))
      .map(toDeletedAgent);
  };

  return { trashAgent, trashRole, trashTeam, trashDraft, restore, deletedAgents, purge };
}
export type TrashRepo = ReturnType<typeof trashRepo>;
