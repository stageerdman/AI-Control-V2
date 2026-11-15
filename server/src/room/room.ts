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
import { WORKING_WITH_OTHERS } from './context.ts';
import { approverFor, callRefusal } from './rule.ts';

export const ALLOW_CALL = 'allow-call';
export const HELP = 'help';
export const AllowSchema = z.strictObject({ allow: z.boolean(), reply: z.string().trim().min(1).max(300) });
export const HelpSchema = z.strictObject({
  answer: z.string().trim().min(1).max(8000),
  say: z.string().trim().min(1).max(200),
});
const READ_ONLY = ['Read', 'Glob', 'Grep'];

export type RoomScope = 'draft' | 'project';
/** Who is acting, where, and through whom they were reached (cycle + depth guard). */
export type RoomCtx = { scope: RoomScope; ownerId: string; agentId: string; chain: readonly string[] };
export type CallArgs = { agent: string; request: string; why?: string };

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
}) {
  const { db, store, events, crew } = deps;

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

  const joined = (scope: RoomScope, ownerId: string) =>
    rows<{ payload: string }>(
      db
        .prepare(
          "SELECT payload FROM events WHERE scope = ? AND scope_id = ? AND type = 'room.joined' ORDER BY id",
        )
        .all(scope, ownerId),
    ).map((r) => JSON.parse(r.payload) as { agentId: string; by?: string; why?: string });

  /** Everyone present, in order: the orchestrator, the project's staff, then whoever joined. */
  function present(scope: RoomScope, ownerId: string): string[] {
    const ids: string[] = [];
    const add = (id: string | null | undefined) => {
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(orchestratorOf(scope, ownerId));
    for (const t of teamsOf(scope, ownerId)) for (const m of t.members) add(m.agentId);
    if (scope === 'project') for (const id of store.projects.require(ownerId).agentIds) add(id);
    for (const j of joined(scope, ownerId)) add(j.agentId);
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
  function say(ctx: Pick<RoomCtx, 'scope' | 'ownerId'>, agentId: string, text: string) {
    if (ctx.scope !== 'draft') return;
    const a = store.agents.get(agentId);
    const d = store.drafts.record(ctx.ownerId) ? store.drafts.require(ctx.ownerId) : null;
    if (!a || !d) return;
    const from: ChatMessage['from'] =
      agentId === d.orchestratorId ? 'orchestrator' : a.kind === 'creator' ? 'creator' : 'agent';
    const line: ChatMessage = { from, ...(from === 'agent' ? { agentId } : {}), text: clip(text, 2000) };
    store.tx(() =>
      store.drafts.update(ctx.ownerId, { chat: [...store.drafts.require(ctx.ownerId).chat, line] }),
    );
    emit(ctx, { type: 'chat.message', payload: { from, agentId, text: line.text } });
  }

  const status = (ctx: RoomCtx | Pick<RoomCtx, 'scope' | 'ownerId'>, agentId: string, label?: string) =>
    emit(ctx, {
      type: 'agent.status',
      payload: label
        ? { agentId, status: 'working', activity: { kind: 'helping', label: clip(label, 120) } }
        : { agentId, status: 'idle' },
    });

  /** Find a callable agent by id, name or nick (case-insensitive). */
  function resolve(who: string): Agent | null {
    const k = who.trim().toLowerCase();
    const hit = store.agents
      .list()
      .find(
        (a) =>
          CALLABLE.has(a.kind) &&
          (a.id === who.trim() || a.name.toLowerCase() === k || a.nick?.toLowerCase() === k),
      );
    return hit ?? null;
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
    return { inTheRoom: here.map(person), elsewhereInTheStudio: others };
  }

  async function call(ctx: RoomCtx, args: CallArgs): Promise<string> {
    const request = args.request?.trim() ?? '';
    if (!request) throw new Error('Say what you need in `request`.');
    const callee = resolve(args.agent ?? '');
    if (!callee)
      throw new Error(
        `Nobody called '${args.agent}' can be called. Use \`room\` to see who is here and in the studio.`,
      );
    const refusal = callRefusal({ callerId: ctx.agentId, calleeId: callee.id, chain: ctx.chain });
    if (refusal) throw new Error(refusal);
    const caller = store.agents.require(ctx.agentId);
    const here = present(ctx.scope, ctx.ownerId);
    const orch = orchestratorOf(ctx.scope, ctx.ownerId);
    const teams = teamsOf(ctx.scope, ctx.ownerId);
    const approverId = approverFor({
      callerId: caller.id,
      calleeId: callee.id,
      orchestratorId: orch,
      inRoom: (id) => here.includes(id),
      captainOf: (id) => teams.find((t) => t.members.some((m) => m.agentId === id))?.captainId ?? null,
    });
    const why = clip((args.why?.trim() || request).replace(/[.?!\s]+$/, ''), 80);
    const callId = randomUUID();
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
      say(ctx, caller.id, `${nick(approver)}, may I bring in ${nick(callee)} to ${why}?`);
      status(ctx, approver.id, `Deciding on ${nick(callee)}`);
      let verdict: z.output<typeof AllowSchema>;
      try {
        verdict = (
          await crew.call({
            who: approver.name,
            contract: ALLOW_CALL,
            track: { scope: ctx.scope, ownerId: ctx.ownerId, agentId: approver.id, kind: 'thinking' },
            systemPrompt: helperPrompt(approver, approverId === orch ? 'Orchestrator' : 'Captain', false),
            task: [
              `${caller.name} (${caller.role}) wants to bring ${callee.name} (${callee.role}) into the room.`,
              `Why: ${json(why)}`,
              `Their request: ${json(clip(request, 2000))}`,
              `In the room now: ${json(here.map((id) => store.agents.get(id)?.name ?? id))}`,
              approverId === orch
                ? 'You keep the big picture: allow it if it clearly helps the work, refuse if it is off-scope or wasteful.'
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
      if (!verdict.allow) {
        step('declined', verdict.reply);
        say(ctx, approver.id, `Not this time — ${verdict.reply.replace(/^(no[,.!—–-]*\s*)/i, '')}`);
        say(ctx, caller.id, 'Okay — I’ll do it myself.');
        return `${approver.name} said no: ${verdict.reply} Do it yourself.`;
      }
      step('approved', verdict.reply);
      say(ctx, approver.id, /^yes\b/i.test(verdict.reply) ? verdict.reply : `Yes — ${verdict.reply}`);
    } else say(ctx, caller.id, `${nick(callee)}, could you ${why}?`);

    join(ctx, callee.id, caller.id, why);
    step('working');
    status(ctx, callee.id, `For ${nick(caller)}`);
    const project = ctx.scope === 'project' ? store.projects.require(ctx.ownerId) : null;
    const draft = ctx.scope === 'draft' ? store.drafts.require(ctx.ownerId) : null;
    const folder = project?.folder ? resolveInSandbox(deps.sandbox, project.folder) : null;
    const inner: RoomCtx = { ...ctx, agentId: callee.id, chain: [...ctx.chain, caller.id] };
    try {
      const { value } = await crew.call({
        who: callee.name,
        contract: HELP,
        track: { scope: ctx.scope, ownerId: ctx.ownerId, agentId: callee.id, kind: 'thinking' },
        systemPrompt: helperPrompt(callee, callee.role, !!folder),
        task: [
          `${caller.name} (${caller.role}) asks you for a hand.`,
          `Their request: ${json(clip(request, 4000))}`,
          `Where: ${json(project ? { project: project.name } : { projectBeingSetUp: draft?.name, about: draft?.about })}`,
          'Answer with one JSON object: {"answer": "everything they need, self-contained (they only get this)", "say": "one short line for the room on what you made, e.g. a teal visor and a tool belt"}',
        ].join('\n\n'),
        validate: validateWith(HelpSchema),
        tools: tools(inner, { catalog: true }),
        ...(folder ? { workspace: { cwd: folder, tools: READ_ONLY, allowedTools: READ_ONLY } } : {}),
        ...(deps.helpCaps ? { caps: deps.helpCaps } : {}),
      });
      step('answered', value.say);
      say(ctx, callee.id, `Done — ${value.say}`);
      return value.answer;
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
          'Ask a fellow agent for a hand and wait for their answer. Someone already in the room: right away. Someone new: your captain (or the orchestrator) must OK it first — the studio asks for you; accept a no. Make `request` self-contained: they only see what you write.',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Their name (see `room`).' },
            request: { type: 'string', description: 'What you need, with all the context they need.' },
            why: {
              type: 'string',
              description: 'A few words for the room, starting with a verb: "design the costume".',
            },
          },
          required: ['agent', 'request', 'why'],
        },
        run: (a) =>
          call(ctx, {
            agent: String(a.agent ?? ''),
            request: String(a.request ?? ''),
            why: String(a.why ?? ''),
          }),
      },
    ];
    if (opts.catalog && catalogTool) list.push(catalogTool);
    return list;
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
