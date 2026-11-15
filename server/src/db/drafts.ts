/* Setup drafts: a project being set up in its own space (v6 N1). Saved as you go;
   leave mid-way and it waits on Projects as an "In setup" card. */
import { randomUUID } from 'node:crypto';
import { assertOrchestrator } from '../domain/cast.ts';
import { assertPlan, type CastView, type Plan, PlanSchema } from '../domain/plan.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import { SandboxError, toSandboxRelative } from '../fs/sandbox.ts';
import type { AgentsRepo } from './agents.ts';
import type { Db } from './connection.ts';
import type { TeamsRepo } from './teams.ts';
import { now, row, rows } from './util.ts';

/** 'agent' = a guest in the setup room (AGENT MCP), by agentId. */
export type ChatMessage = {
  from: 'user' | 'orchestrator' | 'creator' | 'agent';
  agentId?: string;
  text: string;
};
export type DraftRecord = {
  id: string;
  mode: 'new' | 'adopt';
  step: number;
  name: string;
  about: string;
  folder: string | null;
  orchestrator_id: string | null;
  plan: string | null;
  chat: string;
  setup_at: string | null;
  setup_commit: string | null;
  /** G1: create the GitHub repo at setup; NULL = the studio default. */
  github?: number | null;
  created_at: string;
  updated_at: string;
};
export type Draft = {
  id: string;
  mode: 'new' | 'adopt';
  step: number;
  name: string;
  about: string;
  folder: string | null;
  orchestratorId: string | null;
  /** The orchestrator's staffing proposal (src/domain/plan.ts); null until the setup chat starts. */
  plan: Plan | null;
  chat: ChatMessage[];
  /** When the Project Setter set up `folder` (POST /drafts/:id/setup); null until then. */
  setupAt: string | null;
  setupCommit: string | null;
  /** G1: create a GitHub repo at setup (null = the studio default, on unless turned off). */
  github: boolean | null;
  createdAt: string;
  updatedAt: string;
};
export type DraftCreate = {
  mode: 'new' | 'adopt';
  step?: number;
  name?: string;
  about?: string;
  folder?: string | null;
  orchestratorId?: string | null;
  github?: boolean | null;
};
export type DraftPatch = Partial<Omit<DraftCreate, 'mode'>> & { plan?: Plan | null; chat?: ChatMessage[] };

/** A stored plan that no longer parses (hand-edited db, older shape) reads as no plan. */
const readPlan = (raw: string | null): Plan | null => {
  if (raw === null) return null;
  const r = PlanSchema.safeParse(JSON.parse(raw));
  return r.success ? r.data : null;
};

