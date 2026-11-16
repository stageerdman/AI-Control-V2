import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { AGENT_KINDS } from '../domain/cast.ts';
import { LookSchema } from '../domain/look.ts';
import { type ToolList, toolList } from '../domain/tool-list.ts';
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

export type AgentRouteDeps = {
  store: Store;
  /** The commands the studio grants agent runs (the runtime's shell). */
  shell: readonly string[];
  /** Does this agent's role file reports? (report runs get the web) */
  reporter: (agent: Agent) => boolean;
};

export const agentRoutes =
  ({ store, shell, reporter }: AgentRouteDeps): FastifyPluginAsync =>
  async (app) => {
    /* every Cast reply carries the plain tool list, so the panel never has to work it out */
    const withTools = (a: Agent): Agent & { toolList: ToolList } => ({
      ...a,
      toolList: toolList({ tools: a.tools, canMail: a.canMail, reporter: reporter(a) }, shell),
    });

    app.get('/agents', async () => store.agents.list().map(withTools));
    app.get('/agents/:id', async (req) => withTools(store.agents.require(parse(IdParams, req.params).id)));
    app.post('/agents', async (req, reply) =>
      reply.status(201).send(withTools(store.tx(() => store.agents.create(parse(AgentCreate, req.body))))),
    );
    app.patch('/agents/:id', async (req) => {
      const { id } = parse(IdParams, req.params);
      return withTools(store.tx(() => store.agents.update(id, parse(AgentPatch, req.body))));
    });
    /* lets the app block Delete before anyone clicks; the delete itself checks again */
    app.get('/agents/:id/busy', async (req) => store.trash.agentBusy(parse(IdParams, req.params).id));
    /* refused (409 agent_busy) while in a running session; else leaves its teams (captaincy passes on) and hands its projects to another orchestrator; restorable */
    app.delete('/agents/:id', async (req) => store.trash.trashAgent(parse(IdParams, req.params).id));
  };
