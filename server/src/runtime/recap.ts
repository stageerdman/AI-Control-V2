/* Recap: an agent reads its last chat back and says, in its own words, what it did.
   One tool-less crew call (no project folder, no full run); finished chats are remembered
   by runId + messageCount, so asking again is instant and free. A running chat is never kept. */
import { z } from 'zod';
import type { Crew } from '../crew/structured.ts';
import { validateWith } from '../crew/structured.ts';
import type { ChatMessage, ChatSummary } from '../db/chats.ts';

export const RECAP_CONTRACT = 'agent-recap';
export type RecapChat = (chat: ChatSummary, messages: ChatMessage[]) => Promise<string>;

/** The transcript budget: the task, then the latest messages that fit (the outcome is the last one). */
const BUDGET_CHARS = 8000;
const TASK_CHARS = 2000;
const MESSAGE_CHARS = 600;
const TOOL_CHARS = 120;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const line = (m: ChatMessage) =>
  `[${m.role}] ${clip(m.text.replace(/\s+/g, ' ').trim(), m.role === 'tool' ? TOOL_CHARS : MESSAGE_CHARS)}`;

/** The chat as plain lines, newest kept first when it is long; the opening task (seq 0) is shown once. */
export function recapTranscript(chat: ChatSummary, messages: ChatMessage[]): string {
  const rest = messages.filter((m) => !(m.seq === 0 && m.role === 'user'));
  const kept: string[] = [];
  let used = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const l = line(rest[i] as ChatMessage);
    if (used + l.length > BUDGET_CHARS) break;
    kept.unshift(l);
    used += l.length + 1;
  }
  const dropped = rest.length - kept.length;
  return [
    `Task: ${clip(chat.task, TASK_CHARS)}`,
    ...(dropped ? [`(${dropped} earlier messages left out)`] : []),
    ...kept,
    ...(rest.length === 0 && chat.lastText ? [`[assistant] ${clip(chat.lastText, MESSAGE_CHARS)}`] : []),
  ].join('\n');
}

const SYSTEM_PROMPT = [
  'You are an agent in AI Studio, looking back at one of your own past chats.',
  'Answer the user in the first person, plain and warm: 2 to 4 short sentences.',
  'Say what the task was, what you did, how it ended, and anything left open.',
  'No lists, no headings, no code, no file dumps. Never invent work that is not in the chat.',
].join('\n');

const recapTask = (chat: ChatSummary, messages: ChatMessage[]) =>
  [
    'Tell the user what you did in this chat.',
    `Status: ${JSON.stringify(chat.status)}`,
    `Task line: ${JSON.stringify(clip(chat.task, 200))}`,
    '',
    'The chat:',
    recapTranscript(chat, messages),
    '',
    'Reply with ONLY this JSON object: {"recap": "<your 2 to 4 sentences>"}',
  ].join('\n');

const validate = validateWith(z.object({ recap: z.string().trim().min(1).max(1200) }));

/** recapChat(chat, messages) through the crew: a model failure surfaces as the crew's 502 agent_error. */
export function createRecapper(crew: Crew): RecapChat {
  return async (chat, messages) => {
    const { value } = await crew.call({
      who: 'The agent',
      contract: RECAP_CONTRACT,
      systemPrompt: SYSTEM_PROMPT,
      task: recapTask(chat, messages),
      validate,
    });
    return value.recap;
  };
}

/** Remembers each finished chat's recap (one per run, replaced when the chat grows); running chats pass through. */
export function cachedRecaps(recap: RecapChat) {
  const byRun = new Map<string, { messageCount: number; recap: string }>();
  return async (chat: ChatSummary, messages: ChatMessage[]): Promise<{ recap: string; cached: boolean }> => {
    const hit = byRun.get(chat.runId);
    if (hit && hit.messageCount === chat.messageCount) return { recap: hit.recap, cached: true };
    const text = await recap(chat, messages);
    if (chat.status !== 'running') byRun.set(chat.runId, { messageCount: chat.messageCount, recap: text });
    return { recap: text, cached: false };
  };
}
