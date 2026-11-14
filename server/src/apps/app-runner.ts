/* Run the app (F1c): start a project's own app (its dev server) on the user's Mac, inside the project folder.
   - The command: `.project`'s `run:` line, else package.json's dev/start script (src/apps/run-command.ts).
   - One process per project, in its own process group (stop = the whole group: npm + vite + …); every app is
     stopped when the server shuts down.
   - The env is the minimal run env (PATH, HOME…) — never the server's own env; the app reads its project .env itself.
   - Output: the last lines, ANSI stripped, every known secret value masked; the first local URL it prints is the app's address.
   - PORT (F3): each project gets its own stable port in the env — two apps that both default to 3000 otherwise "both run"
     (one on 127.0.0.1, one on ::1) and the browser shows whichever `localhost` resolves to. Apps are told to honour PORT. */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Store } from '../db/store.ts';
import { conflict, invalid } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import { runEnv } from '../runtime/env.ts';
import { runCommandOf, writeRunLine } from './run-command.ts';

export const LOG_LINES = 200;
/** Project app ports: 3100–3999, stable per project id (clear of 3000 and the studio's own 4xxx ports). */
const PORT_BASE = 3100;
const PORT_SPAN = 900;

/** Pure: a project's preferred app port — stable for its id, the next free one when another running app holds it. */
export function portFor(projectId: string, taken: ReadonlySet<number>): number {
  let h = 0;
  for (const c of projectId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = 0; i < PORT_SPAN; i++) {
    const port = PORT_BASE + ((h + i) % PORT_SPAN);
    if (!taken.has(port)) return port;
  }
  return PORT_BASE;
}
const STOP_GRACE_MS = 3000;

