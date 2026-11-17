/* The room (AGENT MCP): who is present where work happens — a draft's setup room (its orchestrator +
   whoever joined) or a project (its orchestrator, teams and specialists + whoever joined) — and agents
   calling each other into it with `call_agent`.

   A call: refusals first (self, a cycle, too deep) → if the caller isn't the orchestrator and the callee
   isn't here, the approver (captain, else orchestrator) decides in one crew call (`allow-call`) → the
   callee joins (`room.joined`) → one help call of the callee (`help`, its own brain; in a project with
   read-only tools in the folder) → its answer goes back to the caller. Every step is a `room.call` event;
   in a draft the spoken lines also land in the setup chat. Joins are events, so the room survives reloads. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Comms } from '../comms/comms.ts';
import { json } from '../crew/prompts.ts';
import { type Crew, validateWith } from '../crew/structured.ts';
import type { Agent } from '../db/agents.ts';
import type { Db } from '../db/connection.ts';
import type { ChatMessage } from '../db/drafts.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';
import type { EventInput } from '../domain/events.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import type { Caps } from '../runtime/runner.ts';
import type { BridgeTool } from './bridge.ts';
import { CALLS_ARE_FOR_QUESTIONS, WORKING_WITH_OTHERS } from './context.ts';
import { approverFor, callRefusal, contactOf } from './rule.ts';

export const ALLOW_CALL = 'allow-call';
export const HELP = 'help';
export const AllowSchema = z.strictObject({ allow: z.boolean(), reply: z.string().trim().min(1).max(300) });
export const HelpSchema = z.strictObject({
  answer: z.string().trim().min(1).max(8000),
  say: z.string().trim().min(1).max(200),
});
const READ_ONLY = ['Read', 'Glob', 'Grep'];

export type RoomScope = 'draft' | 'project';
/** Who is acting, where, and through whom they were reached (cycle + depth guard). `goalId`: the goal the
    acting run works on (a checklist item's run; calls inherit it) — a temporary lead there leads them. */
export type RoomCtx = {
  scope: RoomScope;
  ownerId: string;
  agentId: string;
  chain: readonly string[];
  goalId?: string;
};
export type CallArgs = { agent: string; request: string; why?: string; work?: boolean };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const nick = (a: Pick<Agent, 'name' | 'nick'>) => a.nick || a.name;
const CALLABLE = new Set(['agent', 'creator']);

