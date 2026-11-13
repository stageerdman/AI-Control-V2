/* Fastify factory. Everything the app needs is injected, so tests can build an
   app on an in-memory db and a temp sandbox and drive it with inject(). */
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Config } from './config.ts';
import { createCreator } from './crew/creator.ts';
import { createDispatch } from './crew/dispatch.ts';
import { fakeBrain } from './crew/fake-brain.ts';
import { createSetupChat } from './crew/setup-chat.ts';
import { createCrew } from './crew/structured.ts';
import type { Db } from './db/connection.ts';
import { createStore, type Store } from './db/store.ts';
import { AppError } from './errors.ts';
import { createBus } from './events/bus.ts';
import { type EventLog, eventLog } from './events/log.ts';
import type { GhProbe } from './health/git-status.ts';
import { createHealth } from './health/health.ts';
import { registerCors } from './http/cors.ts';
import type { OpenStreams } from './http/sse.ts';
import { accessRoutes } from './routes/access.ts';
import { agentRoutes } from './routes/agents.ts';
import { blueprintRoutes } from './routes/blueprint.ts';
import { credentialRoutes } from './routes/credentials.ts';
import { crewRoutes } from './routes/crew.ts';
import { draftRoutes } from './routes/drafts.ts';
import { eventRoutes } from './routes/events.ts';
import { healthRoutes } from './routes/health.ts';
import { projectHealthRoutes } from './routes/project-health.ts';
import { projectRoutes } from './routes/projects.ts';
import { roleRoutes } from './routes/roles.ts';
import { runRoutes } from './routes/runs.ts';
import { setterRoutes } from './routes/setter.ts';
import { teamRoutes } from './routes/teams.ts';
import { trashRoutes } from './routes/trash.ts';
import { fakeRunner } from './runtime/fake.ts';
import type { Runner } from './runtime/runner.ts';
import { createRuntime, type Runtime } from './runtime/service.ts';
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
  /** The live event log (+ its bus). B5's runner publishes through the same instance. */
  events?: EventLog;
  /** Dev-only routes (manual event publish). Default: on unless NODE_ENV=production. */
  dev?: boolean;
  /** SSE heartbeat interval (tests shorten it). */
  heartbeatMs?: number;
  /** How agents run. Default: the FakeRunner with the fake crew brain (main.ts passes the Claude Code CLI). */
  runner?: Runner;
  model?: string;
  /** Exposed so tests and main can reach the runtime; built from the deps when omitted. */
  onRuntime?: (rt: Runtime) => void;
  longPollMs?: number;
  /** Concurrent dispatched runs per project (default 2). */
  maxConcurrent?: number;
  /** GitHub visibility probe for health checks (network). Default null = never called (main passes gh if installed). */
  gh?: GhProbe | null;
};

/** Every value in the secret store, for the event log's redaction net. */
export const secretValuesOf = (secrets: SecretStore) => () =>
  secrets
    .keys()
    .map((k) => secrets.get(k) ?? '')
    .filter(Boolean);

export function buildApp({
  config,
  db,
  store = createStore(db, { sandbox: config.sandbox }),
  secrets = fileSecretStore(join(config.controlHome, '.env')),
  logger = false,
  events = eventLog(db, createBus(), secretValuesOf(secrets)),
  dev = process.env.NODE_ENV !== 'production',
  heartbeatMs,
  runner = fakeRunner(fakeBrain),
  model = 'claude-opus-5-5',
  onRuntime,
  longPollMs,
  maxConcurrent,
  gh = null,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger });
  registerCors(app);
  /* SSE responses are hijacked: end them on shutdown so close() never hangs */
  const open: OpenStreams = new Set();
  const access = projectAccess(store, secrets, config.sandbox);
  const runtime = createRuntime({
    db,
    store,
    events,
    runner,
    model,
    sandbox: config.sandbox,
    envFor: access.envFor,
  });
  runtime.recover();
  onRuntime?.(runtime);
  /* the studio crew (orchestrator, Agent Creator): tool-less runs in a scratch dir, never a project folder */
  const crew = createCrew({ runner, model, scratchDir: join(config.home, 'scratch') });
  const chat = createSetupChat({ store, events, crew });
  const creator = createCreator({ store, events, crew });
  const dispatch = createDispatch({
    db,
    store,
    events,
    crew,
    runtime,
    ...(maxConcurrent === undefined ? {} : { maxConcurrent }),
  });
  dispatch.recover();
  const health = createHealth({ db, store, events, crew, sandbox: config.sandbox, gh });
  /* the ask_user MCP server calls back here; learn our own address once listening */
  app.addHook('onListen', async () => {
    const a = app.server.address();
    if (a && typeof a === 'object')
      runtime.setBaseUrl(`http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}`);
  });
  app.addHook('preClose', async () => {
    for (const res of open) res.end();
    await runtime.shutdown();
  });

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
  app.register(blueprintRoutes({ config }));
  app.register(setterRoutes({ store, config, events }));
  app.register(
    eventRoutes({ store, events, open, dev, ...(heartbeatMs === undefined ? {} : { heartbeatMs }) }),
  );
  app.register(credentialRoutes({ cabinet: cabinet(store, secrets) }));
  app.register(accessRoutes({ access }));
  app.register(runRoutes({ runtime, ...(longPollMs === undefined ? {} : { longPollMs }) }));
  app.register(crewRoutes({ chat, creator, dispatch }));
  app.register(projectHealthRoutes({ health }));
  return app;
}
