/* Fastify factory. Everything the app needs is injected, so tests can build an
   app on an in-memory db and a temp sandbox and drive it with inject(). */
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createAppRunner } from './apps/app-runner.ts';
import { createPorts } from './apps/ports.ts';
import { historyTools } from './chats/tools.ts';
import { createComms } from './comms/comms.ts';
import type { Config } from './config.ts';
import { createCollaboration } from './crew/collaboration.ts';
import { createCreator } from './crew/creator.ts';
import { createCreatorChat, hireTool, proposeTool } from './crew/creator-chat.ts';
import { createDispatch, planReply } from './crew/dispatch.ts';
import { fakeBrain } from './crew/fake-brain.ts';
import { createSetupChat } from './crew/setup-chat.ts';
import { createCrew } from './crew/structured.ts';
import type { Db } from './db/connection.ts';
import { runsRepo } from './db/runs.ts';
import { metaFlag, metaValue } from './db/settings.ts';
import { createStore, type Store } from './db/store.ts';
import { workRepo } from './db/work.ts';
import { AppError, parse } from './errors.ts';
import { createBus } from './events/bus.ts';
import { type EventLog, eventLog } from './events/log.ts';
import { worktrees } from './git/worktrees.ts';
import { createGithub, type GhRun } from './github/github.ts';
import type { GhProbe } from './health/git-status.ts';
import { createHealth } from './health/health.ts';
import { registerCors } from './http/cors.ts';
import type { OpenStreams } from './http/sse.ts';
import { actionTools } from './office/action-tools.ts';
import { createAgentEdits } from './office/agent-edits.ts';
import { agentFeatureTool } from './office/agent-feature-tool.ts';
import { createChatWork } from './office/chat-work.ts';
import { createDesk } from './office/desk.ts';
import { createDirectorStop } from './office/director-stop.ts';
import { featureTools } from './office/feature-tools.ts';
import { createFeatures } from './office/features.ts';
import { createGuests } from './office/guests.ts';
import { createKinCopies } from './office/kin-copies.ts';
import { captainTools } from './office/leader-tools.ts';
import { createLifecycle } from './office/lifecycle.ts';
import { createMail } from './office/mail.ts';
import { createOffice } from './office/office.ts';
import { createPager, pagerTools, pageTool } from './office/pager.ts';
import { createPages } from './office/pages.ts';
import { seatForWork } from './office/people.ts';
import { createPortraits } from './office/portrait.ts';
import { createPrinciples } from './office/principles.ts';
import { questionTools } from './office/question-tools.ts';
import { createRebuilds } from './office/rebuild-service.ts';
import { createReportIn } from './office/report-in.ts';
import { createStaffing } from './office/staffing.ts';
import { teamTools } from './office/team-tools.ts';
import { createThreads } from './office/threads.ts';
import { createWorkClock } from './office/work-time.ts';
import { createReports, ReportInputSchema } from './reports/reports.ts';
import { createBridges } from './room/bridge.ts';
import { notesOf } from './room/notes-of.ts';
import { createRoom } from './room/room.ts';
import { accessesRoutes } from './routes/accesses.ts';
import { agentRoutes } from './routes/agents.ts';
import { appRoutes } from './routes/app.ts';
import { blueprintRoutes } from './routes/blueprint.ts';
import { bridgeRoutes } from './routes/bridges.ts';
import { chatRoutes } from './routes/chats.ts';
import { collaborationRoutes } from './routes/collaboration.ts';
import { commsRoutes } from './routes/comms.ts';
import { creatorChatRoutes } from './routes/creator-chat.ts';
import { credentialRoutes } from './routes/credentials.ts';
import { crewRoutes } from './routes/crew.ts';
import { deskRoutes } from './routes/desk.ts';
import { draftRoutes } from './routes/drafts.ts';
import { eventRoutes } from './routes/events.ts';
import { featureRoutes } from './routes/features.ts';
import { githubRoutes } from './routes/github.ts';
import { guestRoutes } from './routes/guests.ts';
import { healthRoutes } from './routes/health.ts';
import { mailRoutes } from './routes/mail.ts';
import { officeRoutes } from './routes/office.ts';
import { performanceRoutes } from './routes/performance.ts';
import { portraitRoutes } from './routes/portrait.ts';
import { portRoutes } from './routes/ports.ts';
import { principlesRoutes } from './routes/principles.ts';
import { projectHealthRoutes } from './routes/project-health.ts';
import { projectRoutes } from './routes/projects.ts';
import { rebuildRoutes } from './routes/rebuild.ts';
import { recapRoutes } from './routes/recap.ts';
import { reportRoutes } from './routes/reports.ts';
import { roleRoutes } from './routes/roles.ts';
import { runningRoutes } from './routes/running.ts';
import { runRoutes } from './routes/runs.ts';
import { setterRoutes } from './routes/setter.ts';
import { settingsRoutes } from './routes/settings.ts';
import { teamRoutes } from './routes/teams.ts';
import { threadRoutes } from './routes/threads.ts';
import { timeRoutes } from './routes/time.ts';
import { todoRoutes } from './routes/todos.ts';
import { trashRoutes } from './routes/trash.ts';
import { usageRoutes } from './routes/usage.ts';
import { createRunning } from './running/registry.ts';
import { createStopper } from './running/stop.ts';
import { runningTools } from './running/tools.ts';
import { createChatReplier } from './runtime/chat-reply.ts';
import { AGENT_SHELL, loadCaps, type StudioCaps } from './runtime/config.ts';
import { fakeRunner } from './runtime/fake.ts';
import { createRecapper } from './runtime/recap.ts';
import type { Runner } from './runtime/runner.ts';
import { createRuntime, type Runtime } from './runtime/service.ts';
import { cabinet } from './secrets/cabinet.ts';
import { projectAccess } from './secrets/projectAccess.ts';
import { fileSecretStore, type SecretStore } from './secrets/secretStore.ts';
import {
  type BuildReport,
  createSelfInstall,
  type InstalledBuild,
  type Installer,
  studioProject,
} from './self-install/self-install.ts';
import { createTodos } from './todos/todos.ts';
import { todoTools } from './todos/tools.ts';
import { tracked } from './usage/usage.ts';
import { createBoard } from './whiteboard/board.ts';
import { whiteboardTools } from './whiteboard/tools.ts';

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
  /** Rebuild + reinstall the Mac app after merges into this checkout (`repo`). Default null = never. */
  selfInstall?: {
    repo: string;
    install: Installer;
    isBehind: () => boolean;
    /** The commit this backend runs, and what the installer says is in /Applications (for /health). */
    running: string;
    installed: () => InstalledBuild | null;
  } | null;
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
  selfInstall = null,
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
  /* AGENTS: on = the studio says yes to agents' yes/no permission checks itself (never pages the user) */
  const autoApprove = metaFlag(db, 'auto_approve');
  /* AGENT MCP: studio tools per run, served to the MCP server over the internal side door */
  const bridges = createBridges();
  /* STUDIO LIFE: every message between agents, kept whole; desk notes for agents who forget on purpose */
  const comms = createComms({ db, events, secretValues: secretValuesOf(secrets) });
  const desk = createDesk({ db, events, comms });
  const forgetAt = Number(process.env.AI_STUDIO_FORGET_AT);
  /* RUNNING: the one list of every live session, app and code run, per agent and per project */
  const running = createRunning({ secretValues: secretValuesOf(secrets) });
  const runtime = createRuntime({
    running,
    bridges,
    desk,
    ...(Number.isInteger(forgetAt) && forgetAt > 0 ? { forgetAt } : {}),
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
    autoApprove: autoApprove.get,
    /* reporter runs get file_report; its input is checked here (422 lists what's wrong) */
    reports: {
      canFile: reports.canFile,
      file: (run, input, extra) => reports.file(run, parse(ReportInputSchema, input), extra),
    },
  });
  runtime.recover();
  onRuntime?.(runtime);
  /* the office's work clock: runs + the crew calls that never become runs */
  const clock = createWorkClock(db);
  clock.recover();
  /* the studio crew (orchestrator, Agent Creator): tool-less runs in a scratch dir, never a project folder */
  const crew = createCrew({
    running,
    bridges,
    clock,
    runner,
    model,
    scratchDir: join(config.home, 'scratch'),
    caps: caps.orchestrator,
  });
  const chat = createSetupChat({ store, events, crew });
  /* AGENT MCP: who is in the room, and agents calling each other into it */
  const room = createRoom({
    db,
    store,
    events,
    crew,
    sandbox: config.sandbox,
    helpCaps: caps.review,
    comms,
    memoryOf: notesOf({ runs: (id) => runsRepo(db).list(id), desk: (p, a) => desk.list(p, a) }),
    /* `call_agent` with work: true — a direct goal with one task for the callee (built below; runs later) */
    addWork: (projectId, byId, calleeId, request) => {
      const text = request.split('\n')[0]?.slice(0, 200) || request.slice(0, 200);
      seatForWork(store, projectId, calleeId, request);
      /* the request also queues on the callee's own to-do list, in the order requests came */
      todos.add({ projectId, agentId: calleeId, fromId: byId, text: request });
      const goal = board.addDirectGoal(projectId, byId, {
        text,
        tasks: [{ text, owner: calleeId, brief: request }],
      });
      return goal.summary || goal.text;
    },
  });
  const creator = createCreator({ store, events, crew, room });
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
  /* RUNNING: stop one agent completely, or everything in a project (its queue first, so nothing new starts) */
  const stopper = createStopper({ running, cancelGoals: (projectId) => void dispatch.cancelAll(projectId) });
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
  /* merges into AI Studio itself reinstall the Mac app, so Spotlight opens the newest build */
  const installer = selfInstall
    ? createSelfInstall({
        bus: events.bus,
        isStudio: studioProject(store, config.sandbox, selfInstall.repo),
        isBehind: selfInstall.isBehind,
        install: selfInstall.install,
        log: app.log,
      })
    : null;
  const build =
    selfInstall && installer
      ? (): BuildReport => ({
          running: selfInstall.running,
          installed: selfInstall.installed(),
          install: installer.status(),
        })
      : null;
  const health = createHealth({ db, store, events, crew, sandbox: config.sandbox, gh });
  /* team rebuilds: plan → confirm card → apply (one tx) → Undo */
  const rebuilds = createRebuilds({
    store,
    events,
    stopRun: (projectId, runId) => {
      try {
        runtime.cancel(projectId, runId);
      } catch {
        /* already ended */
      }
    },
  });
  /* the director staffs the project from chat (existing Cast agents only); Rearrange brings people back */
  const staffing = createStaffing({ store, events });
  /* the director edits the whiteboard and the features list itself (its chat turns' only tools) */
  const board = createBoard({ db, store, port: dispatch.board });
  /* "stop Jony" / "stop everything" from the office chat */
  const stops = createDirectorStop({
    store,
    running,
    stopper,
    leaveNote: (projectId, agentId, fromId, message) =>
      desk.save(projectId, agentId, null, {
        where: `Stopped by ${store.agents.get(fromId)?.name ?? 'a leader'}; my chat and saved work are kept.`,
        doing: 'Nothing — stopped partway.',
        next: message.slice(0, 2000),
      }),
  });
  const actions = {
    store,
    work: workRepo(db),
    stops,
    tell: (projectId: string, agentId: string, from: string, text: string) =>
      !!runtime.tell(projectId, agentId, from, text),
    /* "carry on": the director continues a stopped goal where it was */
    resumeGoal: (projectId: string, goalId: string) => dispatch.resume(projectId, goalId),
    /* the director asks someone on the project: a call from the director (no approval; the office shows it) */
    ask: (projectId: string, directorId: string, to: string, request: string, work?: boolean) =>
      room.call(
        { scope: 'project', ownerId: projectId, agentId: directorId, chain: [] },
        {
          agent: to,
          request,
          why: work ? 'take on work for the user' : 'answer a question for the user',
          work,
        },
      ),
  };
  /* any agent pages the user; the director can also page when a goal ends */
  const pager = createPager({
    comms,
    events,
    goals: (projectId) => actions.work.goals(projectId),
    todos: () => todos,
  });
  /* each agent's saved to-do list; a `notify` item pages the user when it is ticked off */
  const todos = createTodos({ db, events, onNotify: (t) => pager.notify(t) });
  const threads = createThreads({
    /* mail and creatorChats are built after threads; these run only in a chat turn, by then they exist */
    /* each use lands in the object-use log (usage/usage.ts) */
    directorTools: (projectId, directorId, turn) =>
      tracked(
        [
          ...whiteboardTools(board, projectId, directorId),
          ...featureTools(features, store, projectId),
          ...actionTools(actions, projectId, directorId),
          ...teamTools({ staffing, rebuilds }, projectId, directorId, turn),
          ...questionTools({ store, runtime }, projectId),
          ...mail.directorTools(projectId, directorId),
          ...pagerTools(pager, projectId, directorId),
          ...todoTools(todos, agentName, projectId, directorId),
          hireTool(creatorChats, () => ({
            name: store.agents.get(directorId)?.name ?? 'The director',
            projectName: store.projects.get(projectId)?.name ?? 'this project',
          })),
        ],
        { projectId, agentId: directorId },
        (pid, e) => events.append('project', pid, e),
      ),
    db,
    store,
    events,
    runtime,
    runningNow: stops.runningNow,
    liveSessions: (projectId) => running.list({ projectId }).filter((i) => i.kind === 'session'),
    features,
    health,
    reports,
    secretValues: secretValuesOf(secrets),
    orchestratorCaps: caps.orchestrator,
    rebuilds,
  });
  threadsRef = threads;
  /* someone finished a step → they tell the director, who decides what the user hears (chat, page or keep) */
  const reportIn = createReportIn({ db, store, events, crew, threads, comms });
  const pages = createPages({ db, store });
  /* STUDIO LIFE: the mailbox — HQ is the project in meta 'hq_project'; the director triages new mail on its own */
  const hq = metaValue(db, 'hq_project');
  const mail = createMail({
    db,
    store,
    events,
    crew,
    comms,
    hq: () => {
      const id = hq.get();
      return id && store.projects.get(id) ? id : null;
    },
    startWork: (projectId, goal) => dispatch.start(projectId, goal, undefined, { fromChat: true }),
    say: (projectId, directorId, text, goalId) =>
      threads.record(projectId, directorId, { sender: 'agent', text, goalId: goalId ?? null }),
  });
  /* Tinker's design chats; HQ's agents may propose new agents into them */
  const creatorChats = createCreatorChat({
    db,
    store,
    crew,
    creator,
    scratchDir: join(config.home, 'scratch'),
  });
  /* every agent run's studio tools: the room (call_agent, comms_log), its feature, mail when it may (+ propose_agent at HQ) */
  runtime.setStudioTools(({ projectId, agentId, runId }) => [
    ...room.tools({ scope: 'project', ownerId: projectId, agentId, chain: [] }),
    ...runningTools(running, { agentId, runId }, (id) => store.projects.get(id)?.name),
    ...historyTools(db, { projectId, agentId, runId }),
    agentFeatureTool({ features, work: actions.work }, { projectId, runId }),
    ...mail.tools(projectId, agentId),
    pageTool(pager, projectId, agentId),
    ...todoTools(todos, agentName, projectId, agentId),
    /* a team captain stops and tells their own team (the director does the whole project) */
    ...captainTools(actions, projectId, agentId),
    ...(hq.get() === projectId
      ? [
          proposeTool(creatorChats, () => ({
            name: store.agents.get(agentId)?.name ?? 'An agent',
            projectName: store.projects.get(projectId)?.name ?? 'HQ',
          })),
        ]
      : []),
  ]);
  /* the project's own app (its dev server), on the user's Mac; stopped with the server */
  const apps = createAppRunner({
    store,
    events,
    sandbox: config.sandbox,
    secretValues: secretValuesOf(secrets),
    ports,
    running,
  });
  /* the ask_user MCP server calls back here; learn our own address once listening */
  app.addHook('onListen', async () => {
    const a = app.server.address();
    if (a && typeof a === 'object') {
      const url = `http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}`;
      runtime.setBaseUrl(url);
      bridges.setBaseUrl(url);
    }
  });
  app.addHook('preClose', async () => {
    lifecycle.stop();
    comms.stop();
    reportIn.stop();
    pager.stop();
    github.stop();
    installer?.stop();
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

  app.register(healthRoutes({ config, db, build }));
  for (const routes of [roleRoutes, teamRoutes, projectRoutes, draftRoutes, trashRoutes])
    app.register(routes(store));
  app.register(
    agentRoutes({
      store,
      edits: createAgentEdits({ store, events }),
      copies: createKinCopies({ store }),
      shell,
      reporter: (a) => reports.canFile(a),
    }),
  );
  app.register(blueprintRoutes({ config }));
  app.register(setterRoutes({ store, config, events, github, clock }));
  app.register(timeRoutes({ store, clock }));
  app.register(performanceRoutes({ db, store }));
  app.register(portraitRoutes({ portraits: createPortraits({ db, store, events, home: config.home }) }));
  app.register(githubRoutes({ github }));
  app.register(settingsRoutes({ github, autoApprove, hq, store }));
  app.register(mailRoutes({ mail }));
  app.register(creatorChatRoutes({ chats: creatorChats }));
  app.register(
    eventRoutes({ store, events, open, dev, ...(heartbeatMs === undefined ? {} : { heartbeatMs }) }),
  );
  app.register(credentialRoutes({ cabinet: theCabinet }));
  app.register(accessesRoutes({ cabinet: theCabinet, access }));
  app.register(runRoutes({ runtime, pages, ...(longPollMs === undefined ? {} : { longPollMs }) }));
  app.register(
    chatRoutes({
      db,
      store,
      replyInChat: createChatReplier(crew),
      chatWork: createChatWork({ db, store, board }),
    }),
  );
  app.register(recapRoutes({ db, store, recapChat: createRecapper(crew) }));
  app.register(commsRoutes({ comms }));
  app.register(deskRoutes({ desk, store }));
  app.register(todoRoutes({ todos, store }));
  app.register(usageRoutes({ db, store }));
  app.register(rebuildRoutes({ rebuilds, staffing, store }));
  app.register(guestRoutes({ guests: createGuests({ store, events, room, comms, runtime }) }));
  app.register(principlesRoutes({ principles: createPrinciples({ store, sandbox: config.sandbox }) }));
  app.register(bridgeRoutes({ bridges, ...(longPollMs === undefined ? {} : { longPollMs }) }));
  app.register(crewRoutes({ chat, creator, dispatch, findAgent: (id) => store.agents.get(id) ?? null }));
  app.register(projectHealthRoutes({ health, apps, github }));
  app.register(appRoutes({ apps }));
  app.register(runningRoutes({ running, stopper, store }));
  app.register(portRoutes({ store, ports, apps, db }));
  app.register(collaborationRoutes({ collaboration }));
  app.register(featureRoutes({ features }));
  app.register(threadRoutes({ threads }));
  app.register(reportRoutes({ reports }));
  app.register(officeRoutes({ office: createOffice({ db, store, progressOf: lifecycle.progressOf }) }));
  return app;
}
