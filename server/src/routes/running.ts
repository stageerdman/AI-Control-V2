/* RUNNING: what is running in a project (sessions, apps, code runs), optionally one agent's; stop any one,
   stop one agent completely, or stop everything in the project. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import type { Running } from '../running/registry.ts';
import type { Stopper } from '../running/stop.ts';
import { Id, IdParams } from './schemas.ts';

const Query = z.object({ agentId: Id.optional() });
const ItemParams = z.object({ id: Id, itemId: z.string().trim().min(1).max(200) });
const AgentParams = z.object({ id: Id, agentId: Id });

export const runningRoutes =
  ({ running, stopper, store }: { running: Running; stopper: Stopper; store: Store }): FastifyPluginAsync =>
  async (app) => {
    const project = (params: unknown) => store.projects.require(parse(IdParams, params).id).id;

    app.get('/projects/:id/running', async (req) => {
      const projectId = project(req.params);
      const { agentId } = parse(Query, req.query);
      return running.list({ projectId, ...(agentId ? { agentId } : {}) });
    });
    app.post('/projects/:id/running/:itemId/cancel', async (req, reply) => {
      const { id, itemId } = parse(ItemParams, req.params);
      const projectId = store.projects.require(id).id;
      return reply.status(202).send(running.cancel(itemId, { projectId }));
    });
    app.post('/projects/:id/agents/:agentId/stop', async (req, reply) => {
      const { id, agentId } = parse(AgentParams, req.params);
      const projectId = store.projects.require(id).id;
      return reply.status(202).send(stopper.agent(projectId, store.agents.require(agentId).id));
    });
    app.post('/projects/:id/stop', async (req, reply) =>
      reply.status(202).send(stopper.project(project(req.params))),
    );
  };
