/* STUDIO LIFE: which office objects the AIs use — the counts, and the how-to page built on them. */
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { howToPage } from '../usage/how-to.ts';
import { toolUse } from '../usage/usage.ts';
import { IdParams } from './schemas.ts';

export const usageRoutes =
  ({ db, store }: { db: Db; store: Store }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/tool-use', async (req) => {
      const { id } = parse(IdParams, req.params);
      store.projects.require(id);
      return { uses: toolUse(db, id) };
    });
    app.get('/projects/:id/how-to', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const project = store.projects.require(id);
      const nameOf = (a: string) => store.agents.get(a)?.name ?? a;
      return reply.type('text/html; charset=utf-8').send(howToPage(project.name, toolUse(db, id), nameOf));
    });
  };
