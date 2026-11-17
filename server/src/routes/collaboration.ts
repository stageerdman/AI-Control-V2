/* How the project's people work together: its workflows (WORKFLOWS), and B8's collaboration design — the
   first workflow — for the screens that still read one design. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { CollaborationService } from '../crew/collaboration.ts';
import { officeScoped, type WorkflowsService } from '../crew/workflows.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const DesignBody = z.strictObject({ ask: z.string().trim().min(1).max(2000).optional() });
/* the list itself is checked by the service (shape 422, people on the project 409) */
const WorkflowsBody = z.strictObject({ workflows: z.unknown() });

export const collaborationRoutes =
  ({
    collaboration,
    workflows,
  }: {
    collaboration: CollaborationService;
    workflows: WorkflowsService;
  }): FastifyPluginAsync =>
  async (app) => {
    /* each workflow carries `scope: 'office'` (read only: a PUT ignores it) */
    app.get('/projects/:id/workflows', async (req) => workflows.view(parse(IdParams, req.params).id));
    /* set by hand: the whole list, the first is the default */
    app.put('/projects/:id/workflows', async (req) => {
      const { id } = parse(IdParams, req.params);
      const saved = workflows.replace(id, parse(WorkflowsBody, req.body).workflows);
      return { workflows: officeScoped(saved), designed: true };
    });
    app.get('/projects/:id/collaboration', async (req) => collaboration.get(parse(IdParams, req.params).id));
    /* set by hand: the first workflow's design (422 malformed, 409 a gate names someone not on the project) */
    app.put('/projects/:id/collaboration', async (req) => {
      const { id } = parse(IdParams, req.params);
      return { collaboration: collaboration.set(id, req.body), designed: true };
    });
    /* the orchestrator (re)designs the workflows for the people on the project now (one crew call) */
    app.post('/projects/:id/collaboration/design', async (req) => {
      const { id } = parse(IdParams, req.params);
      return collaboration.design(id, parse(DesignBody, req.body ?? {}).ask);
    });
  };
