/* STUDIO LIFE: team rebuilds — plan (the confirm card), apply, undo; plus the project's lineup for Rearrange. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { OverridesSchema, projectLineup, RebuildSchema } from '../office/rebuild.ts';
import type { Rebuilds } from '../office/rebuild-service.ts';
import { Id, IdParams } from './schemas.ts';

const TokenParams = z.object({ token: Id });
const PlanParams = z.object({ planId: Id });

export const rebuildRoutes =
  ({ rebuilds, store }: { rebuilds: Rebuilds; store: Store }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/lineup', async (req) => projectLineup(store, parse(IdParams, req.params).id));
    app.post('/projects/:id/rebuild/plan', async (req) => ({
      ok: true,
      ...rebuilds.plan(parse(IdParams, req.params).id, parse(RebuildSchema, req.body ?? {})),
    }));
    app.post('/rebuild/:planId/apply', async (req) => ({
      ok: true,
      ...rebuilds.apply(parse(PlanParams, req.params).planId, parse(OverridesSchema, req.body ?? {})),
    }));
    app.post('/rebuild/undo/:token', async (req) => ({ ok: true, ...rebuilds.undo(parse(TokenParams, req.params).token) }));
  };
