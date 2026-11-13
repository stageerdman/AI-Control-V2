/* Draft → project. Validates the draft, then — in ONE db transaction — creates the
   project record, removes the draft and runs the scaffold last: if the scaffold
   throws, the transaction rolls back (no half project) and a folder we created
   for a new project is removed again. */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import type { Module } from '../blueprint/modules.ts';
import type { Project } from '../db/projects.ts';
import type { Store } from '../db/store.ts';
import { slugify } from '../domain/ids.ts';
import { conflict, invalid } from '../errors.ts';
import { resolveInSandbox, SandboxError, toSandboxRelative } from '../fs/sandbox.ts';
import { type ScaffoldResult, type Step, scaffold } from './scaffold.ts';

export type FinishDeps = {
  store: Store;
  sandbox: string;
  controlHome: string;
  modules: () => Module[];
  today: () => string;
};
export type FinishResult = { project: Project; steps: Step[]; commit: string | null };

/** Optional staffing in the draft's plan (B6 owns the full shape): { teamIds?: string[], agentIds?: string[] }. */
function staffing(plan: unknown): { teamIds?: string[]; agentIds?: string[] } {
  if (!plan || typeof plan !== 'object') return {};
  const p = plan as Record<string, unknown>;
  const strs = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;
  const out: { teamIds?: string[]; agentIds?: string[] } = {};
  const t = strs(p.teamIds);
  const a = strs(p.agentIds);
  if (t) out.teamIds = t;
  if (a) out.agentIds = a;
  return out;
}

const guard = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof SandboxError) throw invalid(e.message);
    throw e;
  }
};

export function finishDraft(deps: FinishDeps, draftId: string, onStep?: (s: Step) => void): FinishResult {
  const { store, sandbox } = deps;
  const draft = store.drafts.require(draftId);
  const name = draft.name.trim();
  if (!name) throw invalid('The draft needs a name before it can be finished');

  /* where the project lives */
  const folder = guard(() => toSandboxRelative(sandbox, draft.folder ?? slugify(name, 'project')));
  if (!folder) throw invalid('A project folder cannot be the sandbox root itself');
  const abs = guard(() => resolveInSandbox(sandbox, folder));
  const there = existsSync(abs);
  if (draft.mode === 'new' && there && (!statSync(abs).isDirectory() || readdirSync(abs).length > 0)) {
    throw conflict(`'${folder}' already exists in the sandbox — adopt it instead, or pick another folder`, {
      folder,
    });
  }
  if (draft.mode === 'adopt' && (!there || !statSync(abs).isDirectory())) {
    throw invalid(`Nothing to adopt: '${folder}' is not a folder in the sandbox`, { folder });
  }
  const owner = store.projects.list().find((p) => p.folder === folder);
  if (owner) throw conflict(`'${folder}' already belongs to project '${owner.id}'`, { projectId: owner.id });

  try {
    return store.tx((): FinishResult => {
      const p = store.projects.create({
        name,
        note: draft.about.slice(0, 500),
        folder,
        ...(draft.orchestratorId ? { orchestratorId: draft.orchestratorId } : {}),
        ...staffing(draft.plan),
      });
      store.drafts.deleteRecord(draft.id);
      const r: ScaffoldResult = scaffold({
        sandbox,
        folder,
        name,
        about: draft.about,
        modules: deps.modules(),
        controlHome: deps.controlHome,
        date: deps.today(),
        mode: draft.mode,
        ...(onStep ? { onStep } : {}),
      });
      return { project: store.projects.require(p.id), steps: r.steps, commit: r.commit };
    });
  } catch (e) {
    if (draft.mode === 'new' && !there) rmSync(abs, { recursive: true, force: true });
    if (e instanceof SandboxError) throw invalid(e.message);
    throw e;
  }
}

/** Local calendar date, YYYY-MM-DD. */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
