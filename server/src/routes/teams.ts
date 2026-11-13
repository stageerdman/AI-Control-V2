import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import { Id, IdParams, Name, Short, Text } from './schemas.ts';

const fields = {
  name: Name,
  color: Short.optional(),
  emblem: Short.optional(),
  blurb: z.string().max(500).optional(),
  instr: Text.optional(),
  code: Text.optional(),
  /** Runs for this team may file reports. */
  reporter: z.boolean().optional(),
};
const TeamCreate = z.strictObject({
  ...fields,
  members: z.array(z.strictObject({ agentId: Id, instr: Text.optional() })).optional(),
  captainId: Id.nullable().optional(),
});
const TeamPatch = z.strictObject({ ...fields, name: Name.optional(), captainId: Id.optional() });
const MemberParams = z.object({ id: Id, agentId: Id });
const MemberAdd = z.strictObject({ agentId: Id, instr: Text.optional() });
const MemberPatch = z.strictObject({ instr: Text });

export const teamRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    app.get('/teams', async () => store.teams.list());
    app.get('/teams/:id', async (req) => store.teams.require(parse(IdParams, req.params).id));
    app.post('/teams', async (req, reply) =>
      reply.status(201).send(store.tx(() => store.teams.create(parse(TeamCreate, req.body)))),
    );
    app.patch('/teams/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      return store.tx(() => store.teams.update(id, parse(TeamPatch, req.body)));
    });
    app.delete('/teams/:id', async (req) => store.trash.trashTeam(parse(IdParams, req.params).id));

    app.post('/teams/:id/members', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const { agentId, instr } = parse(MemberAdd, req.body);
      return reply.status(201).send(store.tx(() => store.teams.addMember(id, agentId, instr)));
    });
    app.patch('/teams/:id/members/:agentId', async (req) => {
      const { id, agentId } = parse(MemberParams, req.params);
      return store.teams.updateMember(id, agentId, parse(MemberPatch, req.body).instr);
    });
    /* removing the captain promotes the next member in line */
    app.delete('/teams/:id/members/:agentId', async (req) => {
      const { id, agentId } = parse(MemberParams, req.params);
      return store.tx(() => store.teams.removeMember(id, agentId));
    });
  };
