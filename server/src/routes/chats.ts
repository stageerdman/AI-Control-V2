/* Chat history: an agent's past chats (one per run), a chat's messages, and writing into a finished chat.
   A run's history outlives its agent, so an agent id is known while the agent exists or has run at least once. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ChatSummary } from '../db/chats.ts';
import { appendChatMessage, getChat, getChatMessages, latestAgentChat, listAgentChats } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import { runsRepo } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { AppError, notFound, parse } from '../errors.ts';
import type { ChatWork } from '../office/chat-work.ts';
import { MAX_REPLY_CHARS, type ReplyInChat } from '../runtime/chat-reply.ts';
import { IdParams } from './schemas.ts';

const ChatsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.iso.datetime().optional(),
});
const RunParams = z.object({ runId: z.uuid() });
const SendBody = z.object({ text: z.string().trim().min(1).max(MAX_REPLY_CHARS) });

const StartBody = z.strictObject({ seq: z.number().int().min(0) });

const FOLLOW_UP = { followUp: true };

export const chatRoutes =
  ({
    db,
    store,
    replyInChat,
    chatWork,
  }: {
    db: Db;
    store: Store;
    replyInChat: ReplyInChat;
    chatWork: ChatWork;
  }): FastifyPluginAsync =>
  async (app) => {
    const requireAgent = (id: string) => {
      if (!store.agents.get(id) && !latestAgentChat(db, id)) throw notFound('Agent', id);
    };
    const requireWritableChat = (runId: string): ChatSummary => {
      const chat = getChat(db, runId);
      if (!chat) throw notFound('Chat', runId);
      if (chat.status === 'running')
        throw new AppError('chat_running', 'This chat is still running — wait for it to finish');
      return chat;
    };
    const say = (chat: ChatSummary, role: 'user' | 'assistant', text: string, meta: object = {}) =>
      appendChatMessage(db, {
        runId: chat.runId,
        projectId: chat.projectId,
        agentId: chat.agentId,
        role,
        text,
        meta: { ...FOLLOW_UP, ...meta },
      });

    app.get('/agents/:id/chats', async (req) => {
      const { id } = parse(IdParams, req.params);
      const { limit, before } = parse(ChatsQuery, req.query);
      requireAgent(id);
      return listAgentChats(db, id, { limit, ...(before ? { before } : {}) });
    });
    app.get('/agents/:id/chats/latest', async (req) => {
      const { id } = parse(IdParams, req.params);
      requireAgent(id);
      return latestAgentChat(db, id);
    });
    app.get('/chats/:runId/messages', async (req) => {
      const { runId } = parse(RunParams, req.params);
      if (!runsRepo(db).get(runId)) throw notFound('Chat', runId);
      return getChatMessages(db, runId);
    });
    /* the user's message is saved before the model is asked, so a model failure (502) never loses it */
    app.post('/chats/:runId/messages', async (req) => {
      const { runId } = parse(RunParams, req.params);
      const { text } = parse(SendBody, req.body);
      const chat = requireWritableChat(runId);
      let earlier = getChatMessages(db, runId);
      /* a retry after a failed reply: the same unanswered line is already saved — answer it, don't save it twice */
      const last = earlier.at(-1);
      const retry = last?.role === 'user' && last.meta?.followUp === true && last.text === text;
      if (retry) earlier = earlier.slice(0, -1);
      const sent = retry ? last : say(chat, 'user', text);
      const answer = await replyInChat(chat, earlier, text);
      const offer =
        answer.work && chatWork.canOffer(chat.projectId, chat.agentId) ? { work: answer.work } : null;
      const reply = say(chat, 'assistant', answer.reply, offer ? { offer } : {});
      return { sent, reply };
    });
    /* "Start it" under a reply that offered work: a whiteboard goal for this agent, and a line in the chat */
    app.post('/chats/:runId/start', async (req, reply) => {
      const { runId } = parse(RunParams, req.params);
      const { seq } = parse(StartBody, req.body);
      requireWritableChat(runId);
      return reply.status(201).send(chatWork.start(runId, seq));
    });
  };
