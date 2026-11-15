/* One error type for the whole server. Every failure leaves as
   { error: { code, message, details? } } with a matching HTTP status. */
import type { z } from 'zod';

export type ErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'conflict'
  | 'chat_running'
  | 'agent_busy'
  | 'invalid'
  | 'agent_error';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  /* a 409 the app tells apart: the chat is a live run, so it can't be written into yet */
  chat_running: 409,
  /* a 409 the app tells apart: the agent is in a running session, so it can't be deleted yet */
  agent_busy: 409,
  invalid: 422,
  agent_error: 502,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const notFound = (what: string, id: string) => new AppError('not_found', `${what} '${id}' not found`);
/** A rule of the studio blocks this (state-dependent): 409. */
export const conflict = (message: string, details?: unknown) => new AppError('conflict', message, details);
/** The input itself is malformed: 422. */
export const invalid = (message: string, details?: unknown) => new AppError('invalid', message, details);

/** A studio agent (orchestrator, Agent Creator) failed or broke its output contract: 502. */
export const agentError = (message: string, details?: unknown) =>
  new AppError('agent_error', message, details);

/** Validate untrusted input; throws a 422 listing each issue. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw invalid(
    'Request validation failed',
    r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}
