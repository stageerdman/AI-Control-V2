/* Project health (B7): run a read-only health check, read the latest report + history + git status. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppRunner } from '../apps/app-runner.ts';
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
  ({ health, apps }: { health: Health; apps?: AppRunner }): FastifyPluginAsync =>
  async (app) => {
    /* + the app (F1c): is it running, where, and how it starts — never its log here */
    app.get('/projects/:id/health', async (req) => {
      const { id } = parse(IdParams, req.params);
      const h = await health.get(id);
      if (!apps) return h;
      const { status, url, command } = apps.view(id);
      return { ...h, app: { status, url, command } };
    });
    app.post('/projects/:id/health', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const { caps } = parse(CheckBody, req.body ?? {});
      const clean = caps && Object.fromEntries(Object.entries(caps).filter(([, v]) => v !== undefined));
      return reply.status(201).send(await health.check(id, clean ? { caps: clean } : {}));
    });
  };
