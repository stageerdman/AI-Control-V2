/* The runtime: starts agent runs on a Runner, turns what they do into events, and
   brokers ask_user questions between a run and the user. Rules:
   - with `autoApprove` on, a yes/no permission check (runtime/confirm.ts) is answered by the studio at once
     (answeredBy 'auto', an `ask.answered` event) — it never opens, never pages;
   - one live run per agent per project (409);
   - the run's env = minimal base + the project's GRANTED secrets only;
   - every event goes through the log (validated, secrets redacted — including this
     run's granted values), never straight to a client. */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import type { Ports } from '../apps/ports.ts';
import type { Db } from '../db/connection.ts';
import { type Ask, type Run, runsRepo } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import type { EventInput } from '../domain/events.ts';
import { slugify } from '../domain/ids.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import type { WorkKind } from '../office/work-time.ts';
import type { Bridges, BridgeTool } from '../room/bridge.ts';
import { WORKING_WITH_OTHERS } from '../room/context.ts';
import type { AgentAccess } from '../secrets/projectAccess.ts';
import { composePrompt } from './compose.ts';
import { DEFAULT_CAPS } from './config.ts';
import { autoAnswer } from './confirm.ts';
import { runEnv } from './env.ts';
import type { Caps, RunEvent, RunHandle, Runner, RunOutcome } from './runner.ts';

export type StartRun = {
  agentId: string;
  teamId?: string;
  task: string;
  caps?: Partial<Caps>;
  resumeRunId?: string;
  /** Work in this checkout instead of the project folder: an item's own git worktree (must be under `worktreesRoot`). */
  workdir?: string;
  /** A big-picture run (the orchestrator's office chat): this system prompt instead of the composed one,
      no tools at all, no secrets, no ask tool — it answers in its reply. */
  bigPicture?: { systemPrompt: string };
  /** What kind of work this is, for the office's work clock (office/work-time.ts). Absent → read from the row. */
  kind?: WorkKind;
};
type Live = { run: Run; handle: RunHandle; token: string; secrets: string[]; reporter: boolean };
/** The reports seam (src/reports): who may file, and filing itself. */
export type ReportDesk = {
  canFile(agent: { kind: string; roleId: string | null }, teamId?: string | null): boolean;
  file(run: Run, input: unknown, extraSecrets: readonly string[]): { id: string };
};
type Waiter = (a: Ask) => void;

