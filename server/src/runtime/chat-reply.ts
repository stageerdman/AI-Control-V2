/* Chat reply: the user writes into a past chat and the agent answers, remembering that chat.
   One tool-less crew call (no project folder, no new run), like the recap. */
import { z } from 'zod';
import type { Crew } from '../crew/structured.ts';
import { validateWith } from '../crew/structured.ts';
import type { ChatMessage, ChatSummary } from '../db/chats.ts';
import { recapTranscript } from './recap.ts';

export const CHAT_REPLY_CONTRACT = 'agent-chat-reply';
export const MAX_REPLY_CHARS = 8000;
export type ReplyInChat = (chat: ChatSummary, messages: ChatMessage[], text: string) => Promise<string>;

const SYSTEM_PROMPT = [
  'You are an agent in AI Studio, picking one of your own earlier chats back up.',
  'The user has written a new message into that chat. Answer it in the first person, as yourself,',
  'using what happened in the chat. Be plain, warm and to the point.',
  'You have no tools here: you cannot change files or run anything now. If the user asks for new work,',
  'say what you would do and that they can start a new task for it. Never invent work that is not in the chat.',
].join('\n');

const replyTask = (chat: ChatSummary, messages: ChatMessage[], text: string) =>
  [
    'Your earlier chat:',
    `Status: ${JSON.stringify(chat.status)}`,
    recapTranscript(chat, messages),
    '',
    "The user's new message:",
    text,
    '',
    'Reply with ONLY this JSON object: {"reply": "<your answer>"}',
  ].join('\n');

const validate = validateWith(z.object({ reply: z.string().trim().min(1).max(MAX_REPLY_CHARS) }));

/** reply(chat, earlierMessages, text) through the crew: a model failure surfaces as the crew's 502 agent_error. */
export function createChatReplier(crew: Crew): ReplyInChat {
  return async (chat, messages, text) => {
    const { value } = await crew.call({
      who: 'The agent',
      contract: CHAT_REPLY_CONTRACT,
      systemPrompt: SYSTEM_PROMPT,
      task: replyTask(chat, messages, text),
      validate,
    });
    return value.reply;
  };
}
