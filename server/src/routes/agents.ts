import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { AGENT_KINDS } from '../domain/cast.ts';
import { LookSchema } from '../domain/look.ts';
import { type ToolList, toolList } from '../domain/tool-list.ts';
import { parse } from '../errors.ts';
import type { AgentEdits } from '../office/agent-edits.ts';
import type { KinCopies } from '../office/kin-copies.ts';
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
/* a copy chooses only who it is; what it does (role, prompt, tools) comes from its kin */
const CopyCreate = z.strictObject({ name: Name.optional(), look: LookSchema.optional() });

export type AgentRouteDeps = {
  store: Store;
  /** Saves an edit and tells the offices showing the agent (a new look redraws live). */
  edits: AgentEdits;
  /** Invite another: copies of a Cast agent (kin). */
  copies: KinCopies;
  /** The commands the studio grants agent runs (the runtime's shell). */
  shell: readonly string[];
  /** Does this agent's role file reports? (report runs get the web) */
  reporter: (agent: Agent) => boolean;
};

export const agentRoutes =
  ({ store, edits, copies, shell, reporter }: AgentRouteDeps): FastifyPluginAsync =>
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
      return withTools(edits.update(id, parse(AgentPatch, req.body)));
    });
    /* invite another: a fresh name + family look to show on the card (each call re-rolls) */
    app.get('/agents/:id/copy-draft', async (req) => copies.draft(parse(IdParams, req.params).id));
    /* 409 for crew, 409 name_taken for a name already in the Cast; the office door then brings the copy in as a guest */
    app.post('/agents/:id/copies', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      return reply.status(201).send(withTools(copies.invite(id, parse(CopyCreate, req.body ?? {}))));
    });
    /* lets the app block Delete before anyone clicks; the delete itself checks again */
    app.get('/agents/:id/busy', async (req) => store.trash.agentBusy(parse(IdParams, req.params).id));
    /* refused (409 agent_busy) while in a running session; else leaves its teams (captaincy passes on) and hands its projects to another orchestrator; restorable */
    app.delete('/agents/:id', async (req) => store.trash.trashAgent(parse(IdParams, req.params).id));
  };