const toDraft = (r: DraftRecord): Draft => ({
  id: r.id,
  mode: r.mode,
  step: r.step,
  name: r.name,
  about: r.about,
  folder: r.folder,
  orchestratorId: r.orchestrator_id,
  plan: readPlan(r.plan),
  chat: JSON.parse(r.chat) as ChatMessage[],
  setupAt: r.setup_at ?? null,
  setupCommit: r.setup_commit ?? null,
  github: r.github == null ? null : r.github === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** The Cast as the plan rules see it. */
export const castView = (agents: AgentsRepo, teams: TeamsRepo): CastView => ({
  team: (id) => {
    const t = teams.get(id);
    return t ? { name: t.name, members: t.members.map((m) => m.agentId) } : null;
  },
  agent: (id) => {
    const a = agents.record(id);
    return a ? { name: a.name, kind: a.kind } : null;
  },
});

export function draftsRepo(db: Db, deps: { agents: AgentsRepo; teams: TeamsRepo; sandbox: string }) {
  const { agents, sandbox } = deps;
  const cast = castView(agents, deps.teams);
  const record = (id: string) => row<DraftRecord>(db.prepare('SELECT * FROM drafts WHERE id = ?').get(id));
  const requireRecord = (id: string) => {
    const r = record(id);
    if (!r) throw notFound('Draft', id);
    return r;
  };
  const normFolder = (folder: string | null | undefined): string | null => {
    if (folder == null) return null;
    try {
      const rel = toSandboxRelative(sandbox, folder);
      if (!rel) throw invalid('A project folder cannot be the sandbox root itself', { folder });
      return rel;
    } catch (e) {
      if (e instanceof SandboxError) throw invalid(e.message, { folder });
      throw e;
    }
  };
  const checkOrch = (id: string | null | undefined) => {
    if (id) assertOrchestrator(agents.ref(id));
  };

  const repo = {
    record,
    list: (): Draft[] =>
      rows<DraftRecord>(db.prepare('SELECT * FROM drafts ORDER BY created_at, id').all()).map(toDraft),
    require: (id: string): Draft => toDraft(requireRecord(id)),

    create(input: DraftCreate): Draft {
      checkOrch(input.orchestratorId);
      const orch =
        input.orchestratorId ?? agents.records().find((a) => a.kind === 'orchestrator')?.id ?? null;
      const t = now();
      const id = `d-${randomUUID().slice(0, 8)}`;
      repo.insertRecord({
        id,
        mode: input.mode,
        step: input.step ?? 1,
        name: input.name ?? '',
        about: input.about ?? '',
        folder: normFolder(input.folder),
        orchestrator_id: orch,
        plan: null,
        chat: '[]',
        setup_at: null,
        setup_commit: null,
        github: input.github == null ? null : input.github ? 1 : 0,
        created_at: t,
        updated_at: t,
      });
      return repo.require(id);
    },

    update(id: string, patch: DraftPatch): Draft {
      const r = requireRecord(id);
      checkOrch(patch.orchestratorId);
      if (r.setup_at && patch.folder !== undefined && normFolder(patch.folder) !== r.folder)
        throw conflict(
          'The folder is already set up — it can’t move. Delete the draft to start over (the folder stays)',
          {
            folder: r.folder,
          },
        );
      if (patch.plan) assertPlan(patch.plan, cast);
      db.prepare(
        'UPDATE drafts SET step = ?, name = ?, about = ?, folder = ?, orchestrator_id = ?, plan = ?, chat = ?, github = ?, updated_at = ? WHERE id = ?',
      ).run(
        patch.step ?? r.step,
        patch.name ?? r.name,
        patch.about ?? r.about,
        patch.folder === undefined ? r.folder : normFolder(patch.folder),
        patch.orchestratorId === undefined ? r.orchestrator_id : patch.orchestratorId,
        patch.plan === undefined ? r.plan : patch.plan === null ? null : JSON.stringify(patch.plan),
        patch.chat ? JSON.stringify(patch.chat) : r.chat,
        patch.github === undefined ? (r.github ?? null) : patch.github === null ? null : patch.github ? 1 : 0,
        now(),
        id,
      );
      return repo.require(id);
    },

    reassignOrchestrator(from: string, to: string | null, onlyIds?: readonly string[]): string[] {
      const ids = rows<{ id: string }>(
        db.prepare('SELECT id FROM drafts WHERE orchestrator_id = ?').all(from),
      )
        .map((r) => r.id)
        .filter((id) => !onlyIds || onlyIds.includes(id));
      const upd = db.prepare('UPDATE drafts SET orchestrator_id = ? WHERE id = ?');
      for (const id of ids) upd.run(to, id);
      return ids;
    },

    insertRecord(r: DraftRecord): void {
      db.prepare(
        `INSERT INTO drafts (id, mode, step, name, about, folder, orchestrator_id, plan, chat, setup_at, setup_commit, github, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        r.id,
        r.mode,
        r.step,
        r.name,
        r.about,
        r.folder,
        r.orchestrator_id,
        r.plan,
        r.chat,
        r.setup_at ?? null,
        r.setup_commit ?? null,
        r.github ?? null,
        r.created_at,
        r.updated_at,
      );
    },
    /** The Setter finished on this draft: it owns `folder` from now on. */
    markSetUp(id: string, folder: string, commit: string | null): Draft {
      db.prepare(
        'UPDATE drafts SET folder = ?, setup_at = ?, setup_commit = ?, updated_at = ? WHERE id = ?',
      ).run(folder, now(), commit, now(), id);
      return repo.require(id);
    },
    /** Set-up drafts other than `except` that own `folder`. */
    ownerOf: (folder: string, except?: string): string | null =>
      row<{ id: string }>(
        db
          .prepare('SELECT id FROM drafts WHERE setup_at IS NOT NULL AND folder = ? AND id != ?')
          .get(folder, except ?? ''),
      )?.id ?? null,
    setUpFolders: (): string[] =>
      rows<{ folder: string }>(
        db.prepare('SELECT folder FROM drafts WHERE setup_at IS NOT NULL AND folder IS NOT NULL').all(),
      ).map((r) => r.folder),
    deleteRecord: (id: string) => db.prepare('DELETE FROM drafts WHERE id = ?').run(id),
  };
  return repo;
}
export type DraftsRepo = ReturnType<typeof draftsRepo>;
