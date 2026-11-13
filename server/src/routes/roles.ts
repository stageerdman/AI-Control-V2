import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const RoleBody = z.strictObject({ name: z.string().max(200) });
const RolePatch = z
  .strictObject({ name: z.string().max(200).optional(), reporter: z.boolean().optional() })
  .refine((b) => b.name !== undefined || b.reporter !== undefined, 'Give a name or reporter');

export const roleRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    app.get('/roles', async () => store.roles.list());
    app.get('/roles/:id', async (req) => store.roles.require(parse(IdParams, req.params).id));
    app.post('/roles', async (req, reply) =>
      reply.status(201).send(store.roles.create(parse(RoleBody, req.body).name)),
    );
    /* rename — every agent holding the role follows (they reference it by id) */
    app.patch('/roles/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      const { name, reporter } = parse(RolePatch, req.body);
      return store.tx(() => {
        if (name !== undefined) store.roles.rename(id, name);
        /* reporter: agents holding the role may file reports */
        return reporter === undefined ? store.roles.require(id) : store.roles.setReporter(id, reporter);
      });
    });
    /* agents holding it become role-less; the restore token gives it (and them) back */
    app.delete('/roles/:id', async (req) => store.trash.trashRole(parse(IdParams, req.params).id));
  };
