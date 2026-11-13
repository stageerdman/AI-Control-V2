/* Project health (B7): run a read-only health check, read the latest report + history + git status. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Health } from '../health/health.ts';
import { IdParams } from './schemas.ts';

const CheckBody = z.strictObject({
  caps: z
    .strictObject({
      maxTurns: z.number().int().min(1).max(100).optional(),
      maxBudgetUsd: z.number().min(0.01).max(25).optional(),
    })
    .optional(),
});

export const projectHealthRoutes =
  ({ health }: { health: Health }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/health', async (req) => health.get(parse(IdParams, req.params).id));
    app.post('/projects/:id/health', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const { caps } = parse(CheckBody, req.body ?? {});
      const clean = caps && Object.fromEntries(Object.entries(caps).filter(([, v]) => v !== undefined));
      return reply.status(201).send(await health.check(id, clean ? { caps: clean } : {}));
    });
  };
