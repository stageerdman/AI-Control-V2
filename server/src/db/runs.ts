/* Runs + asks repository (plain SQL, no rules — the runtime service owns those). */
import type { Db } from './connection.ts';
import { now } from './util.ts';

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';
export type Run = {
  id: string;
  projectId: string;
  agentId: string;
  teamId: string | null;
  task: string;
  status: RunStatus;
  runner: string;
  model: string | null;
  caps: { maxTurns: number; maxBudgetUsd: number };
  sessionId: string | null;
  result: string | null;
  error: string | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number | null;
  turns: number;
  startedAt: string;
  endedAt: string | null;
};
export type Ask = {
  id: string;
  runId: string;
  projectId: string;
  agentId: string;
  question: string;
  options: string[] | null;
  status: 'open' | 'answered' | 'cancelled';
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
};

type RunRow = Record<string, unknown>;
const toRun = (r: RunRow): Run => ({
  id: r.id as string,
  projectId: r.project_id as string,
  agentId: r.agent_id as string,
  teamId: (r.team_id as string) ?? null,
  task: r.task as string,
  status: r.status as RunStatus,
  runner: r.runner as string,
  model: (r.model as string) ?? null,
  caps: JSON.parse(r.caps as string),
  sessionId: (r.session_id as string) ?? null,
  result: (r.result as string) ?? null,
  error: (r.error as string) ?? null,
  usage: {
    input: r.input_tokens as number,
    output: r.output_tokens as number,
    cacheRead: r.cache_read_tokens as number,
    cacheWrite: r.cache_write_tokens as number,
  },
  costUsd: (r.cost_usd as number) ?? null,
  turns: r.turns as number,
  startedAt: r.started_at as string,
  endedAt: (r.ended_at as string) ?? null,
});
const toAsk = (r: RunRow): Ask => ({
  id: r.id as string,
  runId: r.run_id as string,
  projectId: r.project_id as string,
  agentId: r.agent_id as string,
  question: r.question as string,
  options: r.options ? JSON.parse(r.options as string) : null,
  status: r.status as Ask['status'],
  answer: (r.answer as string) ?? null,
  createdAt: r.created_at as string,
  answeredAt: (r.answered_at as string) ?? null,
});

export function runsRepo(db: Db) {
  return {
    insert(
      r: Pick<Run, 'id' | 'projectId' | 'agentId' | 'teamId' | 'task' | 'runner' | 'model' | 'caps'>,
    ): Run {
      db.prepare(
        `INSERT INTO runs (id, project_id, agent_id, team_id, task, status, runner, model, caps, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
      ).run(r.id, r.projectId, r.agentId, r.teamId, r.task, r.runner, r.model, JSON.stringify(r.caps), now());
      return this.get(r.id) as Run;
    },
    get: (id: string): Run | null => {
      const r = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
      return r ? toRun(r) : null;
    },
    list: (projectId: string): Run[] =>
      (
        db
          .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC, rowid DESC')
          .all(projectId) as RunRow[]
      ).map(toRun),
    live: (projectId: string, agentId: string): Run | null => {
      const r = db
        .prepare("SELECT * FROM runs WHERE project_id = ? AND agent_id = ? AND status = 'running'")
        .get(projectId, agentId) as RunRow | undefined;
      return r ? toRun(r) : null;
    },
    setSession: (id: string, sessionId: string) =>
      db.prepare('UPDATE runs SET session_id = ? WHERE id = ?').run(sessionId, id),
    finish(
      id: string,
      o: {
        status: Exclude<RunStatus, 'running'>;
        result?: string;
        error?: string;
        sessionId?: string;
        usage: Run['usage'];
        costUsd?: number;
        turns: number;
      },
    ) {
      db.prepare(
        `UPDATE runs SET status = ?, result = ?, error = ?, session_id = COALESCE(?, session_id), input_tokens = ?, output_tokens = ?,
           cache_read_tokens = ?, cache_write_tokens = ?, cost_usd = ?, turns = ?, ended_at = ? WHERE id = ?`,
      ).run(
        o.status,
        o.result ?? null,
        o.error ?? null,
        o.sessionId ?? null,
        o.usage.input,
        o.usage.output,
        o.usage.cacheRead,
        o.usage.cacheWrite,
        o.costUsd ?? null,
        o.turns,
        now(),
        id,
      );
    },
    /** After a crash/restart nothing is really running any more. */
    failInterrupted: () =>
      db
        .prepare(
          "UPDATE runs SET status = 'failed', error = 'Interrupted: the server stopped during the run', ended_at = ? WHERE status = 'running'",
        )
        .run(now()).changes,

    insertAsk(a: Pick<Ask, 'id' | 'runId' | 'projectId' | 'agentId' | 'question' | 'options'>): Ask {
      db.prepare(
        `INSERT INTO asks (id, run_id, project_id, agent_id, question, options, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      ).run(
        a.id,
        a.runId,
        a.projectId,
        a.agentId,
        a.question,
        a.options ? JSON.stringify(a.options) : null,
        now(),
      );
      return this.ask(a.id) as Ask;
    },
    ask: (id: string): Ask | null => {
      const r = db.prepare('SELECT * FROM asks WHERE id = ?').get(id) as RunRow | undefined;
      return r ? toAsk(r) : null;
    },
    asks: (projectId: string, status?: Ask['status']): Ask[] =>
      (
        (status
          ? db
              .prepare('SELECT * FROM asks WHERE project_id = ? AND status = ? ORDER BY created_at, rowid')
              .all(projectId, status)
          : db
              .prepare('SELECT * FROM asks WHERE project_id = ? ORDER BY created_at, rowid')
              .all(projectId)) as RunRow[]
      ).map(toAsk),
    answerAsk: (id: string, answer: string) =>
      db
        .prepare(
          "UPDATE asks SET status = 'answered', answer = ?, answered_at = ? WHERE id = ? AND status = 'open'",
        )
        .run(answer, now(), id).changes,
    cancelAsks: (runId: string) =>
      (
        db
          .prepare("UPDATE asks SET status = 'cancelled' WHERE run_id = ? AND status = 'open' RETURNING id")
          .all(runId) as { id: string }[]
      ).map((r) => r.id),
  };
}
export type RunsRepo = ReturnType<typeof runsRepo>;
