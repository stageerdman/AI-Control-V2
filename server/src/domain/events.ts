/* The event catalogue: everything the office (and the setup screen) can be told.
   Small on purpose — add a type when a screen needs it. Every payload is validated
   here before it reaches the log, and payloads reference ids (agents, credentials),
   never secret values. */
import { z } from 'zod';

const id = z.string().trim().min(1).max(80);
const text = (max = 2000) => z.string().max(max);
const count = z.number().int().min(0);

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
  /** The setup chat (B6): a message from the user, the orchestrator or the Agent Creator. */
  'chat.message': z.strictObject({
    from: z.enum(['user', 'orchestrator', 'creator']),
    agentId: id.optional(),
    text: text(4000),
  }),
  /** The setup plan changed (ids only; GET /drafts/:id/chat has the whole plan). */
  'plan.changed': z.strictObject({
    summary: text(1000),
    teamIds: z.array(id).max(40),
    agentIds: z.array(id).max(40),
    newAgents: count,
    newTeams: count,
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
  }),
  'checklist.item': z.strictObject({
    itemId: id,
    text: text(300),
    done: z.boolean(),
    owner: id.optional(),
    goalId: id.optional(),
    status: z.enum(['todo', 'running', 'done', 'failed', 'cancelled']).optional(),
    runId: id.optional(),
  }),
  /** The features folder (U1): a feature was added, edited, moved or (deleted: true) removed. GET /projects/:id/features has the text. */
  'feature.changed': z.strictObject({
    featureId: id,
    name: text(120),
    status: z.enum(['now', 'planned', 'shipped']),
    order: z.number().int().min(1),
    pct: z.number().int().min(0).max(100).nullable().optional(),
    owner: id.nullable().optional(),
    deleted: z.literal(true).optional(),
  }),
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
