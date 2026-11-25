/* Context Window Management: where an office's context goes, and every session of one run (src/context/). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sessionsRepo } from '../context/sessions.ts';
import { summarize } from '../context/summary.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { notFound, parse } from '../errors.ts';
import { RANGES, windowOf } from '../performance/window.ts';
import { IdParams } from './schemas.ts';

const Query = z.object({
  range: z.enum(RANGES).default('7d'),
  tz: z.coerce.number().int().min(-840).max(840).default(0),
});
const RunParams = z.object({ id: z.string().min(1), runId: z.string().min(1) });

export const contextRoutes =
  ({ db, store }: { db: Db; store: Store }): FastifyPluginAsync =>
  async (app) => {
    const sessions = sessionsRepo(db);
    app.get('/projects/:id/context', async (req) => {
      const { id } = parse(IdParams, req.params);
      const q = parse(Query, req.query);
      store.projects.require(id);
      const w = windowOf(q.range, q.tz, Date.now(), null);
      const since = q.range === 'all' ? '' : new Date(w.from).toISOString();
      return { range: q.range, ...summarize(sessions.ofProject(id, since)) };
    });
    app.get('/projects/:id/runs/:runId/sessions', async (req) => {
      const { id, runId } = parse(RunParams, req.params);
      store.projects.require(id);
      const own = sessions.ofRun(runId);
      if (own.some((s) => s.projectId !== id)) throw notFound('Run', runId);
      return { sessions: own };
    });
  };
