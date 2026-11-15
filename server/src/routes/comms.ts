/* STUDIO LIFE: the comms log — for people and for another AI to analyse. `?format=jsonl` = one JSON object per line. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Comm, Comms } from '../comms/comms.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const Query = z.object({
  since: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(10_000).optional(),
  format: z.enum(['json', 'jsonl']).optional(),
});

export const commsRoutes =
  ({ comms }: { comms: Comms }): FastifyPluginAsync =>
  async (app) => {
    const send = (reply: { type: (t: string) => unknown }, list: Comm[], format?: string) => {
      if (format !== 'jsonl') return { comms: list };
      reply.type('application/x-ndjson');
      return list.map((c) => JSON.stringify(c)).join('\n') + (list.length ? '\n' : '');
    };
    app.get('/comms', async (req, reply) => {
      const q = parse(Query, req.query);
      return send(reply, comms.all(q.since, q.limit), q.format);
    });
    app.get('/projects/:id/comms', async (req, reply) => {
      const q = parse(Query, req.query);
      return send(reply, comms.list('project', parse(IdParams, req.params).id, q.since, q.limit), q.format);
    });
  };
