/* The event catalogue: everything the office (and the setup screen) can be told.
   Small on purpose — add a type when a screen needs it. Every payload is validated
   here before it reaches the log, and payloads reference ids (agents, credentials),
   never secret values. */
import { z } from 'zod';
import { AGENT_FIELDS } from './agent-changes.ts';
import { GATE_KINDS } from './collaboration.ts';
import { FEATURE_STATUSES } from './feature-stages.ts';
import { QUESTS } from './quests.ts';

const id = z.string().trim().min(1).max(80);
const text = (max = 2000) => z.string().max(max);
const count = z.number().int().min(0);
/** A workflow as screens see it on a goal (src/domain/workflows.ts `workflowTag`). */
const workflowTag = z.strictObject({
  id,
  name: text(60),
  temporary: z.boolean(),
  lead: id.optional(),
  crew: z.array(id).max(4).optional(),
});

export const EVENT_SCHEMAS = {
  /** The Project Setter's progress (B2 steps). */
  'setup.step': z.strictObject({
    step: text(40),
    status: z.enum(['running', 'done', 'kept', 'skipped']),
    detail: text(),
  }),
  'setup.failed': z.strictObject({ message: text() }),
  /** What an agent is doing right now. */
  'agent.status': z.strictObject({
    agentId: id,
    runId: id.optional(),
    status: z.enum(['idle', 'working', 'waiting', 'blocked', 'done']),
    activity: z
      .strictObject({
        kind: text(40),
        label: text(120),
        detail: text().optional(),
        target: text(300).optional(),
      })
      .optional(),
  }),
  /** An agent needs the user (a question, an approval, or access to a credential — by id). */
  'ask.opened': z.strictObject({
    askId: id,
    agentId: id,
    kind: z.enum(['question', 'approval', 'credential']),
    question: text(),
    options: z.array(text(200)).max(10).optional(),
    runId: id.optional(),
    credentialId: id.optional(),
  }),
  'ask.answered': z.strictObject({ askId: id, answer: text() }),
  /** Nobody will read the answer any more (its run ended and nothing carries it on): the question leaves. */
  'ask.withdrawn': z.strictObject({ askId: id }),
  /** The setup chat (B6): a message from the user, the orchestrator or the Agent Creator. */
  'chat.message': z.strictObject({
    /** 'agent' = anyone else in the room (a guest a call brought in), by agentId. */
    from: z.enum(['user', 'orchestrator', 'creator', 'agent']),
    agentId: id.optional(),
    /** AGENT MCP: an agent-to-agent line in the room — who it's said to. */
    to: id.optional(),
    text: text(4000),
  }),
  /** AGENT MCP: someone joined the room (the draft's setup room, or a project) — `by` brought them in. */
  'room.joined': z.strictObject({ agentId: id, by: id.optional(), why: text(300).optional() }),
  /** AGENT MCP: one agent calling another (call_agent): asking the approver → approved / declined → working → answered / failed. */
  'room.call': z.strictObject({
    callId: id,
    from: id,
    to: id,
    status: z.enum(['asking', 'approved', 'declined', 'working', 'answered', 'failed']),
    approver: id.optional(),
    note: text(300).optional(),
  }),
  /** STUDIO LIFE: an agent left a note on its desk and forgot (GET …/desk-notes/:noteId has the text). */
  'desk.note': z.strictObject({ agentId: id, noteId: id, runId: id.optional() }),
  /** STUDIO LIFE: something on an agent's to-do list was added or done (GET …/todos has the list). */
  'todo.changed': z.strictObject({ agentId: id, todoId: id, change: z.enum(['added', 'done']) }),
  /** STUDIO LIFE: an agent run used one of its studio tools (the object-use log; GET …/tool-use counts them). */
  'tool.used': z.strictObject({ agentId: id, runId: id.optional(), tool: text(80), ok: z.boolean() }),
  /** STUDIO LIFE: the user brought someone in, changed their brief / lock, or sent them home. */
  'guest.changed': z.strictObject({ agentId: id, change: z.enum(['joined', 'updated', 'left']) }),
  /** STUDIO LIFE: mail arrived in this office, or its director / the user dealt with it. */
  'mail.changed': z.strictObject({
    mailId: id,
    change: z.enum(['arrived', 'triaged', 'filed', 'reopened']),
    status: z.enum(['new', 'board', 'discussed', 'filed']),
  }),
  /** STUDIO LIFE: a team rebuild took someone off the project — `by` is the director (or the user). */
  'room.left': z.strictObject({ agentId: id, by: id.optional() }),
  /** The director (re)staffed or rebuilt the project: its teams + specialists now, who joined, left or changed seats. */
  'staff.changed': z.strictObject({
    teamIds: z.array(id).max(40),
    agentIds: z.array(id).max(40),
    added: z.array(id).max(60),
    removed: z.array(id).max(60).optional(),
    moved: z.array(id).max(60).optional(),
  }),
  /** The setup plan changed (ids only; GET /drafts/:id/chat has the whole plan). */
  'plan.changed': z.strictObject({
    summary: text(1000),
    teamIds: z.array(id).max(40),
    agentIds: z.array(id).max(40),
    newAgents: count,
    newTeams: count,
  }),
  /** A Cast agent on this project (staff or guest) was edited: which fields changed (GET /agents/:id has them). */
  'agent.changed': z.strictObject({
    agentId: id,
    fields: z.array(z.enum(AGENT_FIELDS)).min(1).max(AGENT_FIELDS.length),
  }),
  /** The Agent Creator added something to the Cast. */
  'cast.created': z.strictObject({
    kind: z.enum(['agent', 'team', 'role']),
    id,
    name: text(80),
    by: id.optional(),
  }),
  /** A health check finished (B7): the three grades + the one-line summary. */
  'health.checked': z.strictObject({
    reportId: id,
    modularity: z.enum(['A', 'B', 'C', 'D', 'F']),
    cleanliness: z.enum(['A', 'B', 'C', 'D', 'F']),
    reusability: z.enum(['A', 'B', 'C', 'D', 'F']),
    summary: text(1000),
    dirty: z.boolean().optional(),
  }),
  /** The whiteboard: a goal the orchestrator broke into checklist items (B6 dispatch). */
  'goal.changed': z.strictObject({
    goalId: id,
    status: z.enum(['running', 'done', 'failed', 'cancelled']),
    text: text(2000).optional(),
    summary: text(1000).optional(),
    quest: z.enum(QUESTS).optional(),
    /** The workflow it runs under (WORKFLOWS): absent on status-only changes. */
    workflow: workflowTag.optional(),
  }),
  'checklist.item': z.strictObject({
    itemId: id,
    text: text(300),
    done: z.boolean(),
    owner: id.optional(),
    goalId: id.optional(),
    status: z.enum(['todo', 'running', 'done', 'failed', 'cancelled']).optional(),
    runId: id.optional(),
    /** Where the item is in its flow (B8): build → review(s) → merge. */
    stage: z.enum(['build', 'review', 'merge']).optional(),
    /** Who holds it right now (the builder, or the reviewer during a review). */
    holder: id.optional(),
    /** F1c: a member's sub-task of this team item (the office shows it under the item, not on the whiteboard). */
    parentId: id.optional(),
    /** F1c: a split team item — members building, or the captain integrating. */
    teamPhase: z.enum(['members', 'integrate']).optional(),
  }),
  /** F1c: a captain split a team item into sub-tasks for members (mode team), or took it on alone (mode self). */
  'team.split': z.strictObject({
    itemId: id,
    goalId: id,
    captainId: id,
    teamId: id,
    mode: z.enum(['team', 'self']),
    summary: text(1000),
    subtasks: z.array(z.strictObject({ itemId: id, agentId: id, text: text(300) })).max(8),
    /** 0 = the first split; 1+ = a rework round the captain sent back after integrating. */
    round: count,
  }),
  /** The collaboration design (B8) changed: who the orchestrator briefs + how many review gates. GET …/collaboration has it whole. */
  'collaboration.changed': z.strictObject({
    orchestratorTalksTo: z.enum(['captains', 'everyone']),
    gates: count,
    summary: text(500),
  }),
  /** The project's stable workflows changed (WORKFLOWS): how many, by name, the first is the default. */
  'workflows.changed': z.strictObject({
    count,
    names: z.array(text(60)).max(6),
  }),
  /** A team's own workflow was saved (its name) or cleared (null) — told to every office the team is in. */
  'team.workflow.changed': z.strictObject({ teamId: id, name: text(60).nullable() }),
  /** A goal switched workflow mid-way (WORKFLOWS phase 4): its untouched tasks were re-gated. */
  'workflow.changed': workflowTag.extend({ goalId: id, regated: count }),
  /** A goal under a temporary workflow settled: the lead's command over the crew is over. */
  'workflow.ended': z.strictObject({
    goalId: id,
    lead: id,
    crew: z.array(id).max(4),
    status: z.enum(['done', 'failed', 'cancelled']),
  }),
  /** Work changes hands (the office's paper/envelope passing): builder → reviewer (review), reviewer → builder
      (rework, with the notes), or back to the builder to fix a merge conflict (merge-fix). F1c, inside a team:
      captain → member (delegate: a sub-task; rework: the captain's notes), member → captain (deliver: merged into
      the team's branch). On team handoffs itemId is the sub-task and parentId the team item. */
  handoff: z.strictObject({
    itemId: id,
    goalId: id,
    parentId: id.optional(),
    from: id,
    to: id,
    kind: z.enum(['review', 'rework', 'merge-fix', 'delegate', 'deliver']),
    gate: z.enum(GATE_KINDS).optional(),
    note: text().optional(),
  }),
  /** A reviewer approved an item at their gate. */
  'review.approved': z.strictObject({
    itemId: id,
    goalId: id,
    reviewerId: id,
    gate: z.enum(GATE_KINDS),
    notes: text().optional(),
  }),
  /** A reviewer sent an item back with notes; final = the send-back limit is reached and the item stops for the user. */
  'review.changes': z.strictObject({
    itemId: id,
    goalId: id,
    reviewerId: id,
    gate: z.enum(GATE_KINDS),
    notes: text(),
    sendBacks: count,
    final: z.boolean().optional(),
  }),
  /** An accepted item's branch was merged back into the project's main branch (git worktrees). */
  'item.merged': z.strictObject({
    itemId: id,
    goalId: id,
    branch: text(200),
    commit: text(64).optional(),
  }),
  /** The project's status moved on its own (live → needs input → idle). */
  'project.status': z.strictObject({ status: z.enum(['live', 'needs', 'idle', 'draft', 'archived']) }),
  /** Overall progress: features shipped / total, plus the current goal; target = the optional label ("v1.0"). */
  'project.progress': z.strictObject({
    pct: z.number().int().min(0).max(100),
    shipped: count,
    total: count,
    target: text(40).optional(),
    goalId: id.optional(),
    goalPct: z.number().int().min(0).max(100).optional(),
  }),
  /** The features folder (U1): a feature was added, edited, moved or (deleted: true) removed. GET /projects/:id/features has the text. */
  'feature.changed': z.strictObject({
    featureId: id,
    name: text(120),
    status: z.enum(FEATURE_STATUSES),
    order: z.number().int().min(1),
    closedAt: z.string().max(40).nullable().optional(),
    pct: z.number().int().min(0).max(100).nullable().optional(),
    owner: id.nullable().optional(),
    deleted: z.literal(true).optional(),
  }),
  /** F1c: every item of a goal that works on this feature landed — the feature moved to Shipped. */
  'feature.shipped': z.strictObject({ featureId: id, goalId: id, name: text(120) }),
  /** F1c: the project's app (its dev server / start command) started, printed its address, stopped or exited. */
  /** G1: the project's GitHub repo was published or its visibility changed. */
  'github.changed': z.strictObject({
    published: z.boolean(),
    url: text(300).nullable(),
    visibility: z.enum(['public', 'private', 'internal']).nullable(),
  }),
  /** G1: the studio pushed main after a merge (a failure is a calm note, never the item's). */
  'github.push': z.strictObject({ ok: z.boolean(), commit: text(64).optional(), note: text(300).optional() }),
  /** OFFICE: the project's picture or display name changed (views refresh their project). */
  'project.changed': z.strictObject({
    imageUrl: text(300).nullable().optional(),
    name: text(200).optional(),
  }),
  /** G1: an access granted to this project was granted / revoked / edited / deleted (ids only — never a value). */
  'access.changed': z.strictObject({
    accessId: id,
    change: z.enum(['granted', 'revoked', 'updated', 'deleted']),
  }),
  'app.status': z.strictObject({
    status: z.enum(['running', 'stopped', 'exited']),
    url: text(300).optional(),
    exitCode: z.number().int().nullable().optional(),
  }),
  /** "New chat with Pixel": the director's thread started a fresh chat (the old one is in its History). */
  'thread.reset': z.strictObject({ agentId: id }),
  /** Project conversations (U1): a message in the user's thread with an agent (the orchestrator or anyone on the project). */
  'thread.message': z.strictObject({
    agentId: id,
    messageId: id,
    from: z.enum(['user', 'agent']),
    kind: z.enum(['text', 'error']),
    text: text(20_000),
    /** When the line was said (its place in the chat) — an answered question keeps the time it was asked. */
    at: z.string().max(40).optional(),
    runId: id.optional(),
    /** The report this turn filed (the reply is one line pointing at it), or the report a follow-up is about. */
    reportId: id.optional(),
    /** A goal posted to the orchestrator (the user's goal line and the orchestrator's plan reply). */
    goalId: id.optional(),
    /** A team rebuild the director's reply carries: the confirm card, or (applied at once) its Undo. */
    rebuild: z
      .strictObject({
        planId: id,
        needsConfirm: z.boolean(),
        card: z.record(z.string(), z.unknown()),
        undoToken: id.optional(),
        summary: text(2000).optional(),
      })
      .optional(),
  }),
  /** Reports (U1): a reporter filed one — title only, never the body (GET the report for it). */
  'report.filed': z.strictObject({ reportId: id, projectId: id, authorAgentId: id, title: text(80) }),
  'report.read': z.strictObject({ reportId: id, read: z.boolean() }),
  'report.archived': z.strictObject({ reportId: id, archived: z.boolean() }),
  progress: z.strictObject({ pct: z.number().int().min(0).max(100), label: text(120).optional() }),
  tokens: z.strictObject({ agentId: id, runId: id.optional(), input: count, output: count }),
  /** A headless agent run (B5) began / ended. */
  'run.started': z.strictObject({ runId: id, agentId: id, teamId: id.optional(), task: text() }),
  'run.finished': z.strictObject({
    runId: id,
    agentId: id,
    status: z.enum(['succeeded', 'failed', 'cancelled']),
    result: text(4000).optional(),
    error: text().optional(),
    turns: count,
    input: count,
    output: count,
    costUsd: z.number().min(0).optional(),
  }),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;
export const EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as EventType[];
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>;
/** What a publisher hands in: a type and its payload. */
export type EventInput = { [T in EventType]: { type: T; payload: EventPayload<T> } }[EventType];

export const EventInputSchema = z.strictObject({
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  payload: z.unknown(),
});

/** Validate untrusted { type, payload }; throws ZodError on a bad payload. */
export function parseEventInput(raw: unknown): EventInput {
  const { type, payload } = EventInputSchema.parse(raw);
  return { type, payload: EVENT_SCHEMAS[type].parse(payload) } as EventInput;
}
