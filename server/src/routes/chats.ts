/* Chat history: an agent's past chats (one per run) and a chat's messages. A run's history outlives
   its agent, so an agent id is known while the agent exists or has run at least once. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getChatMessages, latestAgentChat, listAgentChats } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import { runsRepo } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { notFound, parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const ChatsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.iso.datetime().optional(),
});
const RunParams = z.object({ runId: z.uuid() });

export const chatRoutes =
  ({ db, store }: { db: Db; store: Store }): FastifyPluginAsync =>
  async (app) => {
    const requireAgent = (id: string) => {
      if (!store.agents.get(id) && !latestAgentChat(db, id)) throw notFound('Agent', id);
    };
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
  };
