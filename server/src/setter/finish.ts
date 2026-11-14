/* The Project Setter on a draft, then draft → project (user's v5 order: the Setter sets the project
   up first, then the orchestrator enters and picks the team).

   setupDraft (POST /drafts/:id/setup): scaffold the folder (new or adopt) with the steps streamed
   live on the draft's event stream (GET /drafts/:id/events); the draft then owns the folder
   (`setupAt`). Idempotent and resumable: running it again only adds what's missing.
   A failed FIRST setup of a new project removes the folder it just created; nothing else is ever
   removed — not on a later failure, not when the draft is deleted.

   finishDraft (POST /drafts/:id/finish): validate (dry-run the insert, rolled back), then ONE
   transaction: create the project (on set: status live, the draft's tile), re-file the setup events
   under it, delete the draft. No scaffolding here — except for a draft that was never set up
   (API back-compat), which gets its setup first. Any failure leaves no project record. */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { Module } from '../blueprint/modules.ts';
import type { Draft } from '../db/drafts.ts';
import type { Project, ProjectCreate } from '../db/projects.ts';
import type { Store } from '../db/store.ts';
import { slugify } from '../domain/ids.ts';
import { pendingBriefs, staffingOf } from '../domain/plan.ts';
import { tileFor } from '../domain/tile.ts';
import { conflict, invalid } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox, SandboxError, toSandboxRelative } from '../fs/sandbox.ts';
import type { Github } from '../github/github.ts';
import type { WorkClock } from '../office/work-time.ts';
import { type Step, scaffold } from './scaffold.ts';

export type FinishDeps = {
  store: Store;
  events: EventLog;
  sandbox: string;
  controlHome: string;
  modules: () => Module[];
  today: () => string;
  /** G1: the GitHub step at the end of setup (absent → no GitHub step). */
  github?: Github;
  /** The office's work clock: Rivet's setup time, moved to the project on finish. */
  clock?: WorkClock;
};
export type FinishResult = { project: Project; steps: Step[]; commit: string | null };

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
const guarded = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
  if (running.has(id)) throw conflict('The Project Setter is already working on this draft');
  running.add(id);
  try {
    return await fn();
  } finally {
    running.delete(id);
  }
};

export type SetupResult = { draft: Draft; steps: Step[]; commit: string | null };

/** The draft's folder (sandbox-relative): the one it set up, else what it asked for / its name. */
function folderOf(deps: FinishDeps, draft: Draft): string {
  const name = draft.name.trim();
  if (!name) throw invalid('The draft needs a name before it can be set up');
  const folder = guard(() => toSandboxRelative(deps.sandbox, draft.folder ?? slugify(name, 'project')));
  if (!folder) throw invalid('A project folder cannot be the sandbox root itself');
  return folder;
}

/** Rivet at work: the scaffold, timed on the draft (the work clock's "Setup"). */
function runSetup(deps: FinishDeps, draft: Draft): Promise<SetupResult> {
  const rivet = deps.store.agents.list().find((a) => a.kind === 'setter');
  if (!deps.clock || !rivet) return scaffoldDraft(deps, draft);
  return deps.clock.track({ scope: 'draft', ownerId: draft.id, agentId: rivet.id, kind: 'setup' }, () =>
    scaffoldDraft(deps, draft),
  );
}

