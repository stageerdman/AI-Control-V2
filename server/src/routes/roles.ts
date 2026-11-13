import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const RoleBody = z.strictObject({ name: z.string().max(200) });

export const roleRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    app.get('/roles', async () => store.roles.list());
    app.get('/roles/:id', async (req) => store.roles.require(parse(IdParams, req.params).id));
    app.post('/roles', async (req, reply) =>
      reply.status(201).send(store.roles.create(parse(RoleBody, req.body).name)),
    );
    /* rename — every agent holding the role follows (they reference it by id) */
    app.patch('/roles/:id', async (req) =>
      store.roles.rename(parse(IdParams, req.params).id, parse(RoleBody, req.body).name),
    );
    /* agents holding it become role-less; the restore token gives it (and them) back */
    app.delete('/roles/:id', async (req) => store.trash.trashRole(parse(IdParams, req.params).id));
  };
