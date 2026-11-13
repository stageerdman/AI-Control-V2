/* Project conversations: the user's thread with the orchestrator or any agent on the project. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Threads } from '../office/threads.ts';
import { Id } from './schemas.ts';

const ThreadParams = z.object({ id: Id, agentId: Id });
const SayBody = z.strictObject({ text: z.string().trim().min(1).max(10_000) });

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
      return reply.status(202).send(threads.say(id, agentId, parse(SayBody, req.body).text));
    });
  };
