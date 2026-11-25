/* Recap: tap an agent in a project's office, it says what it did in its latest chat there ({ recap, chat, cached }).
   Never a chat from another project. */
import type { FastifyPluginAsync } from 'fastify';
import { getChatMessages, latestAgentChat } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { cachedRecaps, type RecapChat } from '../runtime/recap.ts';
import { agentInProject } from './agent-in-project.ts';

export const recapRoutes =
  ({ db, store, recapChat }: { db: Db; store: Store; recapChat: RecapChat }): FastifyPluginAsync =>
  async (app) => {
    const recap = cachedRecaps(recapChat);
    app.get('/projects/:id/agents/:agentId/recap', async (req) => {
      const chat = latestAgentChat(db, agentInProject(db, store, req.params));
      if (!chat) return { recap: null, chat: null, cached: false };
      return { ...(await recap(chat, getChatMessages(db, chat.runId))), chat };
    });
  };
