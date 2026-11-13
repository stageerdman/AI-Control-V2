/* The office on load: staffing (office-config shape) + each agent's latest status. */
import type { FastifyPluginAsync } from 'fastify';
import { parse } from '../errors.ts';
import type { OfficeView } from '../office/office.ts';
import { IdParams } from './schemas.ts';

export const officeRoutes =
  ({ office }: { office: OfficeView }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/office', async (req) => office.get(parse(IdParams, req.params).id));
  };