export type AppStatus = 'stopped' | 'running' | 'exited';
export type AppView = {
  status: AppStatus;
  /** How it starts (null = nobody recorded it yet) and where that came from. */
  command: string | null;
  source: '.project' | 'package.json' | null;
  /** The first local address it printed (http://localhost:5173/…), null until then. */
  url: string | null;
  pid: number | null;
  startedAt: string | null;
  exitCode: number | null;
  /** The last output lines (secrets masked). */
  log: string[];
  /** The PORT the studio gave it (null when not running). */
  port: number | null;
};
type Live = {
  child: ChildProcess;
  port: number;
  command: string;
  url: string | null;
  startedAt: string;
  log: string[];
  status: AppStatus;
  exitCode: number | null;
  stopping: boolean;
  exited: Promise<void>;
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control characters
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d+)?(?:\/[^\s'"`)]*)?/;

/** Pure: mask every secret value in a line. */
export function maskLine(line: string, secrets: readonly string[]): string {
  let out = line;
  for (const v of secrets) if (v.length >= 4) out = out.split(v).join('••••');
  return out;
}
/** Pure: the local address a dev server printed, normalised to localhost. */
export function urlIn(line: string): string | null {
  const m = LOCAL_URL.exec(line.replace(ANSI, ''));
  return m ? m[0].replace('0.0.0.0', 'localhost').replace(/[.,;:]+$/, '') : null;
}

export function createAppRunner(deps: {
  store: Store;
  events: EventLog;
  sandbox: string;
  /** Every secret value the studio knows (masked in the log). */
  secretValues: () => string[];
  parentEnv?: NodeJS.ProcessEnv;
}) {
  const { store, events } = deps;
  const live = new Map<string, Live>();
  /** The last run of each project after it ended (status/log stay readable). */
  const ended = new Map<string, Live>();

  const folderOf = (projectId: string) => {
    const p = store.projects.require(projectId);
    if (!p.folder) throw conflict(`Project '${projectId}' has no folder yet — set it up first`);
    const dir = resolveInSandbox(deps.sandbox, p.folder);
    if (!existsSync(dir)) throw conflict(`Project folder '${p.folder}' is missing on disk`);
    return dir;
  };
  const emit = (
    projectId: string,
    payload: { status: AppStatus; url?: string; exitCode?: number | null },
  ) => {
    try {
      events.append('project', projectId, { type: 'app.status', payload });
    } catch {
      /* never break the app on a progress line */
    }
  };

  function view(projectId: string): AppView {
    const dir = folderOf(projectId);
    const run = runCommandOf(dir);
    const l = live.get(projectId) ?? ended.get(projectId);
    return {
      status: l?.status ?? 'stopped',
      command: l && l.status === 'running' ? l.command : (run?.command ?? null),
      source: run?.source ?? null,
      url: l?.status === 'running' ? l.url : null,
      pid: l?.status === 'running' ? (l.child.pid ?? null) : null,
      startedAt: l?.startedAt ?? null,
      exitCode: l?.exitCode ?? null,
      log: l ? [...l.log] : [],
      port: l?.status === 'running' ? l.port : null,
    };
  }

  function start(projectId: string): AppView {
    const dir = folderOf(projectId);
    if (live.has(projectId)) throw conflict('The app is already running');
    const run = runCommandOf(dir);
    if (!run)
      throw conflict(
        'Nobody has recorded how to start this app yet — add a `run:` line to .project (or ask the team to)',
      );
    const port = portFor(projectId, new Set([...live.values()].map((x) => x.port)));
    const child = spawn('/bin/sh', ['-c', run.command], {
      cwd: dir,
      detached: true, // its own process group: stop takes npm and the server it started
      stdio: ['ignore', 'pipe', 'pipe'],
      env: runEnv(
        deps.parentEnv ?? process.env,
        {},
        { BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1', PORT: String(port) },
      ),
    });
    let resolveExit = () => {};
    const l: Live = {
      child,
      port,
      command: run.command,
      url: null,
      startedAt: new Date().toISOString(),
      log: [],
      status: 'running',
      exitCode: null,
      stopping: false,
      exited: new Promise<void>((r) => {
        resolveExit = r;
      }),
    };
    live.set(projectId, l);
    ended.delete(projectId);
    const onData = (buf: Buffer) => {
      const secrets = deps.secretValues();
      for (const raw of buf.toString('utf8').split(/\r?\n/)) {
        const line = maskLine(raw.replace(ANSI, '').trimEnd(), secrets);
        if (!line.trim()) continue;
        l.log.push(line.slice(0, 1000));
        if (l.log.length > LOG_LINES) l.log.shift();
        if (!l.url) {
          const url = urlIn(line);
          if (url) {
            l.url = url;
            emit(projectId, { status: 'running', url });
          }
        }
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    const done = (code: number | null) => {
      if (live.get(projectId) !== l) return;
      live.delete(projectId);
      l.status = l.stopping ? 'stopped' : 'exited';
      l.exitCode = code;
      ended.set(projectId, l);
      emit(projectId, { status: l.status, exitCode: code });
      resolveExit();
    };
    child.on('exit', (code) => done(code));
    child.on('error', (e) => {
      l.log.push(`Couldn't start: ${e.message}`);
      done(null);
    });
    emit(projectId, { status: 'running' });
    return view(projectId);
  }

  const killGroup = (l: Live, signal: NodeJS.Signals) => {
    try {
      if (l.child.pid) process.kill(-l.child.pid, signal);
    } catch {
      /* already gone */
    }
  };
  async function stopLive(l: Live) {
    l.stopping = true;
    killGroup(l, 'SIGTERM');
    const timer = setTimeout(() => killGroup(l, 'SIGKILL'), STOP_GRACE_MS);
    await l.exited;
    clearTimeout(timer);
  }

  return {
    view,
    start,
    async stop(projectId: string): Promise<AppView> {
      folderOf(projectId);
      const l = live.get(projectId);
      if (l) await stopLive(l);
      return view(projectId);
    },
    /** The user (or the UI) sets how the app starts: the `run:` line in .project. */
    setCommand(projectId: string, command: string): AppView {
      const dir = folderOf(projectId);
      const c = command.trim();
      if (!c || c.length > 300 || /[\r\n]/.test(c))
        throw invalid('The run command is one line, up to 300 characters');
      try {
        writeRunLine(dir, c);
      } catch (e) {
        throw conflict((e as Error).message);
      }
      return view(projectId);
    },
    /** Server shutdown: every app stops with it. */
    async stopAll() {
      await Promise.all([...live.values()].map(stopLive));
    },
    running: () => [...live.keys()],
  };
}
export type AppRunner = ReturnType<typeof createAppRunner>;
