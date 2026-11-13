/* The Project Setter, deterministic part: bring a sandbox folder up to the AI Studio
   scaffold. One function for new and adopted folders — it only ever ADDS what's
   missing (never overwrites; the one edit it makes is appending .env to a .gitignore
   that doesn't cover it), then commits exactly what it added. Every path goes
   through the sandbox guard. Progress is reported as ordered steps. */
import { appendFileSync, chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileClaudeMd, type Module } from '../blueprint/modules.ts';
import {
  dotProject,
  GITIGNORE,
  GITIGNORE_ENV_BLOCK,
  gitignoreCoversEnv,
  initUpdateDir,
  initUpdatePlan,
  initUpdateWiki,
  issuesTxt,
} from '../blueprint/templates.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import * as git from './git.ts';

export type StepStatus = 'running' | 'done' | 'kept' | 'skipped';
export type Step = { step: string; status: StepStatus; detail: string };

/** What the Setter makes, in order (also served by GET /blueprint). */
export const SCAFFOLD_TREE = [
  { path: '.project', kind: 'file', desc: 'Project marker — modules used, secrets, generated date' },
  { path: 'CLAUDE.md', kind: 'file', desc: 'Compiled rulebook, built from the global modules' },
  { path: '.gitignore', kind: 'file', desc: 'Always covers .env' },
  { path: '.env', kind: 'file', desc: "This project's secrets — never committed" },
  { path: 'updates/', kind: 'dir', desc: 'One folder per update; starts with the INIT update' },
  { path: 'issues.txt', kind: 'file', desc: 'Running list of known issues & TODOs' },
] as const;

export type ScaffoldInput = {
  sandbox: string;
  /** Sandbox-relative project folder. */
  folder: string;
  name: string;
  about: string;
  modules: readonly Module[];
  controlHome: string;
  /** YYYY-MM-DD */
  date: string;
  mode: 'new' | 'adopt';
  onStep?: (s: Step) => void;
};
export type ScaffoldResult = { steps: Step[]; added: string[]; commit: string | null };

const present = (abs: string) => {
  try {
    lstatSync(abs); // a symlink counts as present — we never follow it to write
    return true;
  } catch {
    return false;
  }
};

