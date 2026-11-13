/* Draft → project, with the Project Setter's steps streamed live on the draft's
   event stream (GET /drafts/:id/events) while it works.

   1. validate the draft and dry-run the project insert (rolled back) — every
      reference/rule error surfaces before anything touches the disk;
   2. scaffold the folder (async, yields between steps so SSE flushes);
   3. ONE transaction: create the project, re-file the setup events under it,
      delete the draft.
   Any failure leaves no project record; a folder we created for a new project is
   removed again; the draft stays (and its stream gets `setup.failed`). */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import type { Module } from '../blueprint/modules.ts';
import type { Project, ProjectCreate } from '../db/projects.ts';
import type { Store } from '../db/store.ts';
import { slugify } from '../domain/ids.ts';
import { conflict, invalid } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox, SandboxError, toSandboxRelative } from '../fs/sandbox.ts';
import { type Step, scaffold } from './scaffold.ts';

export type FinishDeps = {
  store: Store;
  events: EventLog;
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

const ROLLBACK = Symbol('dry-run');
/** Run the insert inside a transaction and always roll it back: same rules, no trace. */
function dryRunCreate(store: Store, input: ProjectCreate): void {
  try {
    store.tx(() => {
      store.projects.create(input);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}

/* one Setter per draft at a time (the scaffold awaits; a double click must not run it twice) */
const running = new Set<string>();

export async function finishDraft(deps: FinishDeps, draftId: string): Promise<FinishResult> {
  const { store, sandbox, events } = deps;
  const draft = store.drafts.require(draftId);
  const name = draft.name.trim();
  if (!name) throw invalid('The draft needs a name before it can be finished');
  if (running.has(draft.id)) throw conflict('The Project Setter is already working on this draft');

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
  const input: ProjectCreate = {
    name,
    note: draft.about.slice(0, 500),
    folder,
    ...(draft.orchestratorId ? { orchestratorId: draft.orchestratorId } : {}),
    ...staffing(draft.plan),
  };
  dryRunCreate(store, input); // folder ownership, orchestrator, teams, specialists

  running.add(draft.id);
  try {
    const r = await scaffold({
      sandbox,
      folder,
      name,
      about: draft.about,
      modules: deps.modules(),
      controlHome: deps.controlHome,
      date: deps.today(),
      mode: draft.mode,
      onStep: (s) => events.append('draft', draft.id, { type: 'setup.step', payload: s }),
    });
    const project = store.tx(() => {
      const p = store.projects.create(input);
      events.copy({ scope: 'draft', id: draft.id }, { scope: 'project', id: p.id });
      store.drafts.deleteRecord(draft.id);
      return p;
    });
    return { project, steps: r.steps, commit: r.commit };
  } catch (e) {
    if (draft.mode === 'new' && !there) rmSync(abs, { recursive: true, force: true });
    const err = e instanceof SandboxError ? invalid(e.message) : e;
    if (store.drafts.record(draft.id)) {
      const message = err instanceof Error ? err.message : 'Setup failed';
      events.append('draft', draft.id, {
        type: 'setup.failed',
        payload: { message: message.slice(0, 2000) },
      });
    }
    throw err;
  } finally {
    running.delete(draft.id);
  }
}

/** Local calendar date, YYYY-MM-DD. */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
