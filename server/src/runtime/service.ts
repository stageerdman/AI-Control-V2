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
import { appendChatMessage, type ChatRole } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import { type Ask, type Run, runsRepo } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import type { EventInput } from '../domain/events.ts';
import { slugify } from '../domain/ids.ts';
import { isWorkStep, type WorkEvidence } from '../domain/real-work.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { redactSecrets } from '../events/redact.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import { type Desk, type DeskNoteBody, DeskNoteSchema, deskBrief } from '../office/desk.ts';
import { principlesBrief, principlesDir } from '../office/principles.ts';
import type { Asked, WorkKind } from '../performance/spans.ts';
import type { Bridges, BridgeTool } from '../room/bridge.ts';
import {
  FORGET_NUDGE,
  WORKING_WITH_OTHERS,
  WRAP_UP_STEPS,
  wrapUpNudge,
  YOUR_MEMORY,
} from '../room/context.ts';
import type { Running } from '../running/registry.ts';
import type { AgentAccess } from '../secrets/projectAccess.ts';
import { tracked } from '../usage/usage.ts';
import { accessNotice, type Pickup } from './access-notice.ts';
import { composePrompt } from './compose.ts';
import { AGENT_SHELL, DEFAULT_CAPS, macToolsFor } from './config.ts';
import { autoAnswer } from './confirm.ts';
import { runEnv } from './env.ts';
import { gitChanges, gitHead } from './git-head.ts';
import { afterLimit, afterNote, carriesOn, isLimit, type LimitState, limitBrief } from './limits.ts';
import { isMacProject } from './mac-project.ts';
import { answeredBrief, parkedHandle } from './parked.ts';
import { runPermissions } from './permissions.ts';
import type { Caps, RunEvent, RunHandle, RunIO, Runner, RunOutcome, RunSpec } from './runner.ts';
import { ASK_TOOL } from './stream.ts';

