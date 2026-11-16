/* RUNNING: the one list of everything going on right now, per agent and per project.
   - Sessions: every agent run (runtime) and crew call (orchestrator, helpers, reviews). Each source adds its
     entry when the process starts and ends it when the process has ended — whatever way it ended.
   - Apps: a project's own app (the dev server the user started).
   - Code runs: the live OS processes under a session (servers, tests, builds an agent started). Never stored:
     read from the process table at each look, so a crashed or finished command simply isn't there.
   In memory only: after a restart nothing is running, so nothing can be stale. Cancel goes through the
   source's own cancel (it records how the run ended); a code run is signalled directly. `stop` does that
   for everything matching a filter at once (one agent, or a whole project). */
import { randomUUID } from 'node:crypto';
import { notFound } from '../errors.ts';
import { redactSecrets } from '../events/redact.ts';
import { type Proc, readProcs, signal, stopTree, treeOf } from './processes.ts';

export type RunningKind = 'session' | 'app' | 'code';
export type RunningItem = {
  id: string;
  kind: RunningKind;
  /** null = studio-level work outside any project (e.g. a draft's setup chat). */
  projectId: string | null;
  /** null = nobody's (the project's app). */
  agentId: string | null;
  /** What it is: the task's first line, or the command (secrets masked). */
  label: string;
  startedAt: string;
  /** The studio run behind a session (runs table), when there is one. */
  runId?: string;
  pid?: number;
  /** A code run: the session it runs under. */
  sessionId?: string;
};
export type Tracked = {
  kind: 'session' | 'app';
  projectId: string | null;
  agentId: string | null;
  label: string;
  runId?: string;
  /** The process now behind it (it may change, e.g. after a forget). */
  pid?: () => number | undefined;
  cancel: () => void;
};
export type RunningFilter = { projectId?: string; agentId?: string };

type Entry = { item: RunningItem; source: Tracked };

const STOP_GRACE_MS = 3000;
const LABEL_MAX = 200;
const firstLine = (s: string) => {
  const line = s.trim().split('\n')[0] ?? '';
  return line.length > LABEL_MAX ? `${line.slice(0, LABEL_MAX - 1)}…` : line;
};

export function createRunning(
  deps: {
    procs?: () => Proc[];
    kill?: (pid: number, sig: NodeJS.Signals) => boolean;
    secretValues?: () => string[];
  } = {},
) {
  const procs = deps.procs ?? readProcs;
  const kill = deps.kill ?? signal;
  const entries = new Map<string, Entry>();
  const mask = (s: string) => redactSecrets(firstLine(s), deps.secretValues?.() ?? []).value;

  /** Start tracking; call `end` once it has ended (idempotent). */
  function add(t: Tracked): { id: string; end: () => void } {
    const id = randomUUID();
    entries.set(id, {
      source: t,
      item: {
        id,
        kind: t.kind,
        projectId: t.projectId,
        agentId: t.agentId,
        label: mask(t.label),
        startedAt: new Date().toISOString(),
        ...(t.runId ? { runId: t.runId } : {}),
      },
    });
    return { id, end: () => entries.delete(id) };
  }
  /** Track something whose end is a promise: ended however the promise settles. */
  function watch(t: Tracked, done: Promise<unknown>): string {
    const { id, end } = add(t);
    done.then(end, end);
    return id;
  }

  const matches = (i: Pick<RunningItem, 'projectId' | 'agentId'>, f: RunningFilter) =>
    (f.projectId === undefined || i.projectId === f.projectId) &&
    (f.agentId === undefined || i.agentId === f.agentId);

  const withPid = (e: Entry): RunningItem => {
    const pid = e.source.pid?.();
    return pid ? { ...e.item, pid } : e.item;
  };
  const codeRuns = (session: RunningItem, table: readonly Proc[], at: number): RunningItem[] =>
    session.kind !== 'session' || !session.pid
      ? []
      : treeOf(session.pid, table).map((p) => ({
          id: `code-${session.id}-${p.pid}`,
          kind: 'code',
          projectId: session.projectId,
          agentId: session.agentId,
          label: mask(p.command),
          startedAt: new Date(at - p.elapsedSec * 1000).toISOString(),
          pid: p.pid,
          sessionId: session.id,
        }));

  /** Everything running now that matches, oldest first; each session followed by its code runs. */
  function list(f: RunningFilter = {}): RunningItem[] {
    const own = [...entries.values()].filter((e) => matches(e.item, f)).map(withPid);
    const table = own.some((i) => i.pid && i.kind === 'session') ? procs() : [];
    const at = Date.now();
    return own
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .flatMap((i) => [i, ...codeRuns(i, table, at)]);
  }

  /** Stop one thing (scoped by the filter: an agent only reaches its own). Returns what was stopped. */
  function cancel(id: string, f: RunningFilter = {}): RunningItem {
    const e = entries.get(id);
    if (e && matches(e.item, f)) {
      e.source.cancel();
      return withPid(e);
    }
    const code = list(f).find((i) => i.id === id && i.kind === 'code');
    if (!code?.pid) throw notFound('Running item', id);
    stopTree(code.pid, STOP_GRACE_MS, { procs, kill });
    return code;
  }

  /** Stop every session and code run that matches, right now (apps are the user's own and stay up).
      One that refuses to stop is reported and the rest still stop. `spare` keeps one agent running (the
      director stopping everything from inside its own turn). Returns what was stopped. */
  function stop(f: RunningFilter & { spare?: string }): RunningItem[] {
    const hit = list(f).filter((i) => i.kind !== 'app' && (!f.spare || i.agentId !== f.spare));
    const stopped: RunningItem[] = [];
    for (const i of hit) {
      try {
        if (i.kind === 'code' && i.pid) stopTree(i.pid, STOP_GRACE_MS, { procs, kill });
        else entries.get(i.id)?.source.cancel();
        stopped.push(i);
      } catch (e) {
        console.error(
          `[running] stop: could not stop ${i.kind} ${i.id} (project ${i.projectId}, agent ${i.agentId}): ${(e as Error).message}`,
        );
      }
    }
    return stopped;
  }

  return { add, watch, list, cancel, stop, size: () => entries.size };
}
export type Running = ReturnType<typeof createRunning>;
