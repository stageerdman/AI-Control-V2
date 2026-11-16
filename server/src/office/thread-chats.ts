/* The chats of a thread (design/new-chat/new-chat.md): a thread's messages never move; "New chat" closes the
   current window. A closed chat is [started_at, ended_at); the current chat is everything since the newest
   ended_at ('' = the beginning of time). */
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection.ts';
import { now, rows } from '../db/util.ts';
import { notFound } from '../errors.ts';

/** A past chat in History. */
export type ThreadChat = {
  id: string;
  /** Its first user line ('' when the user never wrote in it). */
  title: string;
  lastText: string | null;
  startedAt: string;
  endedAt: string;
  messageCount: number;
};
export type ChatWindow = { from: string; to: string | null };

const FIRST = 300;

export function threadChats(db: Db) {
  const currentStart = (projectId: string, agentId: string): string =>
    (
      db
        .prepare('SELECT MAX(ended_at) AS t FROM thread_chats WHERE project_id = ? AND agent_id = ?')
        .get(projectId, agentId) as { t: string | null }
    ).t ?? '';

  /** Close the current chat now; the next message starts the new one. */
  function close(projectId: string, agentId: string): ThreadChat {
    const id = randomUUID();
    const startedAt = currentStart(projectId, agentId);
    const endedAt = now();
    db.prepare(
      'INSERT INTO thread_chats (id, project_id, agent_id, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, projectId, agentId, startedAt, endedAt);
    return summaryOf(projectId, agentId, { id, started_at: startedAt, ended_at: endedAt });
  }

  function summaryOf(
    projectId: string,
    agentId: string,
    c: { id: string; started_at: string; ended_at: string },
  ): ThreadChat {
    const inWindow = 'project_id = ? AND agent_id = ? AND created_at >= ? AND created_at < ?';
    const args = [projectId, agentId, c.started_at, c.ended_at] as const;
    const first = db
      .prepare(
        `SELECT text FROM thread_messages WHERE ${inWindow} AND sender = 'user' ORDER BY created_at, rowid LIMIT 1`,
      )
      .get(...args) as { text: string } | undefined;
    const last = db
      .prepare(
        `SELECT text FROM thread_messages WHERE ${inWindow} ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(...args) as { text: string } | undefined;
    const n = db.prepare(`SELECT COUNT(*) AS n FROM thread_messages WHERE ${inWindow}`).get(...args) as {
      n: number;
    };
    return {
      id: c.id,
      title: (first?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, FIRST),
      lastText: last?.text ?? null,
      startedAt: c.started_at,
      endedAt: c.ended_at,
      messageCount: n.n,
    };
  }

  /** Past chats, newest first. */
  const list = (projectId: string, agentId: string): ThreadChat[] =>
    rows<{ id: string; started_at: string; ended_at: string }>(
      db
        .prepare(
          'SELECT id, started_at, ended_at FROM thread_chats WHERE project_id = ? AND agent_id = ? ORDER BY ended_at DESC',
        )
        .all(projectId, agentId),
    ).map((c) => summaryOf(projectId, agentId, c));

  /** One past chat's window (404 when it isn't this thread's). */
  function windowOf(projectId: string, agentId: string, chatId: string): ChatWindow {
    const c = db
      .prepare(
        'SELECT started_at, ended_at FROM thread_chats WHERE id = ? AND project_id = ? AND agent_id = ?',
      )
      .get(chatId, projectId, agentId) as { started_at: string; ended_at: string } | undefined;
    if (!c) throw notFound('Chat', chatId);
    return { from: c.started_at, to: c.ended_at };
  }

  return { currentStart, close, list, windowOf };
}
export type ThreadChats = ReturnType<typeof threadChats>;
