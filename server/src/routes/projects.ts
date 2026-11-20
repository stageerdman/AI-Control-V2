import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PROJECT_STATUSES } from '../db/projects.ts';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { Id, IdParams, Name, Short } from './schemas.ts';

const fields = {
  name: Name,
  note: z.string().max(500).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  folder: z.string().max(500).nullable().optional(),
  orchestratorId: Id.optional(),
  tile: z.strictObject({ g1: Short, g2: Short, glyph: Short }).optional(),
  teamIds: z.array(Id).optional(),
  agentIds: z.array(Id).optional(),
  /** What the overall progress counts towards ("v1.0"); null clears it. */
  target: z.string().trim().max(40).nullable().optional(),
};
const ProjectCreate = z.strictObject(fields);
const ProjectPatch = z.strictObject({ ...fields, name: Name.optional() });

/** `icons`: re-copies icons linked to a file that changed, so a read carries the fresh imageUrl. */
type Icons = { refresh(id: string): void; refreshAll(): void };

export const projectRoutes =
  (store: Store, icons?: Icons): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects', async () => {
      icons?.refreshAll();
      return store.projects.list();
    });
    app.get('/projects/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      icons?.refresh(id);
      return store.projects.require(id);
    });
    app.post('/projects', async (req, reply) =>
      reply.status(201).send(store.tx(() => store.projects.create(parse(ProjectCreate, req.body)))),
    );
    app.patch('/projects/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      return store.tx(() => store.projects.update(id, parse(ProjectPatch, req.body)));
    });
    /* forgets the record only — the folder on disk is never touched */
    app.delete('/projects/:id', async (req, reply) => {
      store.tx(() => store.projects.remove(parse(IdParams, req.params).id));
      return reply.status(204).send();
    });
  };
