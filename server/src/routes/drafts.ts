import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { PlanSchema } from '../domain/plan.ts';
import { parse } from '../errors.ts';
import { Id, IdParams } from './schemas.ts';

const fields = {
  step: z.number().int().min(0).max(20).optional(),
  name: z.string().trim().max(60).optional(),
  about: z.string().max(5000).optional(),
  folder: z.string().max(500).nullable().optional(),
  orchestratorId: Id.nullable().optional(),
};
const DraftCreate = z.strictObject({ mode: z.enum(['new', 'adopt']), ...fields });
const DraftPatch = z.strictObject({
  ...fields,
  plan: PlanSchema.nullable().optional(),
  chat: z
    .array(z.strictObject({ from: z.enum(['user', 'orchestrator']), text: z.string().max(10_000) }))
    .max(500)
    .optional(),
});

export const draftRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    app.get('/drafts', async () => store.drafts.list());
    app.get('/drafts/:id', async (req) => store.drafts.require(parse(IdParams, req.params).id));
    app.post('/drafts', async (req, reply) =>
      reply.status(201).send(store.drafts.create(parse(DraftCreate, req.body))),
    );
    app.patch('/drafts/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      return store.drafts.update(id, parse(DraftPatch, req.body));
    });
    app.delete('/drafts/:id', async (req) => store.trash.trashDraft(parse(IdParams, req.params).id));
  };
