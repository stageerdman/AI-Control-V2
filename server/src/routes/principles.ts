/* STUDIO LIFE: the teams' principles on a project (read-only; captains write them in the repo). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Principles } from '../office/principles.ts';
import { Id, IdParams } from './schemas.ts';

const FileParams = z.object({ id: Id, teamId: Id, file: z.string().min(1).max(100) });

export const principlesRoutes =
  ({ principles }: { principles: Principles }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/principles', async (req) => principles.list(parse(IdParams, req.params).id));
    app.get('/projects/:id/principles/:teamId/:file', async (req) => {
      const { id, teamId, file } = parse(FileParams, req.params);
      return principles.read(id, teamId, file);
    });
  };
