/* AGENT MCP: the studio MCP server's side door to a run's bridge tools (per-bridge token; unknown or
   closed bridges look like 404). A call starts a job; the server long-polls it (a fellow agent may work for minutes). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Bridges } from '../room/bridge.ts';

const BridgeParams = z.object({ id: z.uuid() });
const ToolParams = z.object({ id: z.uuid(), name: z.string().regex(/^[a-z_]{1,40}$/) });
const JobParams = z.object({ id: z.uuid(), jobId: z.uuid() });
const Args = z.record(z.string(), z.unknown());

export const bridgeRoutes =
  ({ bridges, longPollMs = 25_000 }: { bridges: Bridges; longPollMs?: number }): FastifyPluginAsync =>
  async (app) => {
    const token = (h: unknown) => (typeof h === 'string' ? h : undefined);
    app.get('/internal/bridges/:id/tools', async (req) => {
      const { id } = parse(BridgeParams, req.params);
      return { tools: bridges.internal.tools(id, token(req.headers['x-run-token'])) };
    });
    app.post('/internal/bridges/:id/tools/:name', async (req, reply) => {
      const { id, name } = parse(ToolParams, req.params);
      const args = parse(Args, req.body ?? {});
      return reply
        .status(202)
        .send({ jobId: bridges.internal.start(id, token(req.headers['x-run-token']), name, args) });
    });
    app.get('/internal/bridges/:id/jobs/:jobId/wait', async (req) => {
      const { id, jobId } = parse(JobParams, req.params);
      return bridges.internal.wait(id, token(req.headers['x-run-token']), jobId, longPollMs);
    });
  };
