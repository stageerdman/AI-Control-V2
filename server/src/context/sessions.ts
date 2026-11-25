/* The run_sessions table (migration 58): one row per CLI session of a run. Plain SQL, no rules. */
import type { Db } from '../db/connection.ts';
import { type Row, rows } from '../db/util.ts';
import type { StartedBy } from './meter.ts';

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type RunSession = {
  runId: string;
  n: number;
  projectId: string;
  agentId: string;
  /** The run's kind of work (building, reviewing…); null = not set. */
  kind: string | null;
  startedBy: StartedBy;
  /** Why it began, in words (a fresh rework: why it didn't resume). */
  why: string | null;
  /** A resume: time since the session it carries on last ended. */
  resumedGapMs: number | null;
  startedAt: string;
  endedAt: string;
  turns: number;
  firstContext: number | null;
  peakContext: number | null;
  lastContext: number | null;
  usage: Usage;
  costUsd: number | null;
  /** How it ended: succeeded | failed | cancelled | forget | limit | closed. */
  endedBy: string;
};

const toSession = (r: Row): RunSession => ({
  runId: r.run_id as string,
  n: r.n as number,
  projectId: r.project_id as string,
  agentId: r.agent_id as string,
  kind: (r.kind as string) ?? null,
  startedBy: r.started_by as StartedBy,
  why: (r.why as string) ?? null,
  resumedGapMs: (r.resumed_gap_ms as number) ?? null,
  startedAt: r.started_at as string,
  endedAt: r.ended_at as string,
  turns: r.turns as number,
  firstContext: (r.first_context as number) ?? null,
  peakContext: (r.peak_context as number) ?? null,
  lastContext: (r.last_context as number) ?? null,
  usage: {
    input: r.input_tokens as number,
    output: r.output_tokens as number,
    cacheRead: r.cache_read_tokens as number,
    cacheWrite: r.cache_write_tokens as number,
  },
  costUsd: (r.cost_usd as number) ?? null,
  endedBy: r.ended_by as string,
});

export function sessionsRepo(db: Db) {
  return {
    insert(s: RunSession): void {
      db.prepare(
        `INSERT INTO run_sessions (run_id, n, project_id, agent_id, kind, started_by, why, resumed_gap_ms, started_at,
           ended_at, turns, first_context, peak_context, last_context, input_tokens, output_tokens, cache_read_tokens,
           cache_write_tokens, cost_usd, ended_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        s.runId,
        s.n,
        s.projectId,
        s.agentId,
        s.kind,
        s.startedBy,
        s.why,
        s.resumedGapMs,
        s.startedAt,
        s.endedAt,
        s.turns,
        s.firstContext,
        s.peakContext,
        s.lastContext,
        s.usage.input,
        s.usage.output,
        s.usage.cacheRead,
        s.usage.cacheWrite,
        s.costUsd,
        s.endedBy,
      );
    },
    ofRun(runId: string): RunSession[] {
      return rows<Row>(db.prepare('SELECT * FROM run_sessions WHERE run_id = ? ORDER BY n').all(runId)).map(
        toSession,
      );
    },
    /** The run's last session (what a --resume of the run would reload); null = not measured. */
    lastOf(runId: string): RunSession | null {
      const r = db.prepare('SELECT * FROM run_sessions WHERE run_id = ? ORDER BY n DESC LIMIT 1').get(runId);
      return r ? toSession(r as Row) : null;
    },
    /** A project's sessions that started at or after `since` (ISO), oldest first. */
    ofProject(projectId: string, since = ''): RunSession[] {
      return rows<Row>(
        db
          .prepare('SELECT * FROM run_sessions WHERE project_id = ? AND started_at >= ? ORDER BY started_at')
          .all(projectId, since),
      ).map(toSession);
    },
  };
}
export type SessionsRepo = ReturnType<typeof sessionsRepo>;