export async function scaffold(input: ScaffoldInput): Promise<ScaffoldResult> {
  const { sandbox, folder, name, about, modules, controlHome, date, mode } = input;
  const at = (rel = '') => resolveInSandbox(sandbox, rel ? join(folder, rel) : folder);
  const steps: Step[] = [];
  const added: string[] = [];
  const emit = (step: string, status: StepStatus, detail: string) => {
    const s = { step, status, detail };
    if (status !== 'running') steps.push(s);
    input.onStep?.(s);
  };
  /** yield after each finished step so listeners (SSE) get it on the wire while we keep going */
  const tick = () => new Promise<void>((r) => setImmediate(r));
  /** create a new file; 'wx' refuses to replace anything that appeared meanwhile (or a dangling symlink) */
  const create = (rel: string, content: string, fileMode?: number) => {
    const abs = at(rel);
    mkdirSync(at(rel.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(abs, content, { flag: 'wx', ...(fileMode ? { mode: fileMode } : {}) });
    if (fileMode) chmodSync(abs, fileMode);
    added.push(rel);
  };
  const file = (rel: string, content: () => string, opts: { detail: string; mode?: number }) => {
    emit(rel, 'running', `Checking ${rel}`);
    if (present(at(rel))) return emit(rel, 'kept', `${rel} already exists — left untouched`);
    create(rel, content(), opts.mode);
    emit(rel, 'done', opts.detail);
  };

  /* preflight: every target must resolve inside the sandbox BEFORE anything is written */
  const root = at();
  for (const t of SCAFFOLD_TREE) at(t.path);

  emit('folder', 'running', `Preparing ${folder}`);
  if (present(root)) emit('folder', 'kept', `${folder} exists`);
  else {
    mkdirSync(root, { recursive: true });
    emit('folder', 'done', `Created ${folder}`);
  }

  const moduleNames = modules.map((m) => m.name);
  file(
    '.project',
    () => dotProject({ name, created: date, modules: moduleNames, secrets: [], generated: date }),
    {
      detail: `Marked as an AI Studio project (${moduleNames.length} modules)`,
    },
  );
  await tick();
  file('CLAUDE.md', () => compileClaudeMd({ name, about, modules, controlHome }), {
    detail: `Compiled from ${moduleNames.join(', ') || 'no modules'}`,
  });
  await tick();

  emit('.gitignore', 'running', 'Checking .gitignore');
  const gi = at('.gitignore');
  if (!present(gi)) {
    create('.gitignore', GITIGNORE);
    emit('.gitignore', 'done', 'Created — keeps .env out of git');
  } else if (gitignoreCoversEnv(readFileSync(gi, 'utf8'))) {
    emit('.gitignore', 'kept', 'Already covers .env');
  } else {
    appendFileSync(gi, GITIGNORE_ENV_BLOCK);
    added.push('.gitignore');
    emit('.gitignore', 'done', 'Appended .env (existing lines untouched)');
  }

  await tick();
  file('.env', () => '', { detail: 'Empty secrets file (0600, never committed)', mode: 0o600 });

  await tick();
  emit('updates/', 'running', 'Checking updates/');
  if (present(at('updates'))) emit('updates/', 'kept', 'updates/ already exists');
  else {
    const dir = initUpdateDir(date);
    create(`${dir}/update v1.md`, initUpdatePlan(name, about, date));
    create(`${dir}/wiki.md`, initUpdateWiki());
    emit('updates/', 'done', `Opened the first update: ${dir.slice('updates/'.length)}`);
  }

  await tick();
  file('issues.txt', () => issuesTxt(name), { detail: 'Started the issues list' });
  await tick();

  emit('git', 'running', 'Checking git');
  if (git.isRepo(root)) emit('git', 'kept', 'Already a git repository');
  else {
    await git.init(root);
    emit('git', 'done', 'Initialised a local git repository (main)');
  }

  emit('commit', 'running', 'Committing');
  const toCommit = added.filter((p) => p !== '.env');
  let commit: string | null = null;
  if (toCommit.length === 0) emit('commit', 'skipped', 'Nothing was added — nothing to commit');
  else {
    const msg =
      mode === 'new'
        ? `AI Studio: set up ${name}\n\nScaffold by the Project Setter: ${toCommit.join(', ')}.`
        : `AI Studio: adopt ${name} — add the missing scaffold\n\nAdded: ${toCommit.join(', ')}.`;
    commit = await git.commitOnly(root, toCommit, msg);
    emit(
      'commit',
      'done',
      `${mode === 'new' ? 'First commit' : 'Committed the additions'} ${commit.slice(0, 7)} (local only)`,
    );
  }
  return { steps, added, commit };
}

export type ScaffoldReport = {
  folder: string;
  exists: boolean;
  items: { path: string; kind: 'file' | 'dir'; desc: string; present: boolean }[];
  complete: boolean;
  git: { repo: boolean; head: string | null; commits: number };
};

/** What's on disk vs what the scaffold expects. Read-only. */
export function inspect(sandbox: string, folder: string): ScaffoldReport {
  const root = resolveInSandbox(sandbox, folder);
  const exists = present(root);
  const items = SCAFFOLD_TREE.map((t) => ({
    ...t,
    present: exists && present(resolveInSandbox(sandbox, join(folder, t.path))),
  }));
  const repo = exists && git.isRepo(root);
  return {
    folder,
    exists,
    items,
    complete: items.every((i) => i.present),
    git: { repo, head: repo ? git.head(root) : null, commits: repo ? git.commitCount(root) : 0 },
  };
}
