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
    status: z.enum(['idle', 'working', 'waiting', 'blocked', 'done']),
    activity: z
      .strictObject({ kind: text(40), label: text(120), detail: text().optional(), target: text(300).optional() })
      .optional(),
  }),
  /** An agent needs the user (a question, an approval, or access to a credential — by id). */
  'ask.opened': z.strictObject({
    askId: id,
    agentId: id,
    kind: z.enum(['question', 'approval', 'credential']),
    question: text(),
    credentialId: id.optional(),
  }),
  'ask.answered': z.strictObject({ askId: id, answer: text() }),
  /** The whiteboard. */
  'checklist.item': z.strictObject({ itemId: id, text: text(300), done: z.boolean(), owner: id.optional() }),
  'feature.changed': z.strictObject({
    featureId: id,
    name: text(120).optional(),
    status: z.enum(['next', 'now', 'done']).optional(),
    pct: z.number().int().min(0).max(100).optional(),
    owner: id.optional(),
    blocked: z.boolean().optional(),
  }),
  progress: z.strictObject({ pct: z.number().int().min(0).max(100), label: text(120).optional() }),
  tokens: z.strictObject({ agentId: id, input: count, output: count }),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;
export const EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as EventType[];
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>;
/** What a publisher hands in: a type and its payload. */
export type EventInput = { [T in EventType]: { type: T; payload: EventPayload<T> } }[EventType];

export const EventInputSchema = z.strictObject({ type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]), payload: z.unknown() });

/** Validate untrusted { type, payload }; throws ZodError on a bad payload. */
export function parseEventInput(raw: unknown): EventInput {
  const { type, payload } = EventInputSchema.parse(raw);
  return { type, payload: EVENT_SCHEMAS[type].parse(payload) } as EventInput;
}
