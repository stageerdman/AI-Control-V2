/* One-Step Team Building: the project's approved team requests (the user's yes, what was built) and undo. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { TeamBuild } from '../office/team-build.ts';
import { Id, IdParams } from './schemas.ts';

const RequestParams = z.object({ id: Id, requestId: Id });

export const teamRequestRoutes =
  ({ builds }: { builds: TeamBuild }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/team-requests', async (req) => ({
      requests: builds.list(parse(IdParams, req.params).id),
    }));
    app.post('/projects/:id/team-requests/:requestId/undo', async (req) => {
      const p = parse(RequestParams, req.params);
      return builds.undo(p.id, p.requestId);
    });
    /* Undo of the undo: everything it took back returns from the trash */
    app.post('/projects/:id/team-requests/:requestId/restore', async (req) => {
      const p = parse(RequestParams, req.params);
      return builds.restore(p.id, p.requestId);
    });
  };
