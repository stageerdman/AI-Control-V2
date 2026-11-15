/* STUDIO LIFE: guests the user brings into a project (brief + may the director use them). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Guests } from '../office/guests.ts';
import { Id, IdParams } from './schemas.ts';

const Brief = z.string().trim().min(1).max(4000);
const AddBody = z.strictObject({
  agentId: Id,
  brief: Brief,
  orchestratorMay: z.boolean().optional(),
  start: z.boolean().optional(),
});
const PatchBody = z.strictObject({ brief: Brief.optional(), orchestratorMay: z.boolean().optional() });
const GuestParams = z.object({ id: Id, agentId: Id });

export const guestRoutes =
  ({ guests }: { guests: Guests }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/guests', async (req) => ({ guests: guests.list(parse(IdParams, req.params).id) }));
    app.post('/projects/:id/guests', async (req, reply) =>
      reply.status(201).send(guests.add(parse(IdParams, req.params).id, parse(AddBody, req.body))),
    );
    app.patch('/projects/:id/guests/:agentId', async (req) => {
      const { id, agentId } = parse(GuestParams, req.params);
      return guests.update(id, agentId, parse(PatchBody, req.body));
    });
    app.delete('/projects/:id/guests/:agentId', async (req, reply) => {
      const { id, agentId } = parse(GuestParams, req.params);
      guests.remove(id, agentId);
      return reply.status(204).send();
    });
  };