export type RuntimeDeps = {
  db: Db;
  store: Store;
  events: EventLog;
  runner: Runner;
  sandbox: string;
  model: string;
  /** Granted secrets for a project (B3 projectAccess.envFor). */
  envFor: (projectId: string) => Record<string, string>;
  /** What each granted access provides, by label + env var (no values) — named in the agent's prompt (G1). */
  accessFor?: (projectId: string) => AgentAccess[];
  /** G1: the project's port block — each agent run gets a spare as PORT (+ AI_STUDIO_PORTS) and a line in its brief. */
  ports?: Ports;
  parentEnv?: NodeJS.ProcessEnv;
  /** Reporter runs get file_report (absent → nobody files). */
  reports?: ReportDesk;
  /** Where toolsmiths keep their toolkits (<data dir>/toolkits); absent → no toolkits. */
  toolkitsRoot?: string;
  /** Shell commands agent runs may use (named in their prompt; the CLI runner enforces its own allow-list). */
  shell?: readonly string[];
  /** Default caps for agent runs (src/runtime/config.ts loadCaps). */
  defaultCaps?: Caps;
  /** Where item worktrees live (<data dir>/worktrees); a run's `workdir` must be inside it. */
  worktreesRoot?: string;
  /** The studio's `autoApprove` setting (read per ask); absent = off. */
  autoApprove?: () => boolean;
  /** AGENT MCP: where runs' studio tools are served. */
  bridges?: Bridges;
};
/** AGENT MCP: the studio tools an agent run gets (room, call_agent), wired once the room exists. */
export type StudioToolsFor = (run: { projectId: string; agentId: string; runId: string }) => BridgeTool[];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createRuntime(deps: RuntimeDeps) {
  const { db, store, events, runner, sandbox } = deps;
  const repo = runsRepo(db);
  const live = new Map<string, Live>();
  const waiters = new Map<string, Set<Waiter>>();
  const finishedListeners = new Set<(run: Run) => void>();
  let baseUrl: string | null = null;
  let studioToolsFor: StudioToolsFor | null = null;

  const emit = (projectId: string, input: EventInput, secrets: readonly string[] = []) => {
    try {
      events.append('project', projectId, input, secrets);
    } catch {
      /* a malformed progress line never kills a run */
    }
  };
  const settle = (ask: Ask) => {
    for (const w of waiters.get(ask.id) ?? []) w(ask);
    waiters.delete(ask.id);
  };

  /* ---------------------------------------------------------------- asks */
  function openAsk(runId: string, question: string, options?: string[]): Ask {
    const l = live.get(runId);
    if (!l) throw conflict('That run is not running');
    const q = question.trim();
    if (!q) throw invalid('The question is empty');
    const ask = repo.insertAsk({
      id: randomUUID(),
      runId,
      projectId: l.run.projectId,
      agentId: l.run.agentId,
      question: clip(q, 2000),
      options: options?.length ? options.slice(0, 10).map((o) => clip(o, 200)) : null,
    });
    const yes = deps.autoApprove?.() ? autoAnswer(ask.question, ask.options) : null;
    if (yes) {
      repo.answerAsk(ask.id, yes, 'auto');
      emit(l.run.projectId, { type: 'ask.answered', payload: { askId: ask.id, answer: yes } }, l.secrets);
      return repo.ask(ask.id) as Ask;
    }
    emit(
      l.run.projectId,
      {
        type: 'ask.opened',
        payload: {
          askId: ask.id,
          agentId: ask.agentId,
          runId,
          kind: 'question',
          question: ask.question,
          ...(ask.options ? { options: ask.options } : {}),
        },
      },
      l.secrets,
    );
    return ask;
  }
  /** Resolves when the ask is answered/cancelled, or with the open ask after `timeoutMs`. */
  function waitAsk(askId: string, timeoutMs: number): Promise<Ask> {
    const a = repo.ask(askId);
    if (!a) return Promise.reject(notFound('Ask', askId));
    if (a.status !== 'open') return Promise.resolve(a);
    return new Promise((resolve) => {
      const set = waiters.get(askId) ?? new Set<Waiter>();
      const done: Waiter = (x) => {
        clearTimeout(timer);
        set.delete(done);
        resolve(x);
      };
      const timer = setTimeout(() => done(repo.ask(askId) as Ask), timeoutMs);
      set.add(done);
      waiters.set(askId, set);
    });
  }

  /* ---------------------------------------------------------------- runs */
  function finish(l: Live, o: RunOutcome) {
    const { run } = l;
    live.delete(run.id);
    repo.finish(run.id, o);
    for (const id of repo.cancelAsks(run.id)) settle(repo.ask(id) as Ask);
    emit(
      run.projectId,
      {
        type: 'run.finished',
        payload: {
          runId: run.id,
          agentId: run.agentId,
          status: o.status,
          turns: o.turns,
          input: o.usage.input + o.usage.cacheRead + o.usage.cacheWrite,
          output: o.usage.output,
          ...(o.result ? { result: clip(o.result, 4000) } : {}),
          ...(o.error ? { error: clip(o.error, 2000) } : {}),
          ...(o.costUsd === undefined ? {} : { costUsd: o.costUsd }),
        },
      },
      l.secrets,
    );
    emit(run.projectId, {
      type: 'agent.status',
      payload: { agentId: run.agentId, runId: run.id, status: o.status === 'succeeded' ? 'done' : 'idle' },
    });
    const ended = repo.get(run.id) as Run;
    for (const fn of finishedListeners) {
      try {
        fn(ended);
      } catch {
        /* a listener never breaks the runtime */
      }
    }
  }

  function onRunEvent(l: Live, e: RunEvent) {
    const { run } = l;
    if (e.kind === 'session') repo.setSession(run.id, e.sessionId);
    else if (e.kind === 'activity')
      emit(
        run.projectId,
        {
          type: 'agent.status',
          payload: { agentId: run.agentId, runId: run.id, status: e.status, activity: e.activity },
        },
        l.secrets,
      );
    else if (e.kind === 'tokens')
      emit(run.projectId, {
        type: 'tokens',
        payload: { agentId: run.agentId, runId: run.id, input: e.input, output: e.output },
      });
  }

  function start(projectId: string, req: StartRun): Run {
    if (runner.unavailable) throw conflict(runner.unavailable);
    const project = store.projects.require(projectId);
    if (!project.folder) throw conflict(`Project '${projectId}' has no folder yet — set it up first`);
    const folder = resolveInSandbox(sandbox, project.folder);
    if (!existsSync(folder)) throw conflict(`Project folder '${project.folder}' is missing on disk`);
    let cwd = folder;
    if (req.workdir) {
      const root = deps.worktreesRoot;
      const rel = root ? relative(root, req.workdir) : '..';
      if (!isAbsolute(req.workdir) || !rel || rel.startsWith('..') || isAbsolute(rel))
        throw invalid('workdir must be an item checkout under the studio worktrees folder');
      if (!existsSync(req.workdir)) throw conflict('That checkout is missing on disk');
      cwd = req.workdir;
    }
    const agent = store.agents.require(store.agents.ref(req.agentId).id);
    let team = null;
    if (req.teamId) {
      const t = store.teams.get(req.teamId);
      if (!t) throw invalid(`Unknown team '${req.teamId}'`, { teamId: req.teamId });
      const seat = t.members.find((m) => m.agentId === agent.id);
      if (!seat) throw conflict(`${agent.name} is not on ${t.name}`, { agentId: agent.id, teamId: t.id });
      team = {
        name: t.name,
        instr: t.instr,
        code: t.code,
        job: seat.instr,
        isCaptain: t.captainId === agent.id,
      };
    }
    if (repo.live(projectId, agent.id))
      throw conflict(`${agent.name} is already running on this project`, { agentId: agent.id });
    let resumeSessionId: string | undefined;
    if (req.resumeRunId) {
      const prev = repo.get(req.resumeRunId);
      if (!prev || prev.projectId !== projectId || prev.agentId !== agent.id || !prev.sessionId)
        throw invalid('resumeRunId must be an earlier run of this agent on this project with a session');
      resumeSessionId = prev.sessionId;
    }

    const caps: Caps = { ...(deps.defaultCaps ?? DEFAULT_CAPS), ...req.caps };
    const big = req.bigPicture;
    const granted = big ? {} : deps.envFor(projectId);
    const secrets = Object.values(granted).filter(Boolean);
    const runId = randomUUID();
    const token = randomUUID();
    const run = repo.insert({
      id: runId,
      projectId,
      agentId: agent.id,
      teamId: req.teamId ?? null,
      task: req.task,
      runner: runner.name,
      model: deps.model,
      caps,
      kind: req.kind ?? null,
    });
    const reporter = !big && !!deps.reports?.canFile(agent, req.teamId ?? null);
    const toolkit = big ? null : toolkitFor(agent);
    const ports = big || !deps.ports ? null : deps.ports.take(projectId, runId);
    const studioTools = !big && studioToolsFor ? studioToolsFor({ projectId, agentId: agent.id, runId }) : [];
    const bridge = studioTools.length && deps.bridges ? deps.bridges.open(studioTools) : null;
    const l: Live = {
      run,
      token,
      secrets,
      reporter,
      handle: { done: Promise.resolve({} as RunOutcome), cancel: () => {} },
    };
    live.set(runId, l);
    emit(
      projectId,
      {
        type: 'run.started',
        payload: {
          runId,
          agentId: agent.id,
          ...(req.teamId ? { teamId: req.teamId } : {}),
          task: clip(req.task, 2000),
        },
      },
      secrets,
    );
    emit(projectId, {
      type: 'agent.status',
      payload: {
        agentId: agent.id,
        runId,
        status: 'working',
        activity: { kind: 'starting', label: 'Getting started' },
      },
    });

    l.handle = runner.start(
      {
        runId,
        cwd,
        systemPrompt:
          big?.systemPrompt ??
          composePrompt({
            agent,
            team,
            project: { name: project.name },
            toolkit,
            ...(deps.shell ? { shell: deps.shell } : {}),
            ...(deps.accessFor ? { access: deps.accessFor(projectId) } : {}),
            ...(ports
              ? { ports: { port: ports.port, app: ports.block.app, spares: ports.block.spares } }
              : {}),
            room: bridge ? WORKING_WITH_OTHERS : null,
          }),
        task: req.task,
        model: deps.model,
        caps,
        env: runEnv(
          deps.parentEnv ?? process.env,
          granted,
          ports
            ? {
                PORT: String(ports.port),
                AI_STUDIO_PORTS: ports.block.spares.join(','),
                AI_STUDIO_APP_PORT: String(ports.block.app),
              }
            : {},
        ),
        secretValues: secrets,
        ...(big ? { tools: [] } : {}),
        ...(toolkit ? { addDirs: [toolkit.dir] } : {}),
        ...(reporter ? { web: true } : {}),
        ...(resumeSessionId ? { resumeSessionId } : {}),
        ...(bridge
          ? { studioTools: { names: bridge.names, ...(bridge.remote ? { remote: bridge.remote } : {}) } }
          : {}),
        ...(baseUrl && !big
          ? {
              askBridge: {
                url: `${baseUrl}/internal/runs/${runId}/asks`,
                token,
                ...(reporter ? { reportUrl: `${baseUrl}/internal/runs/${runId}/reports` } : {}),
              },
            }
          : {}),
      },
      {
        emit: (e) => onRunEvent(l, e),
        ask: async (question, options) => {
          const a = await waitUntilAnswered(openAsk(runId, question, options).id);
          if (a.status !== 'answered') throw new Error('cancelled');
          return a.answer as string;
        },
        ...(reporter ? { report: async (input: unknown) => fileReport(runId, input) } : {}),
        ...(bridge ? { tool: bridge.call } : {}),
      },
    );
    const release = () => {
      deps.ports?.release(runId);
      bridge?.close();
    };
    l.handle.done.then(release, release);
    l.handle.done.then(
      (o) => finish(l, o),
      (err: Error) =>
        finish(l, {
          status: 'failed',
          error: err.message,
          turns: 0,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }),
    );
    return run;
  }
  /** A toolsmith's toolkit: `<toolkitsRoot>/<agentId>/` (created 0700, inside the data dir — never anywhere else). */
  function toolkitFor(agent: { id: string; name: string; roleId: string | null }) {
    if (!deps.toolkitsRoot || !agent.roleId || !store.roles.get(agent.roleId)?.toolsmith) return null;
    const dir = join(deps.toolkitsRoot, agent.id.replace(/[^a-zA-Z0-9_-]/g, '_'));
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return { dir, projectDir: `tools/${slugify(agent.name, agent.id)}` };
  }
  /** file_report from a live reporter run (the MCP side door and the FakeRunner both land here). */
  function fileReport(runId: string, input: unknown): { id: string } {
    const l = live.get(runId);
    if (!l) throw conflict('That run is not running');
    if (!l.reporter || !deps.reports) throw conflict('This run does not file reports');
    return { id: deps.reports.file(l.run, input, l.secrets).id };
  }
  const waitUntilAnswered = async (askId: string): Promise<Ask> => {
    for (;;) {
      const a = await waitAsk(askId, 60_000);
      if (a.status !== 'open') return a;
    }
  };

  const requireRun = (projectId: string, runId: string) => {
    const r = repo.get(runId);
    if (!r || r.projectId !== projectId) throw notFound('Run', runId);
    return r;
  };

  return {
    start,
    list(projectId: string) {
      store.projects.require(projectId);
      return repo.list(projectId);
    },
    get: requireRun,
    cancel(projectId: string, runId: string): Run {
      const r = requireRun(projectId, runId);
      const l = live.get(runId);
      if (!l) throw conflict(`Run is already ${r.status}`);
      l.handle.cancel();
      return r;
    },
    /** Resolves once the run has ended and been recorded (tests, shutdown). */
    settled: async (runId: string) => {
      await live.get(runId)?.handle.done;
      await new Promise((r) => setImmediate(r));
      return repo.get(runId) as Run;
    },
    asks(projectId: string, status?: Ask['status']) {
      store.projects.require(projectId);
      return repo.asks(projectId, status);
    },
    /** The pager: asks across the studio (default: open ones). */
    studioAsks: (status: Ask['status'] | undefined, unseenOnly = false) =>
      repo.studioAsks(status, unseenOnly),
    /** The user opened this project's office and left: its open asks go quiet until a new one arrives. */
    markSeen(projectId: string): { seen: number } {
      store.projects.require(projectId);
      return { seen: repo.markSeen(projectId) };
    },
    answer(projectId: string, askId: string, answer: string): Ask {
      const a = repo.ask(askId);
      if (!a || a.projectId !== projectId) throw notFound('Ask', askId);
      if (a.status !== 'open') throw conflict(`This question is already ${a.status}`);
      repo.answerAsk(askId, answer);
      const done = repo.ask(askId) as Ask;
      emit(
        projectId,
        { type: 'ask.answered', payload: { askId, answer: clip(answer, 2000) } },
        live.get(a.runId)?.secrets,
      );
      settle(done);
      return done;
    },
    /* the ask_user MCP server's side door (token per run) */
    internal: {
      authorize(runId: string, token: string | undefined): void {
        const l = live.get(runId);
        const ok =
          !!l &&
          !!token &&
          token.length === l.token.length &&
          timingSafeEqual(Buffer.from(token), Buffer.from(l.token));
        if (!ok) throw notFound('Run', runId);
      },
      openAsk,
      fileReport,
      waitAsk(runId: string, askId: string, timeoutMs: number) {
        const a = repo.ask(askId);
        if (!a || a.runId !== runId) return Promise.reject(notFound('Ask', askId));
        return waitAsk(askId, timeoutMs);
      },
    },
    /** Called once per run after it ended and was recorded (dispatch marks checklist items). */
    onFinished(fn: (run: Run) => void): () => void {
      finishedListeners.add(fn);
      return () => finishedListeners.delete(fn);
    },
    setBaseUrl: (url: string) => {
      baseUrl = url;
    },
    /** AGENT MCP: from now on agent runs get these studio tools. */
    setStudioTools: (fn: StudioToolsFor) => {
      studioToolsFor = fn;
    },
    recover: () => repo.failInterrupted(),
    shutdown: async () => {
      const all = [...live.values()];
      for (const l of all) l.handle.cancel();
      await Promise.allSettled(all.map((l) => l.handle.done));
    },
    liveCount: () => live.size,
    /** Is this agent on a live run in this project? (one at a time) */
    busy: (projectId: string, agentId: string) => !!repo.live(projectId, agentId),
  };
}
export type Runtime = ReturnType<typeof createRuntime>;
