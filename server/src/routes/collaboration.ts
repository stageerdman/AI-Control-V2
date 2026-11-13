/* The collaboration design (B8): who the orchestrator briefs and which review gates work passes through. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { CollaborationService } from '../crew/collaboration.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const DesignBody = z.strictObject({ ask: z.string().trim().min(1).max(2000).optional() });

export const collaborationRoutes =
  ({ collaboration }: { collaboration: CollaborationService }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/collaboration', async (req) => collaboration.get(parse(IdParams, req.params).id));
    /* set by hand: the whole design (422 malformed, 409 a gate names someone not on the project) */
    app.put('/projects/:id/collaboration', async (req) => {
      const { id } = parse(IdParams, req.params);
      return { collaboration: collaboration.set(id, req.body), designed: true };
    });
    /* the orchestrator (re)designs it for the people on the project now (one crew call) */
    app.post('/projects/:id/collaboration/design', async (req) => {
      const { id } = parse(IdParams, req.params);
      return collaboration.design(id, parse(DesignBody, req.body ?? {}).ask);
    });
  };
