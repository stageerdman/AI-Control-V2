/* Chat history: an agent's past chats in one project (one per run), a chat's messages, and writing into a
   finished chat. Every route names the project; a chat from another project is a 404 (never read across). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ChatSummary } from '../db/chats.ts';
import { appendChatMessage, getChat, getChatMessages, latestAgentChat, listAgentChats } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { AppError, notFound, parse } from '../errors.ts';
import type { ChatWork } from '../office/chat-work.ts';
import { MAX_REPLY_CHARS, type ReplyInChat } from '../runtime/chat-reply.ts';
import { agentInProject } from './agent-in-project.ts';
import { Id } from './schemas.ts';

const ChatsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.iso.datetime().optional(),
});
const ChatParams = z.object({ id: Id, runId: z.uuid() });
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
    /** The chat the path names, in the project it names (404 otherwise). */
    const chatOf = (params: unknown): ChatSummary => {
      const { id, runId } = parse(ChatParams, params);
      const chat = getChat(db, runId, id);
      if (!chat) throw notFound('Chat', runId);
      return chat;
    };
    const writableChat = (params: unknown): ChatSummary => {
      const chat = chatOf(params);
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

    app.get('/projects/:id/agents/:agentId/chats', async (req) => {
      const who = agentInProject(db, store, req.params);
      const { limit, before } = parse(ChatsQuery, req.query);
      return listAgentChats(db, who, { limit, ...(before ? { before } : {}) });
    });
    app.get('/projects/:id/agents/:agentId/chats/latest', async (req) =>
      latestAgentChat(db, agentInProject(db, store, req.params)),
    );
    app.get('/projects/:id/chats/:runId/messages', async (req) =>
      getChatMessages(db, chatOf(req.params).runId),
    );
    /* the user's message is saved before the model is asked, so a model failure (502) never loses it */
    app.post('/projects/:id/chats/:runId/messages', async (req) => {
      const chat = writableChat(req.params);
      const { text } = parse(SendBody, req.body);
      let earlier = getChatMessages(db, chat.runId);
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
    app.post('/projects/:id/chats/:runId/start', async (req, reply) => {
      const chat = writableChat(req.params);
      const { seq } = parse(StartBody, req.body);
      return reply.status(201).send(chatWork.start(chat.projectId, chat.runId, seq));
    });
  };
