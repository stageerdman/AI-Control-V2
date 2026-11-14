/* The office's work clock: how long agents have worked on a project (office/work-time.ts). */
import type { FastifyPluginAsync } from 'fastify';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import type { WorkClock } from '../office/work-time.ts';
import { IdParams } from './schemas.ts';

export const timeRoutes =
  ({ store, clock }: { store: Store; clock: WorkClock }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/time', async (req) => {
      const { id } = parse(IdParams, req.params);
      store.projects.require(id); // 404 for an unknown project
      return clock.summary(id);
    });
  };
