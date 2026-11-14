/* Fastify factory. Everything the app needs is injected, so tests can build an
   app on an in-memory db and a temp sandbox and drive it with inject(). */
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createAppRunner } from './apps/app-runner.ts';
import { createPorts } from './apps/ports.ts';
import type { Config } from './config.ts';
import { createCollaboration } from './crew/collaboration.ts';
import { createCreator } from './crew/creator.ts';
import { createDispatch, planReply } from './crew/dispatch.ts';
import { fakeBrain } from './crew/fake-brain.ts';
import { createSetupChat } from './crew/setup-chat.ts';
import { createCrew } from './crew/structured.ts';
import type { Db } from './db/connection.ts';
import { createStore, type Store } from './db/store.ts';
import { AppError, parse } from './errors.ts';
import { createBus } from './events/bus.ts';
import { type EventLog, eventLog } from './events/log.ts';
import { worktrees } from './git/worktrees.ts';
import { createGithub, type GhRun } from './github/github.ts';
import type { GhProbe } from './health/git-status.ts';
import { createHealth } from './health/health.ts';
import { registerCors } from './http/cors.ts';
import type { OpenStreams } from './http/sse.ts';
import { createFeatures } from './office/features.ts';
import { createLifecycle } from './office/lifecycle.ts';
import { createOffice } from './office/office.ts';
import { createThreads } from './office/threads.ts';
import { createReports, ReportInputSchema } from './reports/reports.ts';
import { accessesRoutes } from './routes/accesses.ts';
import { agentRoutes } from './routes/agents.ts';
import { appRoutes } from './routes/app.ts';
import { blueprintRoutes } from './routes/blueprint.ts';
import { collaborationRoutes } from './routes/collaboration.ts';
import { credentialRoutes } from './routes/credentials.ts';
import { crewRoutes } from './routes/crew.ts';
import { draftRoutes } from './routes/drafts.ts';
import { eventRoutes } from './routes/events.ts';
import { featureRoutes } from './routes/features.ts';
import { githubRoutes } from './routes/github.ts';
import { healthRoutes } from './routes/health.ts';
import { officeRoutes } from './routes/office.ts';
import { portRoutes } from './routes/ports.ts';
import { projectHealthRoutes } from './routes/project-health.ts';
import { projectRoutes } from './routes/projects.ts';
import { reportRoutes } from './routes/reports.ts';
import { roleRoutes } from './routes/roles.ts';
import { runRoutes } from './routes/runs.ts';
import { setterRoutes } from './routes/setter.ts';
import { teamRoutes } from './routes/teams.ts';
import { threadRoutes } from './routes/threads.ts';
import { trashRoutes } from './routes/trash.ts';
import { AGENT_SHELL, loadCaps, type StudioCaps } from './runtime/config.ts';
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
  /** Shell commands agent runs may use (named in their prompt). Default: the dev shell. */
  shell?: readonly string[];
  /** gh for publishing (G1; AI_STUDIO_GH_BIN, tests pass a stub). Default null = not installed. */
  ghRun?: GhRun | null;
  /** Extra env for the studio's own git pushes (tests point github.com at a local bare repo). */
  gitEnv?: Record<string, string>;
  /** The real gh binary (credential helper for the studio's pushes). */
  ghBin?: string | null;
  /** Turn/budget caps per kind of run (default: loadCaps() — env overridable). */
  caps?: StudioCaps;
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
  ghRun = null,
  gitEnv,
  ghBin = null,
  caps = loadCaps(),
  shell = AGENT_SHELL.dev,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger });
  registerCors(app);
  /* SSE responses are hijacked: end them on shutdown so close() never hangs */
  const open: OpenStreams = new Set();
  /* access changes reach the projects they're granted to as `access.changed` (ids only) */
  const accessNote = (
    projectId: string,
    accessId: string,
    change: 'granted' | 'revoked' | 'updated' | 'deleted',
  ) => {
    try {
      events.append('project', projectId, { type: 'access.changed', payload: { accessId, change } });
    } catch {
      /* a progress line never fails the change */
    }
  };
  const theCabinet = cabinet(store, secrets, {
    notify: (n) => {
      for (const p of n.projectIds) accessNote(p, n.accessId, n.change);
    },
  });
  const access = projectAccess(store, secrets, config.sandbox, {
    cabinet: theCabinet,
    notify: (p, a, granted) => accessNote(p, a, granted ? 'granted' : 'revoked'),
  });
  const reports = createReports({ db, store, events, secretValues: secretValuesOf(secrets) });
  /* every project owns a stable port block: its app's port + spares for agents' own servers */
  const ports = createPorts(db);
  const runtime = createRuntime({
    db,
    store,
    events,
    runner,
    model,
    sandbox: config.sandbox,
    envFor: access.envFor,
    accessFor: access.agentAccess,
    ports,
    toolkitsRoot: join(config.home, 'toolkits'),
    worktreesRoot: join(config.home, 'worktrees'),
    defaultCaps: caps.agent,
    shell,
    /* reporter runs get file_report; its input is checked here (422 lists what's wrong) */
    reports: {
      canFile: reports.canFile,
      file: (run, input, extra) => reports.file(run, parse(ReportInputSchema, input), extra),
    },
  });
  runtime.recover();
  onRuntime?.(runtime);
  /* the studio crew (orchestrator, Agent Creator): tool-less runs in a scratch dir, never a project folder */
  const crew = createCrew({
    runner,
    model,
    scratchDir: join(config.home, 'scratch'),
    caps: caps.orchestrator,
  });
  const chat = createSetupChat({ store, events, crew });
  const creator = createCreator({ store, events, crew });
  /* the orchestrator's thread records goals and designs (threads are built below) */
  let threadsRef: ReturnType<typeof createThreads> | null = null;
  const agentName = (id: string) => store.agents.get(id)?.name ?? id;
  const collaboration = createCollaboration({
    store,
    events,
    crew,
    onDesigned: ({ projectId, orchestratorId, reply, ask }) => {
      if (ask) threadsRef?.record(projectId, orchestratorId, { sender: 'user', text: ask });
      threadsRef?.record(projectId, orchestratorId, { sender: 'agent', text: reply });
    },
  });
  const features = createFeatures({ db, store, events });
  const dispatch = createDispatch({
    features,
    db,
    store,
    events,
    crew,
    runtime,
    ...(maxConcurrent === undefined ? {} : { maxConcurrent }),
    canFile: reports.canFile,
    filedBy: (runId) => reports.byRun(runId).length > 0,
    reportFor: (projectId, reportId) => {
      try {
        return reports.get(projectId, reportId);
      } catch {
        return null;
      }
    },
    worktrees: worktrees(join(config.home, 'worktrees')),
    sandbox: config.sandbox,
    reviewCaps: caps.review,
    onPlanned: ({ projectId, goalText, goal, error }) => {
      const orch = store.projects.get(projectId)?.orchestratorId;
      if (!orch || !threadsRef) return;
      threadsRef.record(projectId, orch, { sender: 'user', text: goalText, goalId: goal?.id ?? null });
      threadsRef.record(
        projectId,
        orch,
        goal
          ? { sender: 'agent', text: planReply(goal, agentName), goalId: goal.id }
          : { sender: 'agent', kind: 'error', text: `I couldn’t plan that: ${error ?? 'no plan'}` },
      );
    },
  });
  dispatch.recover();
  /* status (live → needs → idle) and overall progress follow the event log on their own */
  const lifecycle = createLifecycle({ db, store, events });
  lifecycle.recover();
  /* GitHub: setup creates the repo by default, the user publishes / flips visibility, merges push (never agents) */
  const github = createGithub({
    db,
    store,
    events,
    sandbox: config.sandbox,
    gh: ghRun,
    ghBin,
    ...(gitEnv ? { gitEnv } : {}),
  });
  const health = createHealth({ db, store, events, crew, sandbox: config.sandbox, gh });
  const threads = createThreads({
    db,
    store,
    events,
    runtime,
    features,
    health,
    reports,
    secretValues: secretValuesOf(secrets),
    orchestratorCaps: caps.orchestrator,
    /* one Send: the director's chat turn decides it's work → the same goal POST /work makes */
    startWork: (projectId, goal) => dispatch.start(projectId, goal, undefined, { fromChat: true }),
  });
  threadsRef = threads;
  /* the project's own app (its dev server), on the user's Mac; stopped with the server */
  const apps = createAppRunner({
    store,
    events,
    sandbox: config.sandbox,
    secretValues: secretValuesOf(secrets),
    ports,
  });
  /* the ask_user MCP server calls back here; learn our own address once listening */
  app.addHook('onListen', async () => {
    const a = app.server.address();
    if (a && typeof a === 'object')
      runtime.setBaseUrl(`http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}`);
  });
  app.addHook('preClose', async () => {
    lifecycle.stop();
    github.stop();
    for (const res of open) res.end();
    await Promise.all([runtime.shutdown(), apps.stopAll()]);
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
  app.register(setterRoutes({ store, config, events, github }));
  app.register(githubRoutes({ github }));
  app.register(
    eventRoutes({ store, events, open, dev, ...(heartbeatMs === undefined ? {} : { heartbeatMs }) }),
  );
  app.register(credentialRoutes({ cabinet: theCabinet }));
  app.register(accessesRoutes({ cabinet: theCabinet, access }));
  app.register(runRoutes({ runtime, ...(longPollMs === undefined ? {} : { longPollMs }) }));
  app.register(crewRoutes({ chat, creator, dispatch }));
  app.register(projectHealthRoutes({ health, apps, github }));
  app.register(appRoutes({ apps }));
  app.register(portRoutes({ store, ports, apps, db }));
  app.register(collaborationRoutes({ collaboration }));
  app.register(featureRoutes({ features }));
  app.register(threadRoutes({ threads }));
  app.register(reportRoutes({ reports }));
  app.register(officeRoutes({ office: createOffice({ db, store, progressOf: lifecycle.progressOf }) }));
  return app;
}
