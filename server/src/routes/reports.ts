/* Reports: per project (list / one / mark read / archive) and studio-wide (latest across projects). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Reports } from '../reports/reports.ts';
import { Id, IdParams } from './schemas.ts';

const ReportParams = z.object({ id: Id, rid: Id });
const ListQuery = z.object({ archived: z.enum(['1', '0', 'true', 'false']).optional() });
const StudioQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const ReportPatch = z
  .strictObject({ read: z.boolean().optional(), archived: z.boolean().optional() })
  .refine((b) => b.read !== undefined || b.archived !== undefined, 'Give read or archived');

export const reportRoutes =
  ({ reports }: { reports: Reports }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/reports', async (req) => {
      const { archived } = parse(ListQuery, req.query);
      return reports.list(parse(IdParams, req.params).id, archived === '1' || archived === 'true');
    });
    app.get('/projects/:id/reports/:rid', async (req) => {
      const { id, rid } = parse(ReportParams, req.params);
      return reports.get(id, rid);
    });
    app.patch('/projects/:id/reports/:rid', async (req) => {
      const { id, rid } = parse(ReportParams, req.params);
      const { read, archived } = parse(ReportPatch, req.body);
      return reports.patch(id, rid, {
        ...(read === undefined ? {} : { read }),
        ...(archived === undefined ? {} : { archived }),
      });
    });
    app.get('/reports', async (req) => reports.studio(parse(StudioQuery, req.query).limit));
  };
