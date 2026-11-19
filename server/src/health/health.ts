/* Health check (B7): a read-only look at a project's code, graded on modularity, cleanliness and
   reusability (the studio's CODING/UX principles), plus its git/GitHub status.

   - One structured crew call (src/crew/structured.ts) — contract `health`, one repair, 502 on a
     second miss — run IN the project folder with read-only tools only: Read/Glob/Grep and plain
     read-only git/ls commands. No Write/Edit tool exists in the run, so it cannot change a file.
   - Commissioned by the project's orchestrator (it owns the big picture); no secrets in the env.
   - Persisted (latest + history) and announced with a `health.checked` event. */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { crewSystemPrompt, json } from '../crew/prompts.ts';
import { type Crew, validateWith } from '../crew/structured.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { conflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import type { Caps } from '../runtime/runner.ts';
import { type GhProbe, type GitStatus, gitStatus } from './git-status.ts';

export const HEALTH = 'health';
export const HEALTH_CAPS: Caps = { maxTurns: 15, maxBudgetUsd: 1 };
export const HEALTH_TOOLS = ['Read', 'Glob', 'Grep', 'Bash'] as const;
/** Read-only only: no Write/Edit tool, and Bash limited to commands that can't change anything. */
export const HEALTH_ALLOWED = [
  'Read',
  'Glob',
  'Grep',
  'Bash(ls)',
  'Bash(ls *)',
  'Bash(pwd)',
  'Bash(git status)',
  'Bash(git status *)',
  'Bash(git log *)',
  'Bash(git diff *)',
  'Bash(git show *)',
  'Bash(git ls-files)',
  'Bash(git ls-files *)',
  'Bash(git shortlog *)',
];

const Grade = z.enum(['A', 'B', 'C', 'D', 'F']);
const Aspect = z.strictObject({
  grade: Grade,
  good: z.string().trim().min(1).max(1000),
  fix: z.string().trim().min(1).max(1000),
});
export const HealthSchema = z.strictObject({
  modularity: Aspect,
  cleanliness: Aspect,
  reusability: Aspect,
  summary: z.string().trim().min(1).max(1000),
});
export type HealthGrades = z.output<typeof HealthSchema>;
export type HealthReport = HealthGrades & {
  id: string;
  projectId: string;
  git: GitStatus;
  usage: { attempts: number; turns: number; input: number; output: number };
  createdAt: string;
};

const ALTITUDE =
  'For this job you are the studio’s health inspector: you read the code and its history, you never change anything. Judge like a senior reviewer, then say it in plain words a non-engineer understands.';
const CRITERIA = {
  modularity:
    'Can any part be understood and fixed on its own? Clear module boundaries, small explicit interfaces, low coupling.',
  cleanliness:
    'Is it tidy? No dead code, stray files or style drift; consistent naming; tests where they matter; a README that matches.',
  reusability:
    'Is each thing defined once and reused? Shared helpers/components instead of copy-paste — but no abstraction without a second real caller.',
};

type Row = { id: string; project_id: string; report: string; git: string; usage: string; created_at: string };
const toReport = (r: Row): HealthReport => ({
  id: r.id,
  projectId: r.project_id,
  ...(JSON.parse(r.report) as HealthGrades),
  git: JSON.parse(r.git) as GitStatus,
  usage: JSON.parse(r.usage),
  createdAt: r.created_at,
});

