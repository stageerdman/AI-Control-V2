/* Agent performance for one office over a range of local days (performance/performance.ts). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { performanceOf } from '../performance/performance.ts';
import { RANGES } from '../performance/window.ts';
import { IdParams } from './schemas.ts';

/** `tz` is the browser's getTimezoneOffset(): minutes, UTC − local (±14 h at most). */
const Query = z.object({
  range: z.enum(RANGES).default('7d'),
  tz: z.coerce.number().int().min(-840).max(840).default(0),
});

export const performanceRoutes =
  ({ db, store }: { db: Db; store: Store }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/performance', async (req) => {
      const { id } = parse(IdParams, req.params);
      const q = parse(Query, req.query);
      store.projects.require(id); // 404 for an unknown project
      return performanceOf(db, id, q);
    });
  };
