/* Fastify factory. Everything the app needs is injected, so tests can build an
   app on an in-memory db and a temp sandbox and drive it with inject(). */
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import type { Db } from './db/connection.ts';
import { createStore, type Store } from './db/store.ts';
import { AppError } from './errors.ts';
import { agentRoutes } from './routes/agents.ts';
import { draftRoutes } from './routes/drafts.ts';
import { healthRoutes } from './routes/health.ts';
import { projectRoutes } from './routes/projects.ts';
import { roleRoutes } from './routes/roles.ts';
import { teamRoutes } from './routes/teams.ts';
import { trashRoutes } from './routes/trash.ts';

export type AppDeps = { config: Config; db: Db; store?: Store; logger?: boolean };

export function buildApp({
  config,
  db,
  store = createStore(db, { sandbox: config.sandbox }),
  logger = false,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(err.toBody());
    const status = (err as { statusCode?: number }).statusCode;
    /* Fastify's own 4xx (bad JSON, wrong content type, body too large…) */
    if (status && status >= 400 && status < 500) {
      const message = err instanceof Error ? err.message : 'Bad request';
      return reply.status(status).send({ error: { code: 'bad_request', message } });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Internal server error' } });
  });
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: `No route ${req.method} ${req.url}` } }),
  );

  app.register(healthRoutes({ config, db }));
  for (const routes of [roleRoutes, agentRoutes, teamRoutes, projectRoutes, draftRoutes, trashRoutes])
    app.register(routes(store));
  return app;
}
