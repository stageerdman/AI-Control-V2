/* Chat history repository: every message of a run, kept after it ends (plain SQL, no rules —
   the runtime decides what is said; secrets are scrubbed before they get here). A chat = one run. */
import { randomUUID } from 'node:crypto';
import { redactSecrets } from '../events/redact.ts';
import type { Db } from './connection.ts';
import type { RunStatus } from './runs.ts';
import { now, type Row } from './util.ts';

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';
export type ChatMessage = {
  id: string;
  runId: string;
  projectId: string;
  agentId: string;
  seq: number;
  role: ChatRole;
  text: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};
export type ChatSummary = {
  runId: string;
  agentId: string;
  projectId: string;
  task: string;
  status: RunStatus;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  lastText: string | null;
};
export type NewChatMessage = {
  runId: string;
  projectId: string;
  agentId: string;
  role: ChatRole;
  text: string;
  meta?: Record<string, unknown> | null;
};

/** A message longer than this is cut (a pasted log must not bloat the db). */
export const MAX_MESSAGE_CHARS = 100_000;
const clip = (s: string) => (s.length > MAX_MESSAGE_CHARS ? `${s.slice(0, MAX_MESSAGE_CHARS - 1)}…` : s);

const toMessage = (r: Row): ChatMessage => ({
  id: r.id as string,
  runId: r.run_id as string,
  projectId: r.project_id as string,
  agentId: r.agent_id as string,
  seq: r.seq as number,
  role: r.role as ChatRole,
  text: r.text as string,
  meta: r.meta ? JSON.parse(r.meta as string) : null,
  createdAt: r.created_at as string,
});
/* task and the legacy lastText come raw from `runs` (never scrubbed there): mask API-key shapes on the way out. */
const shapes = (s: string | null) => (s === null ? null : redactSecrets(s, []).value);
const toSummary = (r: Row): ChatSummary => ({
  runId: r.id as string,
  agentId: r.agent_id as string,
  projectId: r.project_id as string,
  task: shapes(r.task as string) as string,
  status: r.status as RunStatus,
  sessionId: (r.session_id as string) ?? null,
  startedAt: r.started_at as string,
  endedAt: (r.ended_at as string) ?? null,
  messageCount: r.message_count as number,
  lastText: shapes((r.last_text as string) ?? null),
});

/** Appends to the run's chat under the next seq (the opening task is seq 0). */
export function appendChatMessage(db: Db, m: NewChatMessage): ChatMessage {
  const r = db
    .prepare(
      `INSERT INTO chat_messages (id, run_id, project_id, agent_id, seq, role, text, meta, created_at)
       SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(seq), -1) + 1, ?5, ?6, ?7, ?8 FROM chat_messages WHERE run_id = ?2
       RETURNING *`,
    )
    .get(
      randomUUID(),
      m.runId,
      m.projectId,
      m.agentId,
      m.role,
      clip(m.text),
      m.meta ? JSON.stringify(m.meta) : null,
      now(),
    ) as Row;
  return toMessage(r);
}

/* One summary per run; lastText = the agent's latest words (older runs without messages: their result). */
const SUMMARY = `
  SELECT r.id, r.agent_id, r.project_id, r.task, r.status, r.session_id, r.started_at, r.ended_at,
    (SELECT COUNT(*) FROM chat_messages c WHERE c.run_id = r.id) AS message_count,
    COALESCE(
      (SELECT c.text FROM chat_messages c WHERE c.run_id = r.id AND c.role = 'assistant' ORDER BY c.seq DESC LIMIT 1),
      r.result
    ) AS last_text
  FROM runs r`;

/** The agent's chats, newest first; `before` = an ISO time (exclusive) to page back from. */
export function listAgentChats(
  db: Db,
  agentId: string,
  { limit = 20, before }: { limit?: number; before?: string } = {},
): ChatSummary[] {
  return (
    db
      .prepare(
        `${SUMMARY} WHERE r.agent_id = ?1 AND (?2 IS NULL OR r.started_at < ?2)
         ORDER BY r.started_at DESC, r.rowid DESC LIMIT ?3`,
      )
      .all(agentId, before ?? null, limit) as Row[]
  ).map(toSummary);
}

export function latestAgentChat(db: Db, agentId: string): ChatSummary | null {
  return listAgentChats(db, agentId, { limit: 1 })[0] ?? null;
}

/** A run's messages in seq order ([] for an unknown run). */
export function getChatMessages(db: Db, runId: string): ChatMessage[] {
  return (db.prepare('SELECT * FROM chat_messages WHERE run_id = ? ORDER BY seq').all(runId) as Row[]).map(
    toMessage,
  );
}