export function createRoom(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  crew: Crew;
  sandbox: string;
  /** Caps for a helper's run (a project helper reads files; a setup helper only thinks). */
  helpCaps?: Caps;
  /** STUDIO LIFE: every call, verdict and answer is kept whole here. */
  comms?: Comms;
  /** What the callee left on this project: latest delivery and desk note, in a few lines (or null). */
  memoryOf?: (projectId: string, agentId: string) => string | null;
  /** `work: true`: put the request on the whiteboard as the callee's task → the goal's line for them. */
  addWork?: (projectId: string, byId: string, calleeId: string, request: string, goalId?: string) => string;
  /** WORKFLOWS: who leads this agent on this goal right now (a running goal's temporary lead), or null. */
  leadOf?: (goalId: string, agentId: string) => string | null;
}) {
  const { db, store, events, crew } = deps;
  /** One call at a time per callee: the next caller waits its turn (calleeId → the call in progress). */
  const talking = new Map<string, Promise<unknown>>();
  async function inTurn<T>(calleeId: string, fn: () => Promise<T>): Promise<T> {
    const before = talking.get(calleeId) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(fn);
    const tail = mine.catch(() => undefined);
    talking.set(calleeId, tail);
    try {
      return await mine;
    } finally {
      if (talking.get(calleeId) === tail) talking.delete(calleeId);
    }
  }

  const emit = (ctx: Pick<RoomCtx, 'scope' | 'ownerId'>, e: EventInput) => {
    try {
      events.append(ctx.scope, ctx.ownerId, e);
    } catch {
      /* a progress line never breaks a call */
    }
  };

  const orchestratorOf = (scope: RoomScope, ownerId: string): string | null =>
    scope === 'draft'
      ? (store.drafts.require(ownerId).orchestratorId ?? null)
      : store.projects.require(ownerId).orchestratorId;

  /** The project's teams (only projects have teams — a draft's plan is a proposal, not the room). */
  const teamsOf = (scope: RoomScope, ownerId: string) =>
    scope === 'project'
      ? store.projects
          .require(ownerId)
          .teamIds.map((id) => store.teams.get(id))
          .filter((t) => !!t)
      : [];

  /** Who joined and hasn't left since (a team rebuild's `room.left` takes them out again). */
  const joined = (scope: RoomScope, ownerId: string): string[] => {
    const here = new Set<string>();
    const evs = rows<{ type: string; payload: string }>(
      db
        .prepare(
          "SELECT type, payload FROM events WHERE scope = ? AND scope_id = ? AND type IN ('room.joined', 'room.left') ORDER BY id",
        )
        .all(scope, ownerId),
    );
    for (const e of evs) {
      const { agentId } = JSON.parse(e.payload) as { agentId: string };
      if (e.type === 'room.joined') here.add(agentId);
      else here.delete(agentId);
    }
    return [...here];
  };

  /** Everyone present, in order: the orchestrator, the project's staff, then whoever joined. */
  function present(scope: RoomScope, ownerId: string): string[] {
    const ids: string[] = [];
    const add = (id: string | null | undefined) => {
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(orchestratorOf(scope, ownerId));
    for (const t of teamsOf(scope, ownerId)) for (const m of t.members) add(m.agentId);
    if (scope === 'project') {
      for (const id of store.projects.require(ownerId).agentIds) add(id);
      for (const id of store.guests.ids(ownerId)) add(id); // brought in by the user
    }
    for (const id of joined(scope, ownerId)) add(id);
    return ids.filter((id) => store.agents.get(id));
  }

  /** Bring someone in (once). */
  function join(ctx: Pick<RoomCtx, 'scope' | 'ownerId'>, agentId: string, by?: string, why?: string) {
    if (present(ctx.scope, ctx.ownerId).includes(agentId)) return false;
    emit(ctx, {
      type: 'room.joined',
      payload: { agentId, ...(by ? { by } : {}), ...(why ? { why: clip(why, 300) } : {}) },
    });
    return true;
  }

  /** A spoken line in the setup chat (drafts only — projects show calls in the office's events). */
  function say(ctx: Pick<RoomCtx, 'scope' | 'ownerId'>, agentId: string, text: string, to?: string) {
    if (ctx.scope !== 'draft') return;
    const a = store.agents.get(agentId);
    const d = store.drafts.record(ctx.ownerId) ? store.drafts.require(ctx.ownerId) : null;
    if (!a || !d) return;
    const from: ChatMessage['from'] =
      agentId === d.orchestratorId ? 'orchestrator' : a.kind === 'creator' ? 'creator' : 'agent';
    const line: ChatMessage = {
      from,
      ...(from === 'agent' ? { agentId } : {}),
      ...(to ? { to } : {}),
      text: clip(text, 2000),
    };
    store.tx(() =>
      store.drafts.update(ctx.ownerId, { chat: [...store.drafts.require(ctx.ownerId).chat, line] }),
    );
    emit(ctx, { type: 'chat.message', payload: { from, agentId, ...(to ? { to } : {}), text: line.text } });
  }

  const status = (ctx: RoomCtx | Pick<RoomCtx, 'scope' | 'ownerId'>, agentId: string, label?: string) =>
    emit(ctx, {
      type: 'agent.status',
      payload: label
        ? { agentId, status: 'working', activity: { kind: 'helping', label: clip(label, 120) } }
        : { agentId, status: 'idle' },
    });

  /** Find a callable agent by id, name or nick (case-insensitive): Cast agents, the creator, and this room's orchestrator. */
  function resolve(who: string, orchestratorId: string | null): Agent | null {
    const k = who.trim().toLowerCase();
    const hit = store.agents
      .list()
      .find(
        (a) =>
          (CALLABLE.has(a.kind) || a.id === orchestratorId) &&
          (a.id === who.trim() || a.name.toLowerCase() === k || a.nick?.toLowerCase() === k),
      );
    return hit ?? null;
  }

  /** The one who leads `id` here: the acting agent's temporary lead on their goal first, else their team's captain. */
  function leaderOf(ctx: RoomCtx, teams: ReturnType<typeof teamsOf>) {
    return (id: string): string | null =>
      (id === ctx.agentId && ctx.goalId ? deps.leadOf?.(ctx.goalId, id) : null) ??
      teams.find((t) => t.members.some((m) => m.agentId === id))?.captainId ??
      null;
  }

  function roomView(ctx: RoomCtx) {
    const here = present(ctx.scope, ctx.ownerId);
    const orch = orchestratorOf(ctx.scope, ctx.ownerId);
    const teams = teamsOf(ctx.scope, ctx.ownerId);
    const person = (id: string) => {
      const a = store.agents.require(id);
      const team = teams.find((t) => t.members.some((m) => m.agentId === id));
      return {
        name: a.name,
        role: id === orch ? 'Orchestrator' : a.role,
        ...(team ? { team: team.name, ...(team.captainId === id ? { captain: true } : {}) } : {}),
        ...(id === ctx.agentId ? { you: true } : {}),
      };
    };
    const others = store.agents
      .list()
      .filter((a) => CALLABLE.has(a.kind) && !here.includes(a.id))
      .slice(0, 40)
      .map((a) => ({ name: a.name, role: a.role }));
    const contact = contactOf(ctx.agentId, orch, leaderOf(ctx, teams));
    return {
      ...(contact ? { yourContact: store.agents.get(contact)?.name ?? contact } : {}),
      inTheRoom: here.map(person),
      elsewhereInTheStudio: others,
    };
  }

  async function call(ctx: RoomCtx, args: CallArgs): Promise<string> {
    const request = args.request?.trim() ?? '';
    if (!request) throw new Error('Say what you need in `request`.');
    const orch = orchestratorOf(ctx.scope, ctx.ownerId);
    const callee = resolve(args.agent ?? '', orch);
    if (!callee)
      throw new Error(
        `Nobody called '${args.agent}' can be called. Use \`room\` to see who is here and in the studio.`,
      );
    const refusal = callRefusal({ callerId: ctx.agentId, calleeId: callee.id, chain: ctx.chain });
    if (refusal) throw new Error(refusal);
    const caller = store.agents.require(ctx.agentId);
    const here = present(ctx.scope, ctx.ownerId);
    const teams = teamsOf(ctx.scope, ctx.ownerId);
    const approverId = approverFor({
      callerId: caller.id,
      calleeId: callee.id,
      orchestratorId: orch,
      inRoom: (id) => here.includes(id),
      captainOf: leaderOf(ctx, teams),
    });
    const leads = !!approverId && !!ctx.goalId && deps.leadOf?.(ctx.goalId, caller.id) === approverId;
    const why = clip((args.why?.trim() || request).replace(/[.?!\s]+$/, ''), 80);
    const callId = randomUUID();
    const log = (kind: 'call' | 'answer' | 'allow', from: string, to: string, text: string) =>
      deps.comms?.record({ scope: ctx.scope, scopeId: ctx.ownerId, kind, from, to, text, refs: { callId } });
    const step = (s: 'asking' | 'approved' | 'declined' | 'working' | 'answered' | 'failed', note?: string) =>
      emit(ctx, {
        type: 'room.call',
        payload: {
          callId,
          from: caller.id,
          to: callee.id,
          status: s,
          ...(approverId ? { approver: approverId } : {}),
          ...(note ? { note: clip(note, 300) } : {}),
        },
      });

    if (approverId) {
      const approver = store.agents.require(approverId);
      step('asking');
      say(ctx, caller.id, `${nick(approver)}, may I bring in ${nick(callee)} to ${why}?`, approver.id);
      log('allow', caller.id, approver.id, `May I bring in ${callee.name} to ${why}? Request: ${request}`);
      status(ctx, approver.id, `Deciding on ${nick(callee)}`);
      let verdict: z.output<typeof AllowSchema>;
      try {
        verdict = (
          await crew.call({
            who: approver.name,
            contract: ALLOW_CALL,
            track: {
              scope: ctx.scope,
              ownerId: ctx.ownerId,
              agentId: approver.id,
              kind: 'thinking',
              asked: 'call',
            },
            systemPrompt: helperPrompt(
              approver,
              approverId === orch ? 'Orchestrator' : leads ? 'Lead' : 'Captain',
              false,
            ),
            task: [
              `${caller.name} (${caller.role}) wants to bring ${callee.name} (${callee.role}) into the room.`,
              `Why: ${json(why)}`,
              `Their request: ${json(clip(request, 2000))}`,
              `In the room now: ${json(here.map((id) => store.agents.get(id)?.name ?? id))}`,
              approverId === orch
                ? 'You keep the big picture: allow it if it clearly helps the work, refuse if it is off-scope or wasteful.'
                : leads
                  ? `You lead ${caller.name} on this goal: allow it if it clearly helps the goal, refuse if it is off-scope or wasteful.`
                  : `You captain ${caller.name}'s team: allow it if it clearly helps your team's work, refuse if it is off-scope or wasteful.`,
              'Answer with one JSON object: {"allow": true or false, "reply": "one short line to them — if no, why, in one sentence"}',
            ].join('\n\n'),
            validate: validateWith(AllowSchema),
          })
        ).value;
      } catch (e) {
        status(ctx, approver.id);
        step('declined', (e as Error).message);
        throw new Error(`${approver.name} couldn’t decide (${(e as Error).message}). Do it yourself.`);
      }
      status(ctx, approver.id);
      log('allow', approver.id, caller.id, `${verdict.allow ? 'Yes' : 'No'}: ${verdict.reply}`);
      if (!verdict.allow) {
        step('declined', verdict.reply);
        say(
          ctx,
          approver.id,
          `Not this time — ${verdict.reply.replace(/^(no[,.!—–-]*\s*)/i, '')}`,
          caller.id,
        );
        say(ctx, caller.id, 'Okay — I’ll do it myself.', approver.id);
        return `${approver.name} said no: ${verdict.reply} Do it yourself.`;
      }
      step('approved', verdict.reply);
      say(
        ctx,
        approver.id,
        /^yes\b/i.test(verdict.reply) ? verdict.reply : `Yes — ${verdict.reply}`,
        caller.id,
      );
    } else say(ctx, caller.id, `${nick(callee)}, could you ${why}?`, callee.id);

    join(ctx, callee.id, caller.id, why);
    log('call', caller.id, callee.id, request);
    const project = ctx.scope === 'project' ? store.projects.require(ctx.ownerId) : null;
    /* the work goes on the board at once, so it is never lost in the call */
    const onBoard =
      args.work && project && deps.addWork
        ? deps.addWork(project.id, caller.id, callee.id, request, ctx.goalId)
        : null;
    return inTurn(callee.id, () => help(ctx, { caller, callee, request, project, onBoard, step, log }));
  }

  /** The callee answers one call (its turn; others wait). */
  async function help(
    ctx: RoomCtx,
    c: {
      caller: Agent;
      callee: Agent;
      request: string;
      project: ReturnType<Store['projects']['require']> | null;
      onBoard: string | null;
      step: (s: 'working' | 'answered' | 'failed', note?: string) => void;
      log: (kind: 'answer', from: string, to: string, text: string) => void;
    },
  ): Promise<string> {
    const { caller, callee, request, project, onBoard, step, log } = c;
    step('working');
    status(ctx, callee.id, `For ${nick(caller)}`);
    const draft = ctx.scope === 'draft' ? store.drafts.require(ctx.ownerId) : null;
    const folder = project?.folder ? resolveInSandbox(deps.sandbox, project.folder) : null;
    const notes = project ? deps.memoryOf?.(project.id, callee.id) : null;
    const inner: RoomCtx = { ...ctx, agentId: callee.id, chain: [...ctx.chain, caller.id] };
    try {
      const { value } = await crew.call({
        who: callee.name,
        contract: HELP,
        track: {
          scope: ctx.scope,
          ownerId: ctx.ownerId,
          agentId: callee.id,
          kind: 'thinking',
          asked: 'call',
        },
        systemPrompt: helperPrompt(callee, callee.role, !!folder),
        task: [
          `${caller.name} (${caller.role}) asks you for a hand.`,
          `Their request: ${json(clip(request, 4000))}`,
          `Where: ${json(project ? { project: project.name } : { projectBeingSetUp: draft?.name, about: draft?.about })}`,
          ...(onBoard
            ? [`On the whiteboard now as your task: ${json(onBoard)} — you will do it there.`]
            : []),
          ...(project
            ? [`Your notes on this project: ${notes ? json(notes) : 'none yet.'}`, CALLS_ARE_FOR_QUESTIONS]
            : []),
          'Answer with one JSON object: {"answer": "everything they need, self-contained (they only get this)", "say": "one short line for the room on what you made, e.g. a teal visor and a tool belt"}',
        ].join('\n\n'),
        validate: validateWith(HelpSchema),
        tools: tools(inner, { catalog: true }),
        ...(folder ? { workspace: { cwd: folder, tools: READ_ONLY, allowedTools: READ_ONLY } } : {}),
        ...(deps.helpCaps ? { caps: deps.helpCaps } : {}),
      });
      log('answer', callee.id, caller.id, value.answer);
      step('answered', value.say);
      say(ctx, callee.id, `Done — ${value.say}`, caller.id);
      return onBoard
        ? `${value.answer}\n\n(On the whiteboard as ${callee.name}’s task: ${onBoard})`
        : value.answer;
    } catch (e) {
      step('failed', (e as Error).message);
      say(ctx, caller.id, `${nick(callee)} couldn’t finish — I’ll carry on.`);
      throw new Error(`${callee.name} couldn’t help: ${(e as Error).message}`);
    } finally {
      status(ctx, callee.id);
    }
  }

  /** The studio tools every agent gets in a room (+ the look catalogue for designers/helpers). */
  function tools(ctx: RoomCtx, opts: { catalog?: boolean } = {}): BridgeTool[] {
    const list: BridgeTool[] = [
      {
        name: 'room',
        description:
          'Who is in the room with you (roles, teams, captains, the orchestrator) and who else is in the studio.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(roomView(ctx)),
      },
      {
        name: 'call_agent',
        description:
          'Ask a fellow agent (or the orchestrator) a question and wait for their answer; they answer from their notes. To hand them work, set `work: true`: it goes on the whiteboard as their task. Someone already in the room: right away. Someone new: your captain (or the orchestrator) must OK it first — the studio asks for you; accept a no. If they are on another call, yours waits its turn. Make `request` self-contained: they only see what you write.',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Their name (see `room`).' },
            request: { type: 'string', description: 'What you need, with all the context they need.' },
            why: {
              type: 'string',
              description: 'A few words for the room, starting with a verb: "design the costume".',
            },
            work: {
              type: 'boolean',
              description:
                'true = this is work for them: put it on the whiteboard as their task (projects only).',
            },
          },
          required: ['agent', 'request', 'why'],
        },
        run: (a) =>
          call(ctx, {
            agent: String(a.agent ?? ''),
            request: String(a.request ?? ''),
            why: String(a.why ?? ''),
            work: a.work === true,
          }),
      },
    ];
    if (opts.catalog && catalogTool) list.push(catalogTool);
    if (ctx.scope === 'project' && deps.comms) list.push(commsTool(ctx));
    return list;
  }

  /** comms_log: the record of what agents said to each other — this project, or the whole studio. */
  function commsTool(ctx: RoomCtx): BridgeTool {
    const name = (id: string | null) => (id ? (store.agents.get(id)?.name ?? id) : null);
    return {
      name: 'comms_log',
      description:
        'Read the record of what agents said to each other (calls, answers, approvals, handoffs, reviews, splits, mail, desk notes), oldest first. For analysing how the team works together.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many of the latest entries (1–500, default 100).' },
          everywhere: {
            type: 'boolean',
            description: 'true = every project in the studio, not just this one.',
          },
        },
      },
      run: async (a) => {
        const n = Math.max(1, Math.min(500, Number(a.limit) || 100));
        const list =
          a.everywhere === true
            ? deps.comms?.latest(null, null, n)
            : deps.comms?.latest('project', ctx.ownerId, n);
        return (list ?? [])
          .map((c) =>
            JSON.stringify({
              at: c.at,
              where: c.scope === 'project' ? (store.projects.get(c.scopeId)?.name ?? c.scopeId) : c.scope,
              kind: c.kind,
              from: name(c.from),
              to: name(c.to),
              text: c.text,
            }),
          )
          .join('\n');
      },
    };
  }

  /** A crew system prompt for a helper or an approver: own brain + the room rules (+ its tools). */
  function helperPrompt(a: Agent, role: string, reads: boolean) {
    return [
      `# ${a.name}`,
      `You are ${a.name} (${role}) in AI Studio.\n\n${a.prompt.trim()}`,
      `## Working with others\n\n${WORKING_WITH_OTHERS}`,
      [
        '## How you answer',
        '',
        `The studio calls you on behalf of a fellow agent, not a person at a terminal.${reads ? ' You may read the project folder (Read, Glob, Grep); you change nothing.' : ''}`,
        'Answer with exactly ONE JSON object that follows the contract in the message — no prose around it, no code fences.',
        'Write in plain, friendly words.',
      ].join('\n'),
    ].join('\n\n');
  }

  let catalogTool: BridgeTool | null = null;
  return {
    present,
    join,
    say,
    call,
    tools,
    /** The Agent Creator's catalogue tool (set by the creator, which owns the look options). */
    setCatalog: (t: BridgeTool) => {
      catalogTool = t;
    },
  };
}
export type Room = ReturnType<typeof createRoom>;
