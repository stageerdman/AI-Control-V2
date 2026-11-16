/* Project conversations: the user's thread with the orchestrator or any agent on the project. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Threads } from '../office/threads.ts';
import { Id } from './schemas.ts';

const ThreadParams = z.object({ id: Id, agentId: Id });
const SayBody = z.strictObject({
  text: z.string().trim().min(1).max(10_000),
  /** A follow-up on this report: the turn carries its title, summary and a body excerpt. */
  reportId: Id.optional(),
});

export const threadRoutes =
  ({ threads }: { threads: Threads }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/threads/:agentId/messages', async (req) => {
      const { id, agentId } = parse(ThreadParams, req.params);
      return threads.get(id, agentId);
    });
    /* 202: the turn started; the reply arrives as a `thread.message` event (and in GET) */
    app.post('/projects/:id/threads/:agentId/messages', async (req, reply) => {
      const { id, agentId } = parse(ThreadParams, req.params);
      const { text, reportId } = parse(SayBody, req.body);
      return reply.status(202).send(threads.say(id, agentId, text, reportId ? { reportId } : {}));
    });
    /* "New chat with Pixel" (director only): 201 the chat that closed; 409 work_running / chat_empty */
    app.post('/projects/:id/threads/:agentId/new', async (req, reply) => {
      const { id, agentId } = parse(ThreadParams, req.params);
      return reply.status(201).send(threads.startNew(id, agentId));
    });
    app.get('/projects/:id/threads/:agentId/chats', async (req) => {
      const { id, agentId } = parse(ThreadParams, req.params);
      return threads.chats(id, agentId);
    });
    app.get('/projects/:id/threads/:agentId/chats/:chatId/messages', async (req) => {
      const { id, agentId, chatId } = parse(ThreadParams.extend({ chatId: Id }), req.params);
      return threads.chatMessages(id, agentId, chatId);
    });
  };
