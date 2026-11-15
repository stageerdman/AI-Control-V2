import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { AGENT_KINDS } from '../domain/cast.ts';
import { LookSchema } from '../domain/look.ts';
import { parse } from '../errors.ts';
import { Id, IdParams, Name, Text } from './schemas.ts';

const fields = {
  name: Name,
  nick: z.string().trim().min(1).max(30).nullable().optional(),
  roleId: Id.nullable().optional(),
  look: LookSchema.optional(),
  prompt: Text.optional(),
};
/* kind is chosen once, at creation; it never changes (the cast rules depend on it) */
const AgentCreate = z.strictObject({ kind: z.enum(AGENT_KINDS).optional(), ...fields });
const AgentPatch = z.strictObject({ ...fields, name: Name.optional(), canMail: z.boolean().optional() });

export const agentRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    app.get('/agents', async () => store.agents.list());
    app.get('/agents/:id', async (req) => store.agents.require(parse(IdParams, req.params).id));
    app.post('/agents', async (req, reply) =>
      reply.status(201).send(store.tx(() => store.agents.create(parse(AgentCreate, req.body)))),
    );
    app.patch('/agents/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      return store.tx(() => store.agents.update(id, parse(AgentPatch, req.body)));
    });
    /* leaves its teams (captaincy passes on) and hands its projects to another orchestrator; restorable */
    app.delete('/agents/:id', async (req) => store.trash.trashAgent(parse(IdParams, req.params).id));
  };
