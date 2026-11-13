/* Run the app (F1c): how the project starts, start/stop it, its status, address and last log lines. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppRunner } from '../apps/app-runner.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const CommandBody = z.strictObject({ command: z.string().trim().min(1).max(300) });

export const appRoutes =
  ({ apps }: { apps: AppRunner }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/app', async (req) => apps.view(parse(IdParams, req.params).id));
    app.post('/projects/:id/app/start', async (req, reply) =>
      reply.status(202).send(apps.start(parse(IdParams, req.params).id)),
    );
    app.post('/projects/:id/app/stop', async (req) => apps.stop(parse(IdParams, req.params).id));
    app.patch('/projects/:id/app', async (req) =>
      apps.setCommand(parse(IdParams, req.params).id, parse(CommandBody, req.body).command),
    );
  };
