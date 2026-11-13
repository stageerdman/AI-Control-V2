/* Fastify factory. Everything the app needs is injected, so tests can build an
   app on an in-memory db and a temp sandbox and drive it with inject(). */
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Config } from './config.ts';
import type { Db } from './db/connection.ts';
import { createStore, type Store } from './db/store.ts';
import { AppError } from './errors.ts';
import { accessRoutes } from './routes/access.ts';
import { agentRoutes } from './routes/agents.ts';
import { blueprintRoutes } from './routes/blueprint.ts';
import { credentialRoutes } from './routes/credentials.ts';
import { draftRoutes } from './routes/drafts.ts';
import { healthRoutes } from './routes/health.ts';
import { projectRoutes } from './routes/projects.ts';
import { roleRoutes } from './routes/roles.ts';
import { setterRoutes } from './routes/setter.ts';
import { teamRoutes } from './routes/teams.ts';
import { trashRoutes } from './routes/trash.ts';
import { cabinet } from './secrets/cabinet.ts';
import { projectAccess } from './secrets/projectAccess.ts';
import { fileSecretStore, type SecretStore } from './secrets/secretStore.ts';

export type AppDeps = {
  config: Config;
  db: Db;
  store?: Store;
  /** Where secret values live; defaults to the global `<controlHome>/.env`. */
  secrets?: SecretStore;
  logger?: FastifyServerOptions['logger'];
};

export function buildApp({
  config,
  db,
  store = createStore(db, { sandbox: config.sandbox }),
  secrets = fileSecretStore(join(config.controlHome, '.env')),
  logger = false,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(err.toBody());
    const status = (err as { statusCode?: number }).statusCode;
    /* Fastify's own 4xx (bad JSON, wrong content type, body too large…) */
    if (status && status >= 400 && status < 500) {
      /* never echo a body parser's message: V8's JSON errors quote the body (could be a secret) */
      const message =
        err instanceof SyntaxError || /^FST_ERR_CTP_/.test(String((err as { code?: string }).code))
          ? 'Malformed request body'
          : err instanceof Error
            ? err.message
            : 'Bad request';
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
  app.register(blueprintRoutes({ config }));
  app.register(setterRoutes({ store, config }));
  app.register(credentialRoutes({ cabinet: cabinet(store, secrets) }));
  app.register(accessRoutes({ access: projectAccess(store, secrets, config.sandbox) }));
  return app;
}
