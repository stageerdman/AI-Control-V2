import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { TeamWorkflows } from '../crew/team-workflow.ts';
import type { Store } from '../db/store.ts';
import { WAY_SHAPES } from '../domain/team-way.ts';
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
  /** The default way's shape (used while the team has no own way). */
  wayShape: z.enum(WAY_SHAPES).optional(),
};
const TeamCreate = z.strictObject({
  ...fields,
  members: z.array(z.strictObject({ agentId: Id, instr: Text.optional() })).optional(),
  captainId: Id.nullable().optional(),
});
const TeamPatch = z.strictObject({ ...fields, name: Name.optional(), captainId: Id.optional() });
const MemberParams = z.object({ id: Id, agentId: Id });
/* at: put the member back at its old place (undo after a remove); default last */
const MemberAdd = z.strictObject({
  agentId: Id,
  instr: Text.optional(),
  at: z.number().int().min(0).max(6).optional(),
});
const MemberPatch = z.strictObject({ instr: Text });

/* `ways.watch`: a roster, captain or shape change that redraws a team's shown way is announced */
export const teamRoutes =
  ({ store, ways }: { store: Store; ways: TeamWorkflows }): FastifyPluginAsync =>
  async (app) => {
    const change = <T>(fn: () => T): T => ways.watch(() => store.tx(fn));
    app.get('/teams', async () => store.teams.list());
    app.get('/teams/:id', async (req) => store.teams.require(parse(IdParams, req.params).id));
    app.post('/teams', async (req, reply) =>
      reply.status(201).send(store.tx(() => store.teams.create(parse(TeamCreate, req.body)))),
    );
    app.patch('/teams/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      return change(() => store.teams.update(id, parse(TeamPatch, req.body)));
    });
    app.delete('/teams/:id', async (req) => store.trash.trashTeam(parse(IdParams, req.params).id));

    app.post('/teams/:id/members', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const { agentId, instr, at } = parse(MemberAdd, req.body);
      return reply.status(201).send(change(() => store.teams.addMember(id, agentId, instr, at)));
    });
    app.patch('/teams/:id/members/:agentId', async (req) => {
      const { id, agentId } = parse(MemberParams, req.params);
      return store.teams.updateMember(id, agentId, parse(MemberPatch, req.body).instr);
    });
    /* removing the captain promotes the next member in line */
    app.delete('/teams/:id/members/:agentId', async (req) => {
      const { id, agentId } = parse(MemberParams, req.params);
      return change(() => store.teams.removeMember(id, agentId));
    });
  };

/* the team's own workflow (Cast): read, save whole, clear with null */
/* `workflow` must be sent: a forgotten field never clears it (the service checks the workflow itself) */
const TeamWorkflowBody = z.strictObject({ workflow: z.record(z.string(), z.unknown()).nullable() });

export const teamWorkflowRoutes =
  (workflows: TeamWorkflows): FastifyPluginAsync =>
  async (app) => {
    app.get('/teams/:id/workflow', async (req) => workflows.get(parse(IdParams, req.params).id));
    app.put('/teams/:id/workflow', async (req) => {
      const { id } = parse(IdParams, req.params);
      return workflows.save(id, parse(TeamWorkflowBody, req.body).workflow);
    });
  };