export function createHealth(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  crew: Crew;
  sandbox: string;
  /** GitHub visibility probe; null = gh not installed. Called only when a GitHub remote exists. */
  gh: GhProbe | null;
}) {
  const { db, store, events, crew } = deps;
  const checking = new Set<string>();
  const folderOf = (projectId: string) => {
    const p = store.projects.require(projectId);
    if (!p.folder) throw conflict(`Project '${projectId}' has no folder yet — set it up first`);
    const dir = resolveInSandbox(deps.sandbox, p.folder);
    if (!existsSync(dir)) throw conflict(`Project folder '${p.folder}' is missing on disk`);
    return { p, dir };
  };
  const history = (projectId: string, limit = 20): HealthReport[] =>
    (
      db
        .prepare(
          'SELECT * FROM health_reports WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
        )
        .all(projectId, limit) as Row[]
    ).map(toReport);

  return {
    /** The latest stored report, no disk or git access (the orchestrator's chat summary). */
    latest: (projectId: string): HealthReport | null => history(projectId, 1)[0] ?? null,
    /** Latest report + history, and the git status right now (local only — no network on reads). */
    async get(projectId: string) {
      const { dir } = folderOf(projectId);
      const all = history(projectId);
      return { latest: all[0] ?? null, history: all, git: await gitStatus(dir) };
    },

    async check(projectId: string, opts: { caps?: Partial<Caps> } = {}): Promise<HealthReport> {
      const { p, dir } = folderOf(projectId);
      if (checking.has(projectId)) throw conflict('A health check is already running on this project');
      const orch = store.agents.require(p.orchestratorId);
      checking.add(projectId);
      const emit = (e: Parameters<EventLog['append']>[2]) => {
        try {
          events.append('project', projectId, e);
        } catch {
          /* never fail a check on a progress line */
        }
      };
      try {
        emit({
          type: 'agent.status',
          payload: {
            agentId: orch.id,
            status: 'working',
            activity: { kind: 'reviewing', label: 'Checking the project’s health' },
          },
        });
        const git = await gitStatus(dir, { gh: deps.gh });
        const task = [
          `Project: ${json({ name: p.name, about: p.note })}`,
          `Git right now: ${json({ branch: git.branch, clean: git.clean, changes: git.changes, commits: git.commits, lastCommit: git.lastCommit?.subject ?? null })}`,
          'You are in the project folder. Look around with Read, Glob, Grep and read-only commands (one plain command at a time: ls, git status, git log, git diff, git show, git ls-files). You cannot change files — don’t try.',
          `Grade each aspect A (excellent) to F (failing):\n${Object.entries(CRITERIA)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')}`,
          'An almost empty project is fine — grade what is there and say what to watch as it grows. Keep it to a few files’ worth of reading.',
          `Answer with one JSON object shaped like this: ${json({
            modularity: {
              grade: 'A–F',
              good: 'What already works, in one or two sentences.',
              fix: 'The one most useful fix.',
            },
            cleanliness: { grade: 'A–F', good: '…', fix: '…' },
            reusability: { grade: 'A–F', good: '…', fix: '…' },
            summary: 'One plain sentence on the overall health.',
          })}`,
        ].join('\n\n');
        const r = await crew.call({
          who: orch.name,
          contract: HEALTH,
          track: { scope: 'project', ownerId: projectId, agentId: orch.id, kind: 'reviewing' },
          systemPrompt: crewSystemPrompt(orch, ALTITUDE),
          task,
          validate: validateWith(HealthSchema),
          caps: { ...HEALTH_CAPS, ...opts.caps },
          workspace: { cwd: dir, tools: HEALTH_TOOLS, allowedTools: HEALTH_ALLOWED },
          onEvent: (e) => {
            if (e.kind === 'tokens')
              emit({ type: 'tokens', payload: { agentId: orch.id, input: e.input, output: e.output } });
            else if (e.kind === 'activity')
              emit({
                type: 'agent.status',
                payload: { agentId: orch.id, status: e.status, activity: e.activity },
              });
          },
        });
        const usage = {
          attempts: r.attempts,
          turns: r.outcomes.reduce((n, o) => n + o.turns, 0),
          input: r.outcomes.reduce((n, o) => n + o.usage.input + o.usage.cacheRead + o.usage.cacheWrite, 0),
          output: r.outcomes.reduce((n, o) => n + o.usage.output, 0),
        };
        const id = randomUUID();
        db.prepare(
          'INSERT INTO health_reports (id, project_id, report, git, usage, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          id,
          projectId,
          JSON.stringify(r.value),
          JSON.stringify(git),
          JSON.stringify(usage),
          new Date().toISOString(),
        );
        emit({
          type: 'health.checked',
          payload: {
            reportId: id,
            modularity: r.value.modularity.grade,
            cleanliness: r.value.cleanliness.grade,
            reusability: r.value.reusability.grade,
            summary: r.value.summary,
            ...(git.clean === false ? { dirty: true } : {}),
          },
        });
        return history(projectId, 1)[0] as HealthReport;
      } finally {
        checking.delete(projectId);
        emit({ type: 'agent.status', payload: { agentId: orch.id, status: 'idle' } });
      }
    },
  };
}
export type Health = ReturnType<typeof createHealth>;