export type StartRun = {
  agentId: string;
  teamId?: string;
  task: string;
  caps?: Partial<Caps>;
  resumeRunId?: string;
  /** Work in this checkout instead of the project folder: an item's own git worktree (must be under `worktreesRoot`). */
  workdir?: string;
  /** A big-picture run (the orchestrator's office chat): this system prompt instead of the composed one,
      no built-in tools, no secrets, no ask tool — it answers in its reply. `tools`: the only studio tools it
      gets (the director's whiteboard tools); absent → none. */
  bigPicture?: { systemPrompt: string; tools?: readonly BridgeTool[] };
  /** What kind of work this is, for the office's work clock (office/work-time.ts). Absent → read from the row. */
  kind?: WorkKind;
  /** Why the agent works, for agent performance (performance/). Absent → a task. */
  asked?: Asked;
  /** The checklist item this run serves, for time estimates (performance/rollup.ts). Absent → no task's work. */
  itemId?: string;
};
type Live = {
  run: Run;
  /** Where it works (the project folder or its item checkout). */
  cwd: string;
  /** A big-picture run: no secrets, no project access. */
  big: boolean;
  handle: RunHandle;
  token: string;
  /** The granted values it may see — the same array its runner scrubs with, so a value granted mid-run is
      scrubbed too. */
  secrets: string[];
  /** It has file_report. */
  files: boolean;
  /** STUDIO LIFE: set by `forget` — when this handle ends, the run starts again from the note. */
  forgetting?: DeskNoteBody;
  forgets: number;
  /** The latest note it left this run: a session cut off at a limit carries on from it. */
  note?: DeskNoteBody;
  /** Sessions it carried on after a limit, and how many of those in a row made no new commit. */
  limits: LimitState;
  /** The checkout's HEAD and reports filed when this session began (progress = either moved). */
  mark: string;
  /** Reports filed in this run: new work for a read-only run cut off at a limit. */
  reports: number;
  /** Real-work tool steps in this run, all sessions (domain/real-work.ts). */
  workSteps: number;
  /** It answered and waits for commands it left running in the background (runtime/background.ts). */
  waiting?: boolean;
  /** The checkout's HEAD and reports filed when the run began: a different mark at the end = it changed. */
  firstMark: string;
  cancelled?: boolean;
  /** The studio is closing: the run is left 'running' on its row so the restart recovers it like a crash. */
  closing?: boolean;
  /** Turns, usage and cost of earlier sessions of this run (before a forget or a limit). */
  before: Spent;
  /** The latest turn's context size (input + cache), for the forget nudge. */
  context: number;
  nudged: boolean;
  /** Notes from the user or a leader while it runs ("Uncle Bob is already running"): the nudge hook hands them
      over after its next tool step. */
  notes: WaitingNote[];
  /** Turns in this session, for the wrap-up nudge before the cap. */
  turns: number;
  wrapped: boolean;
  /** The agent's latest words in the chat (the final result is saved only when it says something new). */
  said?: string;
  /** Takes it off the running list (src/running) once it has ended. */
  untrack?: () => void;
};
/** A note waiting on a live run until its next tool step: who left it, the words the run will get, when. */
export type WaitingNote = { runId: string; agentId: string; from: string; text: string; at: string };
/** How a run the user stopped is named: on its row (error), its chat's last line and its checklist item. */
export const STOPPED_BY_YOU = 'Stopped by you';
/** A run cut off because the studio closed; on restart it is marked interrupted and its work carries on. */
export const STUDIO_CLOSED = 'Paused: the studio closed during this run';
/** A run may forget this many times (a loop guard). */
export const MAX_FORGETS = 5;
type Spent = Pick<RunOutcome, 'turns' | 'usage' | 'costUsd'>;
/** Two sessions' turns, usage and cost as one (cost stays absent when neither knew it). */
const addSpent = (a: Spent, b: Spent): Spent => ({
  turns: a.turns + b.turns,
  usage: {
    input: a.usage.input + b.usage.input,
    output: a.usage.output + b.usage.output,
    cacheRead: a.usage.cacheRead + b.usage.cacheRead,
    cacheWrite: a.usage.cacheWrite + b.usage.cacheWrite,
  },
  ...(a.costUsd === undefined && b.costUsd === undefined
    ? {}
    : { costUsd: (a.costUsd ?? 0) + (b.costUsd ?? 0) }),
});
const NOTHING_SPENT: Spent = { turns: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
/** How the next session of a run begins: its brief, what the chat and the office are told. */
type NextSession = { brief: string; kind: 'forget' | 'limit'; label: string; line?: string };
/** Context (tokens) past which the studio nudges an agent to forget. AI_STUDIO_FORGET_AT overrides. */
export const FORGET_AT = 120_000;
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
  /** Granted folder accesses that exist (real paths): each session's extra working folders (`--add-dir`). */
  foldersFor?: (projectId: string) => string[];
  /** LIVE ACCESS: an access shared while agents work — what it is (no values), and writing the project's granted
      values into a working folder's .env (throws when it can't → the agent is told to restart). */
  liveAccess?: {
    about: (accessId: string) => AgentAccess | null;
    writeInto: (projectId: string, dir: string) => void;
  };
  /** G1: the project's port block — each agent run gets a spare as PORT (+ AI_STUDIO_PORTS) and a line in its brief. */
  ports?: Ports;
  parentEnv?: NodeJS.ProcessEnv;
  /** AGENTS PUSH: env for the agent's own git (github.com login through gh, no prompts — github/credential.ts). */
  gitEnv?: Record<string, string>;
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
  /** STUDIO LIFE: desk notes — runs get `forget` when set. */
  desk?: Desk;
  /** Context size that triggers the forget nudge (default FORGET_AT). */
  forgetAt?: number;
  /** RUNNING: the studio's list of everything running — every run is on it while it lives. */
  running?: Running;
  /** A mark of the checkout's work (default: git HEAD); a limited session that leaves it unchanged made no progress. */
  progressMark?: (cwd: string) => string | null;
};
/** AGENT MCP: the studio tools an agent run gets (room, call_agent), wired once the room exists. */
export type StudioToolsFor = (run: { projectId: string; agentId: string; runId: string }) => BridgeTool[];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createRuntime(deps: RuntimeDeps) {
  const { db, store, events, runner, sandbox } = deps;
  const repo = runsRepo(db);
  const live = new Map<string, Live>();
  const waiters = new Map<string, Set<Waiter>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** `work`: what the run did, for honest task completion (domain/real-work.ts). */
  const finishedListeners = new Set<(run: Run, work: WorkEvidence) => void>();
  const answeredListeners = new Set<(ask: Ask) => void>();
  let baseUrl: string | null = null;
  let studioToolsFor: StudioToolsFor | null = null;

  const emit = (projectId: string, input: EventInput, secrets: readonly string[] = []) => {
    try {
      events.append('project', projectId, input, secrets);
    } catch {
      /* a malformed progress line never kills a run */
    }
  };
  /** One line of the run's chat history, secrets scrubbed. A failed write is reported, never fatal to the run. */
  const record = (
    run: Pick<Run, 'id' | 'projectId' | 'agentId'>,
    secrets: readonly string[],
    role: ChatRole,
    text: string,
    meta?: Record<string, unknown>,
  ) => {
    try {
      const clean = redactSecrets({ text, meta: meta ?? null }, secrets).value;
      appendChatMessage(db, {
        runId: run.id,
        projectId: run.projectId,
        agentId: run.agentId,
        role,
        ...clean,
      });
    } catch (e) {
      console.error(`[chats] could not save a ${role} message of run ${run.id}: ${(e as Error).message}`);
    }
  };
  const settle = (ask: Ask) => {
    for (const w of waiters.get(ask.id) ?? []) w(ask);
    waiters.delete(ask.id);
  };
  /** Nobody will read the answers to this run's open questions: they close and leave every screen. */
  const withdraw = (runId: string) => {
    for (const id of repo.cancelAsks(runId)) {
      const ask = repo.ask(id) as Ask;
      settle(ask);
      emit(ask.projectId, { type: 'ask.withdrawn', payload: { askId: id } });
    }
  };
  /* besides live runs, who carries an ended run's session on (dispatch's queued resumes); wired by the app */
  let carriedOn: (runId: string) => boolean = () => false;
  /** An answer to this run's question reaches an agent: the run is live, or a resume of its session is coming. */
  const reaches = (runId: string) => live.has(runId) || carriedOn(runId);

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
    record(l.run, l.secrets, 'assistant', ask.question, {
      kind: 'ask',
      askId: ask.id,
      ...(ask.options ? { options: ask.options } : {}),
    });
    const yes = deps.autoApprove?.() ? autoAnswer(ask.question, ask.options) : null;
    if (yes) {
      repo.answerAsk(ask.id, yes, 'auto');
      record(l.run, l.secrets, 'system', `The studio answered for you: ${yes}`, {
        kind: 'answer',
        askId: ask.id,
        by: 'auto',
      });
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
        timers.delete(timer);
        set.delete(done);
        resolve(x);
      };
      const timer = setTimeout(() => done(repo.ask(askId) as Ask), timeoutMs);
      timers.add(timer);
      set.add(done);
      waiters.set(askId, set);
    });
  }

  /* ---------------------------------------------------------------- runs */
  function finish(l: Live, outcome: RunOutcome, work: WorkEvidence) {
    const { run } = l;
    live.delete(run.id);
    l.untrack?.();
    if (l.closing) return closedOut(l);
    /* a stop says so in plain words, never as an error */
    const o = outcome.status === 'cancelled' ? { ...outcome, error: STOPPED_BY_YOU } : outcome;
    repo.finish(run.id, o);
    recordEnd(l, o);
    withdraw(run.id);
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
        fn(ended, work);
      } catch (e) {
        /* a listener never breaks the runtime, but its failure is never silent */
        console.error('[runtime] onFinished listener failed', {
          projectId: ended.projectId,
          runId: ended.id,
          agentId: ended.agentId,
          error: e instanceof Error ? (e.stack ?? e.message) : String(e),
        });
      }
    }
  }

  /** The chat's last lines: the final answer (unless the agent already said it) and how the run ended. */
  function recordEnd(l: Live, o: RunOutcome) {
    if (o.result && o.result !== l.said) record(l.run, l.secrets, 'assistant', o.result, { kind: 'result' });
    const text =
      o.status === 'succeeded'
        ? 'Finished'
        : o.status === 'cancelled'
          ? `${STOPPED_BY_YOU}. The chat and the work so far are kept — ask to continue any time.`
          : `Failed: ${o.error ?? 'error'}`;
    record(l.run, l.secrets, 'system', text, { kind: 'end', status: o.status });
  }
  /** The studio closed mid-run: the chat says so and the row stays 'running' — the restart's recover marks
      it interrupted, and its checklist item carries on in the same session (dispatch.recover). An open
      question stays open: the resumed session takes it over (runtime/parked.ts). */
  function closedOut(l: Live) {
    record(l.run, l.secrets, 'system', STUDIO_CLOSED, { kind: 'end', status: 'interrupted' });
  }

  /** What a run says goes into its chat: its words, and each tool call as one short line (never the payload). */
  function recordEvent(l: Live, e: RunEvent) {
    if (e.kind === 'text') {
      l.said = e.text;
      record(l.run, l.secrets, 'assistant', e.text);
    } else if (e.kind === 'activity' && e.tool && e.tool !== ASK_TOOL)
      /* ask_user is saved as the question itself (openAsk) */
      record(l.run, l.secrets, 'tool', e.activity.label, { tool: e.tool, summary: e.activity.label });
  }

  function onRunEvent(l: Live, e: RunEvent) {
    const { run } = l;
    recordEvent(l, e);
    if (e.kind === 'activity' && isWorkStep(e.activity.kind)) l.workSteps++;
    if (e.kind === 'activity') l.waiting = e.activity.kind === 'waiting';
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
    else if (e.kind === 'tokens') {
      l.context = e.input;
      l.turns++;
      emit(run.projectId, {
        type: 'tokens',
        payload: { agentId: run.agentId, runId: run.id, input: e.input, output: e.output },
      });
    }
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
    let principles: string | null = null;
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
      principles = principlesBrief({ dir: principlesDir(t), keeper: t.captainId === agent.id });
    } else if (!req.bigPicture && project.teamIds.length) principles = principlesBrief({ all: true });
    if (repo.live(projectId, agent.id))
      throw conflict(`${agent.name} is already running on this project`, { agentId: agent.id });
    let prev: Run | null = null;
    if (req.resumeRunId) {
      prev = repo.get(req.resumeRunId);
      if (!prev || prev.projectId !== projectId || prev.agentId !== agent.id || !prev.sessionId)
        throw invalid('resumeRunId must be an earlier run of this agent on this project with a session');
    }
    const resumeSessionId = prev?.sessionId ?? undefined;

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
      asked: req.asked ?? null,
      itemId: req.itemId ?? null,
    });
    record(run, secrets, 'user', req.task);
    /* reporters research on the web; every agent may file a report (the user asked for one, or work ends in one) */
    const reporter = !big && !!deps.reports?.canFile(agent, req.teamId ?? null);
    const files = !big && !!deps.reports && agent.kind === 'agent';
    const toolkit = big ? null : toolkitFor(agent);
    const ports = big || !deps.ports ? null : deps.ports.take(projectId, runId);
    const forgetTool: BridgeTool | null =
      !big && deps.desk
        ? {
            name: 'forget',
            description:
              'Forget on purpose: leave a note on your desk (where you are, what you are doing, the next step) and continue this same task with a fresh memory, starting from the note. Commit finished work first.',
            inputSchema: {
              type: 'object',
              properties: {
                where: { type: 'string', description: 'Where you are: what is done, which files.' },
                doing: { type: 'string', description: 'What you are doing right now and why.' },
                next: { type: 'string', description: 'The very next step to take.' },
                notes: {
                  type: 'string',
                  description: 'Anything else you must not lose (decisions, gotchas).',
                },
              },
              required: ['where', 'doing', 'next'],
            },
            run: async (a) => forget(runId, a),
          }
        : null;
    const studioTools = [
      ...tracked(
        [
          ...(!big && studioToolsFor ? studioToolsFor({ projectId, agentId: agent.id, runId }) : []),
          ...(forgetTool ? [forgetTool] : []),
        ],
        { projectId, agentId: agent.id, runId },
        emit,
      ),
      ...(big?.tools ?? []),
    ];
    const bridge = studioTools.length && deps.bridges ? deps.bridges.open(studioTools) : null;
    const l: Live = {
      run,
      cwd,
      big: !!big,
      token,
      secrets,
      files,
      handle: { done: Promise.resolve({} as RunOutcome), cancel: () => {} },
      forgets: 0,
      limits: { sessions: 0, stalls: 0 },
      mark: '',
      firstMark: '',
      reports: 0,
      workSteps: 0,
      before: NOTHING_SPENT,
      context: 0,
      nudged: false,
      notes: [],
      turns: 0,
      wrapped: false,
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

    /* an agent with its own toolset gets exactly those tools; null = the full studio kit */
    const perms = !big && agent.tools ? runPermissions(agent.tools, deps.shell ?? AGENT_SHELL.dev) : null;
    /* native Mac builds: the shell hook approves them (dev shell, full shell only); the brief says how */
    const macBuilds =
      !big &&
      (perms ? perms.fullShell : true) &&
      macToolsFor(deps.shell ?? AGENT_SHELL.dev).length > 0 &&
      isMacProject(cwd);
    const envWith = (values: Record<string, string>) =>
      runEnv(deps.parentEnv ?? process.env, values, {
        ...deps.gitEnv,
        /* the shell hook checks Mac build paths against this folder */
        AI_STUDIO_PROJECT_DIR: cwd,
        ...(ports
          ? {
              PORT: String(ports.port),
              AI_STUDIO_PORTS: ports.block.spares.join(','),
              AI_STUDIO_APP_PORT: String(ports.block.app),
            }
          : {}),
        /* STUDIO LIFE: the nudge hook asks here after each tool (forget reminders, notes while it runs) */
        ...(!big && baseUrl
          ? { AI_STUDIO_NUDGE_URL: `${baseUrl}/internal/runs/${runId}/nudge`, AI_STUDIO_RUN_TOKEN: token }
          : {}),
      });
    const promptNow = () =>
      big?.systemPrompt ??
      composePrompt({
        agent,
        kin: store.agents.kinOf(agent.id).map((k) => k.name),
        team,
        project: { name: project.name },
        toolkit,
        ...(perms
          ? { shell: perms.shell, edit: perms.edit, settingsPrefix: perms.fullShell }
          : deps.shell
            ? { shell: deps.shell }
            : {}),
        ...(macBuilds ? { macBuilds: true } : {}),
        ...(deps.accessFor ? { access: deps.accessFor(projectId) } : {}),
        ...(ports ? { ports: { port: ports.port, app: ports.block.app, spares: ports.block.spares } } : {}),
        room: bridge && studioToolsFor ? WORKING_WITH_OTHERS : null,
        memory: forgetTool ? YOUR_MEMORY : null,
        principles,
      });
    /* the toolkit + the granted folders, read again for each fresh session (a folder shared mid-run included) */
    const addDirsNow = (): Pick<RunSpec, 'addDirs'> => {
      const dirs = [...(toolkit ? [toolkit.dir] : []), ...(big ? [] : (deps.foldersFor?.(projectId) ?? []))];
      return dirs.length ? { addDirs: dirs } : {};
    };
    const spec: RunSpec = {
      runId,
      cwd,
      systemPrompt: promptNow(),
      task: req.task,
      model: deps.model,
      caps,
      env: envWith(granted),
      secretValues: secrets,
      ...(big ? { tools: [] } : {}),
      ...(perms ? { tools: perms.tools, allowedTools: perms.allowedTools, fullShell: perms.fullShell } : {}),
      ...addDirsNow(),
      ...(reporter || perms?.web ? { web: true } : {}),
      ...(resumeSessionId ? { resumeSessionId } : {}),
      ...(bridge
        ? { studioTools: { names: bridge.names, ...(bridge.remote ? { remote: bridge.remote } : {}) } }
        : {}),
      ...(baseUrl && !big
        ? {
            askBridge: {
              url: `${baseUrl}/internal/runs/${runId}/asks`,
              token,
              ...(files ? { reportUrl: `${baseUrl}/internal/runs/${runId}/reports` } : {}),
            },
          }
        : {}),
    };
    const io: RunIO = {
      emit: (e) => onRunEvent(l, e),
      ask: async (question, options) => {
        const a = await waitUntilAnswered(openAsk(runId, question, options).id);
        if (a.status !== 'answered') throw new Error('cancelled');
        return a.answer as string;
      },
      ...(files ? { report: async (input: unknown) => fileReport(runId, input) } : {}),
      ...(bridge ? { tool: bridge.call } : {}),
    };
    const release = () => {
      deps.ports?.release(runId);
      bridge?.close();
    };
    const headOf = deps.progressMark ?? gitHead;
    /** What "new work" is measured against: a new commit or a filed report (a desk note resets in nextSession). */
    const markNow = () => `${headOf(cwd) ?? ''}#${l.reports}`;
    /** markNow plus the uncommitted files: a different one at the end = the run changed something. Only task
        work (builds, research) is judged by it, so other runs skip the git calls. */
    const workMark = () => (carriesOn(run.kind) && !big ? `${markNow()}#${gitChanges(cwd) ?? ''}` : '');
    /* a build or report cut off at a limit carries on by itself — the user never has to notice (runtime/limits.ts) */
    const carries = !big && carriesOn(run.kind);
    /** After a session ended: start the same run again (a forget, or a limit with progress) — or end it. */
    const nextSession = (o: RunOutcome): { next: NextSession | null; o: RunOutcome } => {
      const note = l.forgetting;
      l.forgetting = undefined;
      if (l.cancelled || l.closing) return { next: null, o };
      if (note) {
        l.limits = afterNote(l.limits);
        return {
          next: { brief: deskBrief(note, req.task), kind: 'forget', label: 'Fresh start from my note' },
          o,
        };
      }
      if (!carries || o.status !== 'failed' || !isLimit(o.error)) return { next: null, o };
      const verdict = afterLimit(l.limits, markNow() !== l.mark, caps.maxTurns);
      if (!verdict.carryOn) return { next: null, o: { ...o, error: verdict.error } };
      l.limits = verdict.state;
      return {
        next: {
          brief: limitBrief(
            req.task,
            caps.maxTurns,
            l.note ?? null,
            run.kind === 'research' ? 'research' : 'building',
          ),
          kind: 'limit',
          label: 'Carrying on in a fresh session',
          line: `Reached the step limit (${caps.maxTurns}). Carrying on in a fresh session (${verdict.state.sessions}).`,
        },
        o,
      };
    };
    /** One session's handle; the run goes on through fresh sessions until nextSession says it is over. */
    const watch = (h: RunHandle) => {
      l.handle = h;
      h.done
        .catch((err: Error): RunOutcome => ({ ...NOTHING_SPENT, status: 'failed', error: err.message }))
        .then((ended) => {
          let { next, o } = nextSession(ended);
          if (next) {
            l.before = addSpent(l.before, o);
            l.context = 0;
            l.nudged = false;
            l.turns = 0;
            l.wrapped = false;
            emit(projectId, {
              type: 'agent.status',
              payload: {
                agentId: agent.id,
                runId,
                status: 'working',
                activity: { kind: 'starting', label: next.label },
              },
            });
            try {
              const { resumeSessionId: _old, addDirs: _dirs, ...fresh } = spec;
              record(run, secrets, 'system', next.line ?? next.brief, { kind: next.kind });
              l.mark = markNow();
              /* LIVE ACCESS: a fresh session gets what is granted now — access shared mid-run included */
              const now = big ? {} : deps.envFor(projectId);
              scrubAlso(l, now);
              watch(
                runner.start(
                  {
                    ...fresh,
                    ...addDirsNow(),
                    systemPrompt: promptNow(),
                    env: envWith(now),
                    task: next.brief,
                    sessionId: randomUUID(),
                  },
                  io,
                ),
              );
              return;
            } catch (e) {
              o = { ...NOTHING_SPENT, status: 'failed', error: (e as Error).message };
            }
          }
          release();
          finish(
            l,
            { ...o, ...addSpent(l.before, o) },
            { steps: l.workSteps, changed: workMark() !== l.firstMark, reportFiled: l.reports > 0 },
          );
        });
    };
    l.untrack = deps.running?.add({
      kind: 'session',
      projectId,
      agentId: agent.id,
      label: req.task,
      runId,
      pid: () => l.handle.pid,
      cancel: () => stopLive(l),
    }).end;
    l.mark = markNow(); // before the session starts: its own commits are its progress
    l.firstMark = workMark();
    /* a resumed session takes over the question its earlier run left open (or answered while nothing ran) */
    const adopted = prev ? repo.adoptAsks(prev.id, runId, prev.endedAt) : [];
    const waiting = adopted.find((a) => a.status === 'open');
    const answered = adopted.filter((a) => a.status === 'answered');
    const briefed = (more: Ask[] = []) => ({
      ...spec,
      task: answeredBrief(req.task, [...answered, ...more]),
    });
    watch(
      waiting
        ? parkedHandle(waitFor(l, waiting), (a) => runner.start(briefed([a]), io))
        : startHandle(briefed(), io),
    );
    return run;
  }
  /** A resumed run whose question is still open: it shows the question again and waits (no timer, so a closing
      studio leaves nothing behind); the answer resolves it, a withdrawn question resolves it as such. */
  function waitFor(l: Live, ask: Ask): Promise<Ask> {
    const { run, secrets } = l;
    record(run, secrets, 'assistant', ask.question, {
      kind: 'ask',
      askId: ask.id,
      ...(ask.options ? { options: ask.options } : {}),
    });
    emit(
      run.projectId,
      {
        type: 'ask.opened',
        payload: {
          askId: ask.id,
          agentId: ask.agentId,
          runId: run.id,
          kind: 'question',
          question: ask.question,
          ...(ask.options ? { options: ask.options } : {}),
        },
      },
      secrets,
    );
    emit(run.projectId, {
      type: 'agent.status',
      payload: {
        agentId: run.agentId,
        runId: run.id,
        status: 'waiting',
        activity: { kind: 'asking', label: 'Waiting for your answer' },
      },
    });
    return new Promise((resolve) => {
      const set = waiters.get(ask.id) ?? new Set<Waiter>();
      set.add(resolve);
      waiters.set(ask.id, set);
    });
  }
  /** A runner that throws on start still ends as a failed run (recorded, untracked) — never a ghost "running". */
  function startHandle(spec: RunSpec, io: RunIO): RunHandle {
    try {
      return runner.start(spec, io);
    } catch (e) {
      return { done: Promise.reject(e), cancel: () => {} };
    }
  }
  function stopLive(l: Live) {
    l.cancelled = true;
    l.handle.cancel();
  }
  /** `forget` from a live run: save the desk note, then stop this process — the run starts again from the note. */
  function forget(runId: string, input: unknown): Promise<string> {
    const l = live.get(runId);
    if (!l || !deps.desk) throw conflict('That run is not running');
    const parsed = DeskNoteSchema.safeParse(input);
    if (!parsed.success)
      throw new Error(
        `The note needs where, doing and next: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      );
    if (l.forgets >= MAX_FORGETS)
      throw new Error(`You already forgot ${MAX_FORGETS} times on this task — carry on and finish it.`);
    deps.desk.save(l.run.projectId, l.run.agentId, runId, parsed.data, l.secrets);
    l.forgets++;
    l.forgetting = parsed.data;
    l.note = parsed.data;
    const h = l.handle;
    setTimeout(() => h.cancel(), 50).unref?.(); // let the tool answer first
    return Promise.resolve('Your note is on your desk. Your memory clears now — you continue from the note.');
  }
  /** The nudge hook asks after each tool: notes left for the run since the last tool, plus — once per memory
      each — near the step limit "commit and wrap up", past the context threshold "write your note and forget". */
  function nudge(runId: string): string | null {
    const l = live.get(runId);
    if (!l) return null;
    const text = [...l.notes.splice(0).map((n) => n.text), ...memoryNudge(l)].join('\n\n');
    return text || null;
  }
  /** The wrap-up or forget nudge due now (at most one), for runs that can leave a desk note. */
  function memoryNudge(l: Live): string[] {
    if (!deps.desk || l.forgetting) return [];
    if (!l.wrapped && l.turns >= l.run.caps.maxTurns - WRAP_UP_STEPS) {
      l.wrapped = true;
      return [wrapUpNudge(l.run.kind)];
    }
    if (l.nudged || l.context < (deps.forgetAt ?? FORGET_AT)) return [];
    l.nudged = true;
    return [FORGET_NUDGE];
  }
  /** A note for an agent's live run on this project, delivered after its next tool step (and kept in its chat).
      → the run it went to, or null when the agent isn't running here. */
  function tell(projectId: string, agentId: string, from: string, text: string): Run | null {
    const l = [...live.values()].find(
      (x) => x.run.projectId === projectId && x.run.agentId === agentId && !x.cancelled,
    );
    const said = text.trim();
    if (!l || !said) return null;
    const note = `AI Studio — a note from ${from} while you work: ${clip(said, 4000)}\nTake it into account from your next step; don't start over.`;
    leaveNote(l, from, note);
    record(l.run, l.secrets, 'user', said, { kind: 'note', from });
    return l.run;
  }
  /** LIVE ACCESS: an access was just shared with this project. Every agent working here gets it in the .env of
      its working folder and a note saying it can use it now — or, when that can't be written, a note to restart
      (forget), which starts a fresh session with it in the environment. → who was told what. */
  function accessShared(
    projectId: string,
    accessId: string,
  ): { runId: string; agentId: string; how: Pickup }[] {
    const shared = deps.liveAccess;
    const working = [...live.values()].filter((l) => l.run.projectId === projectId && !l.big && !l.cancelled);
    const access = shared && working.length ? shared.about(accessId) : null;
    if (!shared || !access) return [];
    const granted = deps.envFor(projectId);
    return working.map((l) => {
      scrubAlso(l, granted);
      /* a folder joins a session only when it starts (--add-dir) */
      const how: Pickup = access.folder ? 'restart' : pickup(l, shared.writeInto);
      const note = accessNotice(access, how, !!deps.desk);
      leaveNote(l, 'AI Studio', note);
      record(l.run, l.secrets, 'system', note, { kind: 'access', accessId, pickup: how });
      return { runId: l.run.id, agentId: l.run.agentId, how };
    });
  }
  function leaveNote(l: Live, from: string, text: string) {
    const { id: runId, agentId } = l.run;
    l.notes.push({ runId, agentId, from, text, at: new Date().toISOString() });
  }
  function liveOf(projectId: string, agentId?: string): Live[] {
    store.projects.require(projectId);
    return [...live.values()].filter(
      (l) => l.run.projectId === projectId && (!agentId || l.run.agentId === agentId),
    );
  }
  /** Notes still waiting to reach this project's live runs (one agent's, or everyone's), oldest first. */
  function notesFor(projectId: string, agentId?: string): WaitingNote[] {
    return liveOf(projectId, agentId)
      .flatMap((l) => l.notes.map((n) => ({ ...n, text: redactSecrets(n.text, l.secrets).value })))
      .sort((a, b) => a.at.localeCompare(b.at));
  }
  /** Drop an agent's waiting notes before they reach it (a new brief or restart replaces them). → how many. */
  function clearNotes(projectId: string, agentId: string): number {
    return liveOf(projectId, agentId).reduce((n, l) => n + l.notes.splice(0).length, 0);
  }
  /** Write the granted values into the run's working folder's .env; 'restart' when that isn't possible. */
  function pickup(l: Live, writeInto: (projectId: string, dir: string) => void): Pickup {
    try {
      writeInto(l.run.projectId, l.cwd);
      return 'live';
    } catch (e) {
      console.error('[runtime] could not share an access live — the agent is told to restart', {
        projectId: l.run.projectId,
        runId: l.run.id,
        agentId: l.run.agentId,
        error: (e as Error).message,
      });
      return 'restart';
    }
  }
  /** Values granted after the run began are scrubbed from its chat, events and stream too. */
  function scrubAlso(l: Live, granted: Record<string, string>) {
    for (const v of Object.values(granted)) if (v && !l.secrets.includes(v)) l.secrets.push(v);
  }
  /** A toolsmith's toolkit: `<toolkitsRoot>/<agentId>/` (created 0700, inside the data dir — never anywhere else). */
  function toolkitFor(agent: { id: string; name: string; roleId: string | null }) {
    if (!deps.toolkitsRoot || !agent.roleId || !store.roles.get(agent.roleId)?.toolsmith) return null;
    const dir = join(deps.toolkitsRoot, agent.id.replace(/[^a-zA-Z0-9_-]/g, '_'));
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return { dir, projectDir: `tools/${slugify(agent.name, agent.id)}` };
  }
  /** file_report from a live agent run (the MCP side door and the FakeRunner both land here). */
  function fileReport(runId: string, input: unknown): { id: string } {
    const l = live.get(runId);
    if (!l) throw conflict('That run is not running');
    if (!l.files || !deps.reports) throw conflict('This run does not file reports');
    const { id } = deps.reports.file(l.run, input, l.secrets);
    l.reports++;
    return { id };
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
    tell,
    accessShared,
    notesFor,
    clearNotes,
    list(projectId: string) {
      store.projects.require(projectId);
      return repo.list(projectId);
    },
    get: requireRun,
    /** The run answered and waits for its background commands to end (the board says so). */
    waitingOn: (runId: string): boolean => !!live.get(runId)?.waiting,
    cancel(projectId: string, runId: string): Run {
      const r = requireRun(projectId, runId);
      const l = live.get(runId);
      if (!l) throw conflict(`Run is already ${r.status}`);
      stopLive(l);
      return r;
    },
    /** Resolves once the run has ended and been recorded (tests, shutdown). */
    settled: async (runId: string) => {
      /* a forget restarts the run under a new handle: wait until it is really over */
      for (let l = live.get(runId); l; l = live.get(runId)) {
        await l.handle.done.catch(() => undefined);
        await new Promise((r) => setImmediate(r));
      }
      await new Promise((r) => setImmediate(r));
      return repo.get(runId) as Run;
    },
    asks(projectId: string, status?: Ask['status']) {
      store.projects.require(projectId);
      return repo.asks(projectId, status);
    },
    /** Nothing will carry this ended run on: its parked questions leave the screen (chat + pager). */
    withdrawAsks: withdraw,
    /** Boot: `fn` names the ended runs whose session work will resume; every other parked question is
        withdrawn now (an answer to it would reach nobody). → how many runs lost theirs. */
    adoptCarriers(fn: (runId: string) => boolean): number {
      carriedOn = fn;
      const stranded = new Set(
        repo
          .studioAsks('open', false)
          .map((a) => a.runId)
          .filter((runId) => !reaches(runId)),
      );
      for (const runId of stranded) withdraw(runId);
      return stranded.size;
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
      if (!reaches(a.runId)) {
        /* its run ended and nothing carries it on: storing the answer would lose it silently */
        withdraw(a.runId);
        throw conflict(
          'Nobody is waiting for this answer any more — the work that asked has ended. Tell the agent in chat instead.',
        );
      }
      repo.answerAsk(askId, answer);
      const done = repo.ask(askId) as Ask;
      const l = live.get(a.runId);
      if (l) record(l.run, l.secrets, 'user', answer, { kind: 'answer', askId, by: 'user' });
      emit(projectId, { type: 'ask.answered', payload: { askId, answer: clip(answer, 2000) } }, l?.secrets);
      settle(done);
      for (const fn of answeredListeners) {
        try {
          fn(done);
        } catch (e) {
          /* a listener never breaks the answer, but its failure is never silent */
          console.error('[runtime] onAnswered listener failed', {
            projectId,
            askId,
            error: e instanceof Error ? (e.stack ?? e.message) : String(e),
          });
        }
      }
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
      nudge,
      waitAsk(runId: string, askId: string, timeoutMs: number) {
        const a = repo.ask(askId);
        if (!a || a.runId !== runId) return Promise.reject(notFound('Ask', askId));
        return waitAsk(askId, timeoutMs);
      },
    },
    /** Called once per run after it ended and was recorded (dispatch marks checklist items). */
    onFinished(fn: (run: Run, work: WorkEvidence) => void): () => void {
      finishedListeners.add(fn);
      return () => finishedListeners.delete(fn);
    },
    /** Called once per ask the user answered (never for the studio's own auto answers): the office thread
        keeps the question and the answer together. */
    onAnswered(fn: (ask: Ask) => void): () => void {
      answeredListeners.add(fn);
      return () => answeredListeners.delete(fn);
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
      for (const l of all) {
        l.closing = true; // not the user's stop: the restart picks the work up again
        stopLive(l);
      }
      await Promise.allSettled(all.map((l) => l.handle.done));
      /* open questions stay open for the next boot: nobody waits on them in this process any more */
      for (const t of timers) clearTimeout(t);
      timers.clear();
      waiters.clear();
      await new Promise((r) => setImmediate(r));
    },
    liveCount: () => live.size,
    /** Is this agent on a live run in this project? (one at a time) */
    busy: (projectId: string, agentId: string) => !!repo.live(projectId, agentId),
  };
}
export type Runtime = ReturnType<typeof createRuntime>;
