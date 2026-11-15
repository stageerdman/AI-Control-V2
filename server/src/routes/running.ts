/* RUNNING: what is running in a project (sessions, apps, code runs), optionally one agent's; stop any one. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import type { Running } from '../running/registry.ts';
import { Id, IdParams } from './schemas.ts';

const Query = z.object({ agentId: Id.optional() });
const ItemParams = z.object({ id: Id, itemId: z.string().trim().min(1).max(200) });

export const runningRoutes =
  ({ running, store }: { running: Running; store: Store }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/running', async (req) => {
      const projectId = store.projects.require(parse(IdParams, req.params).id).id;
      const { agentId } = parse(Query, req.query);
      return running.list({ projectId, ...(agentId ? { agentId } : {}) });
    });
    app.post('/projects/:id/running/:itemId/cancel', async (req, reply) => {
      const { id, itemId } = parse(ItemParams, req.params);
      const projectId = store.projects.require(id).id;
      return reply.status(202).send(running.cancel(itemId, { projectId }));
    });
  };
