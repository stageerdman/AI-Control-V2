import type { FastifyPluginAsync } from 'fastify';
import type { Store } from '../db/store.ts';
import { parseEventInput } from '../domain/events.ts';
import { invalid, parse } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { type OpenStreams, openStream } from '../http/sse.ts';
import { IdParams } from './schemas.ts';

export type EventRoutesDeps = {
  store: Store;
  events: EventLog;
  open: OpenStreams;
  heartbeatMs?: number;
  dev: boolean;
};

export const eventRoutes =
  ({ store, events, open, heartbeatMs, dev }: EventRoutesDeps): FastifyPluginAsync =>
  async (app) => {
    const hb = heartbeatMs === undefined ? {} : { heartbeatMs };
    /* the office's live feed: replay after Last-Event-ID / ?after=, then live */
    app.get('/projects/:id/events', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      store.projects.require(id);
      openStream(req, reply, { log: events, scope: 'project', id, open, ...hb });
    });
    /* the setup screen's feed: the Project Setter's steps while POST /drafts/:id/finish runs */
    app.get('/drafts/:id/events', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      store.drafts.require(id);
      openStream(req, reply, { log: events, scope: 'draft', id, open, ...hb });
    });

    /* DEV ONLY (not registered when NODE_ENV=production): publish by hand to watch the stream.
       Real publishers (B5's runner) call EventLog.append in-process. */
    if (dev) {
      app.post('/projects/:id/events', async (req, reply) => {
        const { id } = parse(IdParams, req.params);
        store.projects.require(id);
        let input: ReturnType<typeof parseEventInput>;
        try {
          input = parseEventInput(req.body);
        } catch (e) {
          throw invalid('Not a valid event', (e as { issues?: unknown }).issues);
        }
        return reply.status(201).send(events.append('project', id, input));
      });
    }
  };
