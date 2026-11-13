/* Per-project access: which cabinet entries a project may use (none by default),
   and syncing exactly those into the project's own .env. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { ProjectAccess } from '../secrets/projectAccess.ts';
import { Id, IdParams } from './schemas.ts';

/* partial: only the toggled entries — `{ "grants": { "c-github": true } }` */
const GrantsBody = z.strictObject({ grants: z.record(Id, z.boolean()) });

export const accessRoutes =
  ({ access }: { access: ProjectAccess }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/access', async (req) => access.view(parse(IdParams, req.params).id));
    app.put('/projects/:id/access', async (req) =>
      access.setGrants(parse(IdParams, req.params).id, parse(GrantsBody, req.body).grants),
    );
    app.post('/projects/:id/access/sync', async (req) => access.sync(parse(IdParams, req.params).id));
  };
