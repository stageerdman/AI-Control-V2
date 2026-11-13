/* Setup drafts: a project being set up in its own space (v6 N1). Saved as you go;
   leave mid-way and it waits on Projects as an "In setup" card. */
import { randomUUID } from 'node:crypto';
import { assertOrchestrator } from '../domain/cast.ts';
import { invalid, notFound } from '../errors.ts';
import { SandboxError, toSandboxRelative } from '../fs/sandbox.ts';
import type { AgentsRepo } from './agents.ts';
import type { Db } from './connection.ts';
import { now, row, rows } from './util.ts';

export type ChatMessage = { from: 'user' | 'orchestrator'; text: string };
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
  /** The orchestrator's team proposal — opaque here; B6 owns its shape. */
  plan: unknown;
  chat: ChatMessage[];
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
};
export type DraftPatch = Partial<Omit<DraftCreate, 'mode'>> & { plan?: unknown; chat?: ChatMessage[] };

const toDraft = (r: DraftRecord): Draft => ({
  id: r.id,
  mode: r.mode,
  step: r.step,
  name: r.name,
  about: r.about,
  folder: r.folder,
  orchestratorId: r.orchestrator_id,
  plan: r.plan === null ? null : JSON.parse(r.plan),
  chat: JSON.parse(r.chat) as ChatMessage[],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function draftsRepo(db: Db, deps: { agents: AgentsRepo; sandbox: string }) {
  const { agents, sandbox } = deps;
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
        created_at: t,
        updated_at: t,
      });
      return repo.require(id);
    },

    update(id: string, patch: DraftPatch): Draft {
      const r = requireRecord(id);
      checkOrch(patch.orchestratorId);
      db.prepare(
        'UPDATE drafts SET step = ?, name = ?, about = ?, folder = ?, orchestrator_id = ?, plan = ?, chat = ?, updated_at = ? WHERE id = ?',
      ).run(
        patch.step ?? r.step,
        patch.name ?? r.name,
        patch.about ?? r.about,
        patch.folder === undefined ? r.folder : normFolder(patch.folder),
        patch.orchestratorId === undefined ? r.orchestrator_id : patch.orchestratorId,
        patch.plan === undefined ? r.plan : patch.plan === null ? null : JSON.stringify(patch.plan),
        patch.chat ? JSON.stringify(patch.chat) : r.chat,
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
        `INSERT INTO drafts (id, mode, step, name, about, folder, orchestrator_id, plan, chat, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        r.created_at,
        r.updated_at,
      );
    },
    deleteRecord: (id: string) => db.prepare('DELETE FROM drafts WHERE id = ?').run(id),
  };
  return repo;
}
export type DraftsRepo = ReturnType<typeof draftsRepo>;
