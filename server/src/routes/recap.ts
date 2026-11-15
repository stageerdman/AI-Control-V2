/* Recap: tap an agent, it says what it did in its latest chat ({ recap, chat, cached }). */
import type { FastifyPluginAsync } from 'fastify';
import { getChatMessages, latestAgentChat } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { notFound, parse } from '../errors.ts';
import { cachedRecaps, type RecapChat } from '../runtime/recap.ts';
import { IdParams } from './schemas.ts';

export const recapRoutes =
  ({ db, store, recapChat }: { db: Db; store: Store; recapChat: RecapChat }): FastifyPluginAsync =>
  async (app) => {
    const recap = cachedRecaps(recapChat);
    app.get('/agents/:id/recap', async (req) => {
      const { id } = parse(IdParams, req.params);
      const chat = latestAgentChat(db, id);
      /* same rule as chat history: known while the agent exists or has run at least once */
      if (!chat && !store.agents.get(id)) throw notFound('Agent', id);
      if (!chat) return { recap: null, chat: null, cached: false };
      return { ...(await recap(chat, getChatMessages(db, chat.runId))), chat };
    });
  };
