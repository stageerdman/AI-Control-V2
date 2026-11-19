/* Time estimates for one office (performance/timesheet.ts): how long its tasks, goals and features really took,
   and a guess for new work. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { estimateFor, timesheetOf } from '../performance/timesheet.ts';
import { IdParams } from './schemas.ts';

const EstimateQuery = z.object({ agentId: z.string().min(1).max(200).optional() });

export const timesheetRoutes =
  ({ db, store }: { db: Db; store: Store }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/timesheet', async (req) => {
      const { id } = parse(IdParams, req.params);
      store.projects.require(id); // 404 for an unknown project
      return timesheetOf(db, id);
    });
    app.get('/projects/:id/estimate', async (req) => {
      const { id } = parse(IdParams, req.params);
      const { agentId } = parse(EstimateQuery, req.query);
      store.projects.require(id);
      return estimateFor(db, id, agentId);
    });
  };
