/* CHATS: the studio tool that lets an agent look back at its own earlier chats in this project — what it was
   asked, what it did, how each ended (finished, failed, stopped by the user) — so after a stop it can pick the
   work up again. It only ever reads its own; messages are stored with secrets already scrubbed. */

import { type ChatMessage, type ChatSummary, getChat, getChatMessages, listAgentChats } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import type { BridgeTool } from '../room/bridge.ts';

export type HistoryCaller = { projectId: string; agentId: string; runId: string };

const RECENT = 10;
/** A chat's latest messages shown (older ones are summed up in one line). */
const MESSAGES = 60;
const TEXT_MAX = 2000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const STATUS: Record<ChatSummary['status'], string> = {
  running: 'running now',
  succeeded: 'finished',
  failed: 'did not finish',
  cancelled: 'stopped by the user',
};

const summaryLine = (c: ChatSummary, current: string) =>
  JSON.stringify({
    runId: c.runId,
    started: c.startedAt,
    status: c.runId === current ? 'this chat' : STATUS[c.status],
    task: clip(c.task.trim().split('\n')[0] ?? '', 200),
    ...(c.lastText ? { lastWords: clip(c.lastText, 300) } : {}),
  });
const messageLine = (m: ChatMessage) => `[${m.role}] ${clip(m.text, TEXT_MAX)}`;

/** Your recent chats here, newest first (not the current one unless it is all there is). */
export function recentChats(db: Db, me: HistoryCaller): string {
  const mine = listAgentChats(db, me.agentId, { limit: 50 })
    .filter((c) => c.projectId === me.projectId)
    .slice(0, RECENT);
  return mine.length ? mine.map((c) => summaryLine(c, me.runId)).join('\n') : 'No earlier chats here.';
}

/** One of your chats, message by message (the latest MESSAGES). */
export function chatTranscript(db: Db, me: HistoryCaller, runId: string): string {
  const chat = getChat(db, runId);
  if (!chat || chat.agentId !== me.agentId || chat.projectId !== me.projectId)
    throw new Error(
      `No chat of yours in this project with runId ${runId} — list them with my_history first.`,
    );
  const all = getChatMessages(db, runId);
  const shown = all.slice(-MESSAGES);
  const skipped = all.length - shown.length;
  return [
    summaryLine(chat, me.runId),
    ...(skipped ? [`(${skipped} earlier messages not shown)`] : []),
    ...shown.map(messageLine),
  ].join('\n');
}

export function historyTools(db: Db, me: HistoryCaller): BridgeTool[] {
  return [
    {
      name: 'my_history',
      description:
        'Look back at your own earlier chats in this project: without runId, your recent chats (task, how each ended — finished, failed or stopped by the user — and your last words); with a runId, that chat message by message. Use it to continue work you were stopped on.',
      inputSchema: {
        type: 'object',
        properties: { runId: { type: 'string', description: 'A chat from the list, to read in full.' } },
      },
      run: async (a) => {
        const runId = typeof a.runId === 'string' ? a.runId.trim() : '';
        return runId ? chatTranscript(db, me, runId) : recentChats(db, me);
      },
    },
  ];
}
