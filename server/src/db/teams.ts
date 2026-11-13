/* Teams repository. Membership lives here (never on the agent); every roster
   change goes through src/domain/teams.ts so the rules hold. */
import { slugify, uniqueId } from '../domain/ids.ts';
import {
  addMember,
  buildRoster,
  type Member,
  type Roster,
  removeMember,
  setCaptain,
} from '../domain/teams.ts';
import { notFound } from '../errors.ts';
import type { AgentsRepo } from './agents.ts';
import type { Db } from './connection.ts';
import { exists, nextPosition, now, row, rows } from './util.ts';

export type TeamRecord = {
  id: string;
  name: string;
  color: string;
  emblem: string;
  blurb: string;
  instr: string;
  code: string;
  captain_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  reporter?: number;
};

export type Team = {
  id: string;
  name: string;
  color: string;
  emblem: string;
  blurb: string;
  /** What the team does. */
  instr: string;
  /** How the team codes. */
  code: string;
  captainId: string | null;
  members: Member[];
  projectIds: string[];
  /** Runs for this team may file reports (file_report). */
  reporter: boolean;
  createdAt: string;
  updatedAt: string;
};

type TeamFields = {
  name: string;
  color?: string;
  emblem?: string;
  blurb?: string;
  instr?: string;
  code?: string;
  reporter?: boolean;
};
export type TeamCreate = TeamFields & {
  members?: { agentId: string; instr?: string }[];
  captainId?: string | null;
};
export type TeamPatch = Partial<TeamFields> & { captainId?: string };

export function teamsRepo(db: Db, agents: AgentsRepo) {
  const record = (id: string) => row<TeamRecord>(db.prepare('SELECT * FROM teams WHERE id = ?').get(id));
  const requireRecord = (id: string) => {
    const r = record(id);
    if (!r) throw notFound('Team', id);
    return r;
  };
  const members = (id: string): Member[] =>
    rows<{ agent_id: string; instr: string }>(
      db.prepare('SELECT agent_id, instr FROM team_members WHERE team_id = ? ORDER BY position').all(id),
    ).map((m) => ({ agentId: m.agent_id, instr: m.instr }));
  const projectIds = (id: string) =>
    rows<{ project_id: string }>(
      db
        .prepare(
          'SELECT pt.project_id FROM project_teams pt JOIN projects p ON p.id = pt.project_id WHERE pt.team_id = ? ORDER BY p.position',
        )
        .all(id),
    ).map((r) => r.project_id);

  const toTeam = (r: TeamRecord): Team => ({
    id: r.id,
    name: r.name,
    color: r.color,
    emblem: r.emblem,
    blurb: r.blurb,
    instr: r.instr,
    code: r.code,
    captainId: r.captain_id,
    members: members(r.id),
    projectIds: projectIds(r.id),
    reporter: r.reporter === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  const repo = {
    record,
    list: (): Team[] =>
      rows<TeamRecord>(db.prepare('SELECT * FROM teams ORDER BY position').all()).map(toTeam),
    get: (id: string): Team | null => {
      const r = record(id);
      return r ? toTeam(r) : null;
    },
    require: (id: string): Team => toTeam(requireRecord(id)),
    roster: (id: string): Roster => ({ captainId: requireRecord(id).captain_id, members: members(id) }),

    /** Persist a roster the domain already validated. */
    saveRoster(id: string, roster: Roster): void {
      db.prepare('DELETE FROM team_members WHERE team_id = ?').run(id);
      const ins = db.prepare(
        'INSERT INTO team_members (team_id, agent_id, position, instr) VALUES (?, ?, ?, ?)',
      );
      roster.members.forEach((m, i) => {
        ins.run(id, m.agentId, i, m.instr);
      });
      db.prepare('UPDATE teams SET captain_id = ?, updated_at = ? WHERE id = ?').run(
        roster.captainId,
        now(),
        id,
      );
    },

    create(input: TeamCreate, id?: string): Team {
      const roster = buildRoster(
        (input.members ?? []).map((m) => ({ agent: agents.ref(m.agentId), instr: m.instr ?? '' })),
        input.captainId,
      );
      const tid =
        id ?? uniqueId(slugify(input.name.replace(/^the\s+/i, ''), 'team'), (x) => exists(db, 'teams', x));
      const t = now();
      repo.insertRecord({
        id: tid,
        name: input.name,
        color: input.color ?? 'grape',
        emblem: input.emblem ?? 'starship',
        blurb: input.blurb ?? '',
        instr: input.instr ?? '',
        code: input.code ?? '',
        reporter: input.reporter ? 1 : 0,
        captain_id: null,
        position: nextPosition(db, 'teams'),
        created_at: t,
        updated_at: t,
      });
      repo.saveRoster(tid, roster);
      return repo.require(tid);
    },

    update(id: string, patch: TeamPatch): Team {
      const r = requireRecord(id);
      if (patch.captainId !== undefined) repo.saveRoster(id, setCaptain(repo.roster(id), patch.captainId));
      db.prepare(
        'UPDATE teams SET name = ?, color = ?, emblem = ?, blurb = ?, instr = ?, code = ?, reporter = ?, updated_at = ? WHERE id = ?',
      ).run(
        patch.name ?? r.name,
        patch.color ?? r.color,
        patch.emblem ?? r.emblem,
        patch.blurb ?? r.blurb,
        patch.instr ?? r.instr,
        patch.code ?? r.code,
        patch.reporter === undefined ? (r.reporter ?? 0) : patch.reporter ? 1 : 0,
        now(),
        id,
      );
      return repo.require(id);
    },

    addMember(id: string, agentId: string, instr = '', at?: number): Team {
      repo.saveRoster(id, addMember(repo.roster(id), agents.ref(agentId), instr, at));
      return repo.require(id);
    },
    updateMember(id: string, agentId: string, instr: string): Team {
      requireRecord(id);
      const res = db
        .prepare('UPDATE team_members SET instr = ? WHERE team_id = ? AND agent_id = ?')
        .run(instr, id, agentId);
      if (res.changes === 0) throw notFound('Member', agentId);
      return repo.require(id);
    },
    removeMember(id: string, agentId: string): Team {
      const removal = removeMember(repo.roster(id), agentId);
      if (!removal) throw notFound('Member', agentId);
      repo.saveRoster(id, removal.team);
      return repo.require(id);
    },

    insertRecord(r: TeamRecord): void {
      db.prepare(
        `INSERT INTO teams (id, name, color, emblem, blurb, instr, code, captain_id, position, created_at, updated_at, reporter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        r.id,
        r.name,
        r.color,
        r.emblem,
        r.blurb,
        r.instr,
        r.code,
        r.captain_id,
        r.position,
        r.created_at,
        r.updated_at,
        r.reporter ?? 0,
      );
    },
    deleteRecord: (id: string) => db.prepare('DELETE FROM teams WHERE id = ?').run(id),
  };
  return repo;
}
export type TeamsRepo = ReturnType<typeof teamsRepo>;
