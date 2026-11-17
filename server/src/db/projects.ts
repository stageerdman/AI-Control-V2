/* Projects repository. A project is run by one orchestrator, staffed teams-first
   (whole teams) plus the odd specialist, and lives in a folder inside the sandbox. */
import { assertNotSystem, assertOrchestrator } from '../domain/cast.ts';
import { slugify, uniqueId } from '../domain/ids.ts';
import {
  CollaborationSchema,
  fromCollaboration,
  type Workflow,
  WorkflowsSchema,
} from '../domain/workflows.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import { SandboxError, toSandboxRelative } from '../fs/sandbox.ts';
import type { AgentsRepo } from './agents.ts';
import type { Db } from './connection.ts';
import type { TeamsRepo } from './teams.ts';
import { exists, nextPosition, now, readJson, row, rows } from './util.ts';

export const PROJECT_STATUSES = ['live', 'needs', 'idle', 'draft', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Tile = { g1: string; g2: string; glyph: string };

type ProjectRecord = {
  id: string;
  name: string;
  note: string;
  status: ProjectStatus;
  progress: number;
  folder: string | null;
  orchestrator_id: string;
  github_connected: number;
  github_private: number;
  tile: string;
  /** OFFICE: JSON {ext, v} of the picture in <data dir>/images; null = show the tile. */
  image: string | null;
  /** B8, before workflows: read only to carry it over (workflows[0]). */
  collaboration: string | null;
  workflows: string | null;
  target: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  note: string;
  status: ProjectStatus;
  progress: number;
  /** Relative to the sandbox root; null until the Project Setter gives it one. */
  folder: string | null;
  orchestratorId: string;
  /** G1: from the studio's GitHub record for its folder. `connected` = `published`, `private` = not public (B0 names). */
  github: {
    connected: boolean;
    private: boolean;
    published: boolean;
    url: string | null;
    visibility: 'public' | 'private' | 'internal' | null;
  };
  tile: Tile;
  /** OFFICE: the project's picture (GET /projects/:id/image?v=…, versioned for caches); null = show the tile. */
  imageUrl: string | null;
  teamIds: string[];
  /** Individual specialists (teams come first). */
  agentIds: string[];
  /** How its people work together: named workflows, the first is the default. null = never designed. */
  workflows: Workflow[] | null;
  /** What the overall progress counts towards ("v1.0"); null = no label. */
  target: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectFields = {
  name: string;
  note?: string;
  status?: ProjectStatus;
  progress?: number;
  folder?: string | null;
  orchestratorId?: string;
  tile?: Tile;
  teamIds?: string[];
  agentIds?: string[];
  workflows?: Workflow[] | null;
  target?: string | null;
};
export type ProjectCreate = ProjectFields;
export type ProjectPatch = Partial<ProjectFields>;

/** The workflows, or the B8 design carried over as the first one (the first write saves `workflows`). */
const readWorkflows = (r: ProjectRecord): Workflow[] | null => {
  const list = readJson<Workflow[]>(r.workflows, WorkflowsSchema);
  if (list) return list;
  const c = readJson(r.collaboration, CollaborationSchema);
  return c ? [fromCollaboration(c)] : null;
};

export const DEFAULT_TILE: Tile = { g1: '#9b6cff', g2: '#4ea8ff', glyph: 'bag' };
type Link = 'teams' | 'agents';
const LINK = {
  teams: { table: 'project_teams', col: 'team_id' },
  agents: { table: 'project_agents', col: 'agent_id' },
} as const;

export function projectsRepo(db: Db, deps: { agents: AgentsRepo; teams: TeamsRepo; sandbox: string }) {
  const { agents, teams, sandbox } = deps;
  const record = (id: string) =>
    row<ProjectRecord>(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  const requireRecord = (id: string) => {
    const r = record(id);
    if (!r) throw notFound('Project', id);
    return r;
  };

  const links = (id: string, kind: Link): string[] => {
    const { table, col } = LINK[kind];
    return rows<Record<string, string>>(
      db.prepare(`SELECT ${col} AS v FROM ${table} WHERE project_id = ? ORDER BY position`).all(id),
    ).map((r) => r.v as string);
  };
  const setLinks = (id: string, kind: Link, ids: readonly string[]) => {
    const { table, col } = LINK[kind];
    db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(id);
    const ins = db.prepare(`INSERT INTO ${table} (project_id, ${col}, position) VALUES (?, ?, ?)`);
    ids.forEach((v, i) => {
      ins.run(id, v, i);
    });
  };

  /* ---- reference checks: body ids must exist (422) and obey the cast rules (409) ---- */
  const checkOrchestrator = (id: string) => assertOrchestrator(agents.ref(id));
  const checkTeams = (ids: readonly string[]) => {
    if (new Set(ids).size !== ids.length) throw invalid('teamIds has duplicates');
    for (const t of ids) if (!teams.record(t)) throw invalid(`Unknown team '${t}'`, { teamId: t });
  };
  const checkSpecialists = (ids: readonly string[]) => {
    if (new Set(ids).size !== ids.length) throw invalid('agentIds has duplicates');
    for (const a of ids) assertNotSystem(agents.ref(a));
  };
  /** Validate through the sandbox guard; store the canonical relative path. */
  const normFolder = (folder: string | null | undefined, selfId?: string): string | null => {
    if (folder == null) return null;
    let rel: string;
    try {
      rel = toSandboxRelative(sandbox, folder);
    } catch (e) {
      if (e instanceof SandboxError) throw invalid(e.message, { folder });
      throw e;
    }
    if (!rel) throw invalid('A project folder cannot be the sandbox root itself', { folder });
    const clash = row<{ id: string }>(db.prepare('SELECT id FROM projects WHERE folder = ?').get(rel));
    if (clash && clash.id !== selfId)
      throw conflict(`Folder '${rel}' already belongs to project '${clash.id}'`, { projectId: clash.id });
    return rel;
  };
  const firstOrchestrator = () => {
    const o = agents.records().find((a) => a.kind === 'orchestrator');
    if (!o) throw conflict('No orchestrator exists'); // unreachable while the cast rules hold
    return o.id;
  };

  const githubOf = (folder: string | null): Project['github'] => {
    const g = folder
      ? row<{ url: string; visibility: Project['github']['visibility'] }>(
          db.prepare('SELECT url, visibility FROM github_repos WHERE folder = ?').get(folder),
        )
      : undefined;
    return g
      ? {
          connected: true,
          private: g.visibility !== 'public',
          published: true,
          url: g.url,
          visibility: g.visibility,
        }
      : { connected: false, private: true, published: false, url: null, visibility: null };
  };
  const imageUrlOf = (r: ProjectRecord): string | null => {
    if (!r.image) return null;
    try {
      const { v } = JSON.parse(r.image) as { v: string };
      return `/projects/${encodeURIComponent(r.id)}/image?v=${encodeURIComponent(v)}`;
    } catch {
      return null;
    }
  };
  const toProject = (r: ProjectRecord): Project => ({
    id: r.id,
    name: r.name,
    note: r.note,
    status: r.status,
    progress: r.progress,
    folder: r.folder,
    orchestratorId: r.orchestrator_id,
    github: githubOf(r.folder),
    tile: JSON.parse(r.tile) as Tile,
    imageUrl: imageUrlOf(r),
    teamIds: links(r.id, 'teams'),
    agentIds: links(r.id, 'agents'),
    workflows: readWorkflows(r),
    target: r.target ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  const repo = {
    links,
    setLinks,
    list: (): Project[] =>
      rows<ProjectRecord>(db.prepare('SELECT * FROM projects ORDER BY position').all()).map(toProject),
    get: (id: string): Project | null => {
      const r = record(id);
      return r ? toProject(r) : null;
    },
    require: (id: string): Project => toProject(requireRecord(id)),

    create(input: ProjectCreate, id?: string): Project {
      const orchestratorId = input.orchestratorId ?? firstOrchestrator();
      checkOrchestrator(orchestratorId);
      checkTeams(input.teamIds ?? []);
      checkSpecialists(input.agentIds ?? []);
      const pid = id ?? uniqueId(slugify(input.name, 'project'), (x) => exists(db, 'projects', x));
      const folder = normFolder(input.folder);
      const t = now();
      db.prepare(
        `INSERT INTO projects (id, name, note, status, progress, folder, orchestrator_id, github_connected, github_private, tile, workflows, target, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        pid,
        input.name,
        input.note ?? '',
        input.status ?? 'idle',
        input.progress ?? 0,
        folder,
        orchestratorId,
        0, // github_connected / github_private: B0 placeholders, unused since G1 (github_repos)
        1,
        JSON.stringify(input.tile ?? DEFAULT_TILE),
        input.workflows ? JSON.stringify(input.workflows) : null,
        input.target?.trim() || null,
        nextPosition(db, 'projects'),
        t,
        t,
      );
      setLinks(pid, 'teams', input.teamIds ?? []);
      setLinks(pid, 'agents', input.agentIds ?? []);
      return repo.require(pid);
    },

    update(id: string, patch: ProjectPatch): Project {
      const r = requireRecord(id);
      if (patch.orchestratorId) checkOrchestrator(patch.orchestratorId);
      if (patch.teamIds) checkTeams(patch.teamIds);
      if (patch.agentIds) checkSpecialists(patch.agentIds);
      const folder = patch.folder === undefined ? r.folder : normFolder(patch.folder, id);
      db.prepare(
        `UPDATE projects SET name = ?, note = ?, status = ?, progress = ?, folder = ?, orchestrator_id = ?,
           tile = ?, workflows = ?, target = ?, updated_at = ? WHERE id = ?`,
      ).run(
        patch.name ?? r.name,
        patch.note ?? r.note,
        patch.status ?? r.status,
        patch.progress ?? r.progress,
        folder,
        patch.orchestratorId ?? r.orchestrator_id,
        patch.tile ? JSON.stringify(patch.tile) : r.tile,
        patch.workflows === undefined
          ? r.workflows
          : patch.workflows
            ? JSON.stringify(patch.workflows)
            : null,
        patch.target === undefined ? r.target : patch.target?.trim() || null,
        now(),
        id,
      );
      if (patch.teamIds) setLinks(id, 'teams', patch.teamIds);
      if (patch.agentIds) setLinks(id, 'agents', patch.agentIds);
      return repo.require(id);
    },

    /** Forgets the project record only — never touches its folder. */
    remove(id: string): void {
      requireRecord(id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    },

    /** Orchestrator hand-over (used when an orchestrator is deleted / restored). */
    reassignOrchestrator(from: string, to: string, onlyIds?: readonly string[]): string[] {
      const ids = rows<{ id: string }>(
        db.prepare('SELECT id FROM projects WHERE orchestrator_id = ?').all(from),
      )
        .map((r) => r.id)
        .filter((id) => !onlyIds || onlyIds.includes(id));
      const upd = db.prepare('UPDATE projects SET orchestrator_id = ?, updated_at = ? WHERE id = ?');
      for (const id of ids) upd.run(to, now(), id);
      return ids;
    },
  };
  return repo;
}
export type ProjectsRepo = ReturnType<typeof projectsRepo>;
