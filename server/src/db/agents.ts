/* Agents repository. Agents are SHARED DEFINITIONS: projects and teams reference
   them by id; each project runs its own copy at run time (no shared memory). */
import {
  type AgentKind,
  assertCanCreate,
  canDelete,
  type DeleteVerdict,
  isSystemKind,
  KIND_LABEL,
  KIND_ORDER,
} from '../domain/cast.ts';
import { slugify, uniqueId } from '../domain/ids.ts';
import { DEFAULT_LOOK, type Look } from '../domain/look.ts';
import type { Toolset } from '../domain/toolset.ts';
import { invalid, notFound } from '../errors.ts';
import type { Db } from './connection.ts';
import type { RolesRepo } from './roles.ts';
import { exists, nextPosition, now, row, rows } from './util.ts';

export type AgentRecord = {
  id: string;
  kind: AgentKind;
  name: string;
  nick: string | null;
  role_id: string | null;
  look: string;
  prompt: string;
  position: number;
  /** STUDIO LIFE: may send mail (absent on rows read before migration 28). */
  can_mail?: number;
  /** JSON Toolset, NULL = the studio's full kit (absent on rows read before migration 32). */
  tools?: string | null;
  /** Set while the agent sits in the trash (absent on rows read before migration 33). */
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Agent = {
  id: string;
  kind: AgentKind;
  system: boolean;
  name: string;
  nick: string | null;
  roleId: string | null;
  /** Display role: the user role's name; system agents fall back to their kind label. */
  role: string;
  look: Look;
  prompt: string;
  /** STUDIO LIFE: may send mail to other projects and HQ (default on). */
  canMail: boolean;
  /** Working tools: what it may edit and run. null = the studio's full kit. */
  tools: Toolset | null;
  teamIds: string[];
  /** Projects using this agent (as orchestrator, specialist, or via a team). */
  projectIds: string[];
  canDelete: DeleteVerdict;
  createdAt: string;
  updatedAt: string;
};

export type AgentCreate = {
  kind?: AgentKind;
  name: string;
  nick?: string | null;
  roleId?: string | null;
  look?: Look;
  prompt?: string;
  tools?: Toolset | null;
};
export type AgentPatch = Partial<Omit<AgentCreate, 'kind' | 'tools'>> & { canMail?: boolean };

const kindRank = (a: { kind: AgentKind; position: number }) => KIND_ORDER[a.kind] * 1e9 + a.position;

export function agentsRepo(db: Db, roles: RolesRepo) {
  /* Every read goes through these two, so a hidden (trashed) agent is invisible everywhere. */
  const records = () =>
    rows<AgentRecord>(db.prepare('SELECT * FROM agents WHERE deleted_at IS NULL').all()).sort(
      (a, b) => kindRank(a) - kindRank(b),
    );
  const record = (id: string) =>
    row<AgentRecord>(db.prepare('SELECT * FROM agents WHERE id = ? AND deleted_at IS NULL').get(id));
  const hiddenRecord = (id: string) =>
    row<AgentRecord>(db.prepare('SELECT * FROM agents WHERE id = ? AND deleted_at IS NOT NULL').get(id));

  const teamIds = (id: string) =>
    rows<{ team_id: string }>(
      db
        .prepare(
          'SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.agent_id = ? ORDER BY t.position',
        )
        .all(id),
    ).map((r) => r.team_id);
  const projectIds = (id: string) =>
    rows<{ id: string }>(
      db
        .prepare(
          `SELECT p.id FROM projects p WHERE p.orchestrator_id = ?1
             OR p.id IN (SELECT project_id FROM project_agents WHERE agent_id = ?1)
             OR p.id IN (SELECT pt.project_id FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.team_id WHERE tm.agent_id = ?1)
           ORDER BY p.position`,
        )
        .all(id),
    ).map((r) => r.id);

  /** Display role: the user role's name; system agents fall back to their kind label. */
  const roleLabel = (r: Pick<AgentRecord, 'kind' | 'role_id'>): string => {
    const roleName = r.role_id ? (roles.get(r.role_id)?.name ?? '') : '';
    return roleName || (isSystemKind(r.kind) ? KIND_LABEL[r.kind] : '');
  };

  const toAgent = (r: AgentRecord, cast: AgentRecord[]): Agent => ({
    id: r.id,
    kind: r.kind,
    system: isSystemKind(r.kind),
    name: r.name,
    nick: r.nick,
    roleId: r.role_id,
    role: roleLabel(r),
    look: JSON.parse(r.look) as Look,
    prompt: r.prompt,
    canMail: r.can_mail !== 0,
    tools: r.tools ? (JSON.parse(r.tools) as Toolset) : null,
    teamIds: teamIds(r.id),
    projectIds: projectIds(r.id),
    canDelete: canDelete(r, cast),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  const repo = {
    records,
    record,
    roleLabel,
    list(): Agent[] {
      const cast = records();
      return cast.map((r) => toAgent(r, cast));
    },
    get(id: string): Agent | null {
      const r = record(id);
      return r ? toAgent(r, records()) : null;
    },
    require(id: string): Agent {
      const a = repo.get(id);
      if (!a) throw notFound('Agent', id);
      return a;
    },
    /** For body references (team members, orchestrator ids…): unknown → 422. */
    ref(id: string): { id: string; kind: AgentKind } {
      const r = record(id);
      if (!r) throw invalid(`Unknown agent '${id}'`, { agentId: id });
      return { id: r.id, kind: r.kind };
    },

    create(input: AgentCreate, id?: string): Agent {
      const kind = input.kind ?? 'agent';
      assertCanCreate(kind, records());
      if (input.roleId) roles.assertExists(input.roleId);
      const aid = id ?? uniqueId(`a-${slugify(input.name, 'agent')}`, (x) => exists(db, 'agents', x));
      const t = now();
      repo.insertRecord({
        id: aid,
        kind,
        name: input.name,
        nick: input.nick ?? null,
        role_id: input.roleId ?? null,
        look: JSON.stringify(input.look ?? DEFAULT_LOOK),
        prompt: input.prompt ?? '',
        tools: input.tools ? JSON.stringify(input.tools) : null,
        position: nextPosition(db, 'agents'),
        created_at: t,
        updated_at: t,
      });
      return repo.require(aid);
    },

    update(id: string, patch: AgentPatch): Agent {
      const r = record(id);
      if (!r) throw notFound('Agent', id);
      if (patch.roleId) roles.assertExists(patch.roleId);
      const next: AgentRecord = {
        ...r,
        name: patch.name ?? r.name,
        nick: patch.nick === undefined ? r.nick : patch.nick,
        role_id: patch.roleId === undefined ? r.role_id : patch.roleId,
        look: patch.look ? JSON.stringify(patch.look) : r.look,
        prompt: patch.prompt ?? r.prompt,
        updated_at: now(),
      };
      db.prepare(
        'UPDATE agents SET name = ?, nick = ?, role_id = ?, look = ?, prompt = ?, updated_at = ? WHERE id = ?',
      ).run(next.name, next.nick, next.role_id, next.look, next.prompt, next.updated_at, id);
      if (patch.canMail !== undefined)
        db.prepare('UPDATE agents SET can_mail = ? WHERE id = ?').run(patch.canMail ? 1 : 0, id);
      return repo.require(id);
    },

    /** Every column, so a restored agent comes back exactly as it was (mail rights and tools included). */
    insertRecord(r: AgentRecord): void {
      db.prepare(
        `INSERT INTO agents (id, kind, name, nick, role_id, look, prompt, position, can_mail, tools, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        r.id,
        r.kind,
        r.name,
        r.nick,
        r.role_id,
        r.look,
        r.prompt,
        r.position,
        r.can_mail ?? 1,
        r.tools ?? null,
        r.created_at,
        r.updated_at,
      );
    },
    hiddenRecord,
    /** Raw soft delete: the row stays, so nothing cascades. Use trash.trashAgent for the rules + undo. */
    hide: (id: string, at: string) => db.prepare('UPDATE agents SET deleted_at = ? WHERE id = ?').run(at, id),
    unhide: (id: string) => db.prepare('UPDATE agents SET deleted_at = NULL WHERE id = ?').run(id),
    /** Raw hard delete (seats, links, guest spots cascade). Only the trash purge calls it, after the keep time. */
    deleteRecord: (id: string) => db.prepare('DELETE FROM agents WHERE id = ?').run(id),
  };
  return repo;
}
export type AgentsRepo = ReturnType<typeof agentsRepo>;
