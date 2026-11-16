/* The one reader of an office's work: every run and every crew call of a project as a `Span` (who, what kind,
   why they were asked, how it ended, turns, tokens, start/end). The work clock and agent performance both
   tally these; nothing else reads `runs` + `crew_time` for time or tokens. */
import type { Db } from '../db/connection.ts';
import { type Row, rows } from '../db/util.ts';

export const WORK_KINDS = ['thinking', 'building', 'reviewing', 'research', 'setup'] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
/** Why an agent worked: dispatched or crew work, answering a fellow agent's call, or a chat turn. */
export type Asked = 'task' | 'call' | 'chat';

/** A run row without a stored kind (before OFFICE): the orchestrator thinks, a reviewer reviews, a report is
    research, everything else builds. */
export function kindOfRun(r: { kind: string | null; task: string; agentKind: string | null }): WorkKind {
  if (r.kind && (WORK_KINDS as readonly string[]).includes(r.kind)) return r.kind as WorkKind;
  if (r.agentKind === 'orchestrator') return 'thinking';
  if (/^You are reviewing /.test(r.task)) return 'reviewing';
  if (/file_report/.test(r.task)) return 'research';
  return 'building';
}

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number };
export const addTokens = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});
/** live = still going; stopped = ended failed or cancelled; done = finished. */
export type Outcome = 'live' | 'done' | 'stopped';

export type Span = {
  agentId: string;
  kind: WorkKind;
  asked: Asked;
  outcome: Outcome;
  turns: number;
  /** null = not measured (crew calls from before tokens were saved). */
  tokens: Tokens | null;
  start: string;
  end: string | null;
};

const ASKED: readonly string[] = ['task', 'call', 'chat'] satisfies Asked[];
const askedOf = (v: unknown): Asked => (ASKED.includes(v as string) ? (v as Asked) : 'task');

function outcomeOf(status: unknown, ended: boolean): Outcome {
  if (status === 'failed' || status === 'cancelled') return 'stopped';
  if (status === 'running' || (status == null && !ended)) return 'live';
  return 'done';
}

function tokensOf(r: Row): Tokens | null {
  if (r.input_tokens == null) return null;
  return {
    input: r.input_tokens as number,
    output: (r.output_tokens as number) ?? 0,
    cacheRead: (r.cache_read_tokens as number) ?? 0,
    cacheWrite: (r.cache_write_tokens as number) ?? 0,
  };
}

function runSpans(db: Db, projectId: string): Span[] {
  return rows<Row>(
    db
      .prepare(
        `SELECT r.agent_id, r.kind, r.asked, r.task, r.status, r.turns, r.started_at, r.ended_at,
                r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_write_tokens, a.kind AS agent_kind
         FROM runs r LEFT JOIN agents a ON a.id = r.agent_id WHERE r.project_id = ?`,
      )
      .all(projectId),
  ).map((r) => ({
    agentId: r.agent_id as string,
    kind: kindOfRun({
      kind: (r.kind as string | null) ?? null,
      task: r.task as string,
      agentKind: (r.agent_kind as string | null) ?? null,
    }),
    asked: askedOf(r.asked),
    outcome: outcomeOf(r.status, r.ended_at != null),
    turns: (r.turns as number) ?? 0,
    tokens: tokensOf(r),
    start: r.started_at as string,
    end: (r.ended_at as string | null) ?? null,
  }));
}

function crewSpans(db: Db, projectId: string): Span[] {
  return rows<Row>(
    db
      .prepare(
        `SELECT agent_id, kind, asked, status, turns, started_at, ended_at,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
         FROM crew_time WHERE scope = 'project' AND owner_id = ?`,
      )
      .all(projectId),
  ).map((r) => ({
    agentId: r.agent_id as string,
    kind: r.kind as WorkKind,
    asked: askedOf(r.asked),
    outcome: outcomeOf(r.status, r.ended_at != null),
    turns: (r.turns as number) ?? 0,
    tokens: tokensOf(r),
    start: r.started_at as string,
    end: (r.ended_at as string | null) ?? null,
  }));
}

/** Every run and crew call on a project, in no particular order. */
export function readSpans(db: Db, projectId: string): Span[] {
  return [...runSpans(db, projectId), ...crewSpans(db, projectId)];
}

/** How long a span lasted: still going → up to `nowMs`; ended without a time (shouldn't happen) → nothing. */
export function spanMs(s: Span, nowMs: number): number {
  const from = Date.parse(s.start);
  const to = s.end ? Date.parse(s.end) : s.outcome === 'live' ? nowMs : from;
  return Math.max(0, (Number.isFinite(to) ? to : from) - from) || 0;
}
