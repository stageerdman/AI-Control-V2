import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Runtime } from '../runtime/service.ts';
import { Id, IdParams } from './schemas.ts';

const RunBody = z.strictObject({
  agentId: Id,
  teamId: Id.optional(),
  task: z.string().trim().min(1).max(20_000),
  caps: z
    .strictObject({
      maxTurns: z.number().int().min(1).max(100).optional(),
      maxBudgetUsd: z.number().min(0.01).max(25).optional(),
    })
    .optional(),
  resumeRunId: z.uuid().optional(),
});
const RunParams = z.object({ id: Id, runId: z.uuid() });
const AskParams = z.object({ id: Id, askId: z.uuid() });
const AnswerBody = z.strictObject({ answer: z.string().trim().min(1).max(10_000) });
const AsksQuery = z.object({ status: z.enum(['open', 'answered', 'cancelled']).optional() });
const StudioAsksQuery = z.object({
  status: z.enum(['open', 'answered', 'cancelled', 'all']).default('open'),
  unseen: z.enum(['true', 'false', '1', '0']).optional(),
});
const SeenBody = z.strictObject({ projectId: Id });
const InternalParams = z.object({ runId: z.uuid() });
const InternalWait = z.object({ runId: z.uuid(), askId: z.uuid() });
const InternalAsk = z.strictObject({
  question: z.string().max(10_000),
  options: z.array(z.string().max(500)).max(20).optional(),
});

export const LONG_POLL_MS = 25_000;

const strip = <T extends { caps?: Record<string, unknown> | undefined }>(b: T) => {
  const caps = b.caps
    ? Object.fromEntries(Object.entries(b.caps).filter(([, v]) => v !== undefined))
    : undefined;
  return { ...b, ...(caps ? { caps } : {}) };
};

export const runRoutes =
  ({ runtime, longPollMs = LONG_POLL_MS }: { runtime: Runtime; longPollMs?: number }): FastifyPluginAsync =>
  async (app) => {
    app.post('/projects/:id/runs', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const body = strip(parse(RunBody, req.body));
      const { teamId, caps, resumeRunId, ...rest } = body;
      return reply.status(201).send(
        runtime.start(id, {
          ...rest,
          ...(teamId ? { teamId } : {}),
          ...(caps ? { caps } : {}),
          ...(resumeRunId ? { resumeRunId } : {}),
        }),
      );
    });
    app.get('/projects/:id/runs', async (req) => runtime.list(parse(IdParams, req.params).id));
    app.get('/projects/:id/runs/:runId', async (req) => {
      const { id, runId } = parse(RunParams, req.params);
      return runtime.get(id, runId);
    });
    app.post('/projects/:id/runs/:runId/cancel', async (req, reply) => {
      const { id, runId } = parse(RunParams, req.params);
      runtime.cancel(id, runId);
      return reply.status(202).send(runtime.get(id, runId));
    });

    app.get('/projects/:id/asks', async (req) => {
      const { status } = parse(AsksQuery, req.query);
      return runtime.asks(parse(IdParams, req.params).id, status);
    });
    app.post('/projects/:id/asks/:askId/answer', async (req) => {
      const { id, askId } = parse(AskParams, req.params);
      return runtime.answer(id, askId, parse(AnswerBody, req.body).answer);
    });

    /* the pager: open asks across every project (+ which ones you already went to see) */
    app.get('/asks', async (req) => {
      const q = parse(StudioAsksQuery, req.query);
      return runtime.studioAsks(
        q.status === 'all' ? undefined : q.status,
        q.unseen === 'true' || q.unseen === '1',
      );
    });
    app.post('/asks/seen', async (req) => runtime.markSeen(parse(SeenBody, req.body).projectId));

    /* the ask_user MCP server's side door: per-run token, unknown/ended runs look like 404 */
    const token = (h: unknown) => (typeof h === 'string' ? h : undefined);
    app.post('/internal/runs/:runId/asks', async (req, reply) => {
      const { runId } = parse(InternalParams, req.params);
      runtime.internal.authorize(runId, token(req.headers['x-run-token']));
      const { question, options } = parse(InternalAsk, req.body);
      return reply.status(201).send({ askId: runtime.internal.openAsk(runId, question, options).id });
    });
    /* file_report (reporter runs only — the runtime refuses others); the body is validated by the reports desk */
    app.post('/internal/runs/:runId/reports', async (req, reply) => {
      const { runId } = parse(InternalParams, req.params);
      runtime.internal.authorize(runId, token(req.headers['x-run-token']));
      return reply.status(201).send(runtime.internal.fileReport(runId, req.body));
    });
    /* STUDIO LIFE: the forget nudge hook (PostToolUse) asks after each tool */
    app.get('/internal/runs/:runId/nudge', async (req) => {
      const { runId } = parse(InternalParams, req.params);
      runtime.internal.authorize(runId, token(req.headers['x-run-token']));
      return { nudge: runtime.internal.nudge(runId) };
    });
    app.get('/internal/runs/:runId/asks/:askId/wait', async (req) => {
      const { runId, askId } = parse(InternalWait, req.params);
      runtime.internal.authorize(runId, token(req.headers['x-run-token']));
      const ask = await runtime.internal.waitAsk(runId, askId, longPollMs);
      return { status: ask.status, ...(ask.status === 'answered' ? { answer: ask.answer } : {}) };
    });
  };
