/* The features folder: CRUD per project. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { FEATURE_STATUSES } from '../db/features.ts';
import { parse } from '../errors.ts';
import type { Features } from '../office/features.ts';
import { Id, IdParams } from './schemas.ts';

const Block = z.string().max(20_000);
const fields = {
  name: z.string().trim().min(1).max(120),
  status: z.enum(FEATURE_STATUSES).optional(),
  order: z.number().int().min(1).max(10_000).optional(),
  pct: z.number().int().min(0).max(100).nullable().optional(),
  owner: Id.nullable().optional(),
  description: Block.optional(),
};
const FeatureCreate = z.strictObject(fields);
const FeaturePatch = z.strictObject({ ...fields, name: fields.name.optional() });
const FeatureParams = z.object({ id: Id, featureId: Id });
const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const featureRoutes =
  ({ features }: { features: Features }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/features', async (req) => features.list(parse(IdParams, req.params).id));
    app.post('/projects/:id/features', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      return reply.status(201).send(features.create(id, defined(parse(FeatureCreate, req.body))));
    });
    app.get('/projects/:id/features/:featureId', async (req) => {
      const { id, featureId } = parse(FeatureParams, req.params);
      return features.get(id, featureId);
    });
    app.patch('/projects/:id/features/:featureId', async (req) => {
      const { id, featureId } = parse(FeatureParams, req.params);
      return features.update(id, featureId, defined(parse(FeaturePatch, req.body)));
    });
    app.delete('/projects/:id/features/:featureId', async (req, reply) => {
      const { id, featureId } = parse(FeatureParams, req.params);
      features.remove(id, featureId);
      return reply.status(204).send();
    });
  };