async function scaffoldDraft(deps: FinishDeps, draft: Draft): Promise<SetupResult> {
  const { store, sandbox, events } = deps;
  const folder = folderOf(deps, draft);
  const abs = guard(() => resolveInSandbox(sandbox, folder));
  const there = existsSync(abs);
  const again = !!draft.setupAt;
  if (!again) {
    if (store.projects.list().some((p) => p.folder === folder))
      throw conflict(`'${folder}' is already an AI Studio project`, { folder });
    if (store.drafts.ownerOf(folder, draft.id))
      throw conflict(`Another draft in setup already owns '${folder}'`, { folder });
    if (draft.mode === 'new' && there && (!statSync(abs).isDirectory() || readdirSync(abs).length > 0))
      throw conflict(`'${folder}' already exists in the sandbox — adopt it instead, or pick another folder`, {
        folder,
      });
  }
  if (draft.mode === 'adopt' && (!there || !statSync(abs).isDirectory()))
    throw invalid(`Nothing to adopt: '${folder}' is not a folder in the sandbox`, { folder });
  const name = draft.name.trim();
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
    const steps = [...r.steps];
    /* G1: a GitHub repo by default (private, the folder's name); never fails the setup */
    if (deps.github) {
      const want = draft.github ?? deps.github.settings.githubByDefault();
      events.append('draft', draft.id, {
        type: 'setup.step',
        payload: { step: 'github', status: 'running', detail: 'Connecting GitHub' },
      });
      const s = await deps.github.onSetup(abs, folder, {
        want,
        name: basename(folder),
        ...(draft.about.trim() ? { description: draft.about.trim() } : {}),
      });
      events.append('draft', draft.id, { type: 'setup.step', payload: s });
      steps.push(s);
    }
    const saved = store.drafts.markSetUp(draft.id, folder, r.commit ?? draft.setupCommit);
    return { draft: saved, steps, commit: r.commit };
  } catch (e) {
    /* only what THIS run created from nothing goes — never a folder that was there before */
    if (draft.mode === 'new' && !there && !again) rmSync(abs, { recursive: true, force: true });
    const err = e instanceof SandboxError ? invalid(e.message) : e;
    if (store.drafts.record(draft.id)) {
      const message = err instanceof Error ? err.message : 'Setup failed';
      events.append('draft', draft.id, {
        type: 'setup.failed',
        payload: { message: message.slice(0, 2000) },
      });
    }
    throw err;
  }
}

/** POST /drafts/:id/setup — the Project Setter sets the draft's folder up (again: only what's missing). */
export function setupDraft(deps: FinishDeps, draftId: string): Promise<SetupResult> {
  const draft = deps.store.drafts.require(draftId);
  folderOf(deps, draft); // name + folder errors before the guard
  return guarded(draft.id, () => runSetup(deps, deps.store.drafts.require(draftId)));
}

export async function finishDraft(deps: FinishDeps, draftId: string): Promise<FinishResult> {
  const { store, sandbox, events } = deps;
  const draft = store.drafts.require(draftId);
  const folder = folderOf(deps, draft);
  if (draft.plan && pendingBriefs(draft.plan) > 0)
    throw conflict('Accept the plan first — the Agent Creator still has agents or teams to design', {
      newAgents: draft.plan.newAgents.length,
      newTeams: draft.plan.newTeams.length,
    });
  const name = draft.name.trim();
  const input: ProjectCreate = {
    name,
    note: draft.about.slice(0, 500),
    folder,
    status: 'live',
    tile: tileFor(name),
    ...(draft.orchestratorId ? { orchestratorId: draft.orchestratorId } : {}),
    ...(draft.plan ? staffingOf(draft.plan) : {}),
    ...(draft.plan?.collaboration ? { collaboration: draft.plan.collaboration } : {}),
  };

  return guarded(draft.id, async () => {
    dryRunCreate(store, input); // folder ownership, orchestrator, teams, specialists — before any disk work
    let steps: Step[] = [];
    let commit = draft.setupCommit;
    if (!draft.setupAt) {
      const r = await runSetup(deps, draft); // back-compat: a draft that skipped POST /setup
      steps = r.steps;
      commit = r.commit;
    } else {
      const abs = guard(() => resolveInSandbox(sandbox, folder));
      if (!existsSync(abs) || !statSync(abs).isDirectory())
        throw conflict(`The set-up folder '${folder}' is gone — run the setup again`, { folder });
    }
    const project = store.tx(() => {
      const p = store.projects.create(input);
      events.copy({ scope: 'draft', id: draft.id }, { scope: 'project', id: p.id });
      deps.clock?.moveDraft(draft.id, p.id);
      store.drafts.deleteRecord(draft.id);
      return p;
    });
    return { project, steps, commit };
  });
}

/** Local calendar date, YYYY-MM-DD. */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
