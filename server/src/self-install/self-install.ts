/* Self-install: every merge into AI Studio's own project rebuilds the Mac app and replaces the installed copy,
   so the app opened from Spotlight is always the newest build. The work is app/scripts/install-mac/main.mjs;
   this module only decides when to run it.

   - Only merges into the project whose folder IS the checkout this server runs from (realpath match).
   - On start, if the installed app is behind this checkout's HEAD (per the installer's marker file), install
     right away: merges that landed while no backend with this trigger was running are caught up, not lost.
   - One install at a time; merges that land meanwhile ask for one more run afterwards (never a queue of builds).
   - The installer runs detached in its own process group: quitting the app (which stops this server) never
     kills a build halfway. Its output goes to <data dir>/logs/self-install.log. */
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Store } from '../db/store.ts';
import type { EventBus } from '../events/bus.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';

/** Runs one install; resolves with its exit code. */
export type Installer = () => Promise<number | null>;
/** The installer's marker: which commit is in /Applications, and when it was installed. */
export type InstalledBuild = { commit: string; at?: string; target?: string };
/** The latest install this backend ran (null: none since it started). */
export type InstallStatus = { state: 'installing' | 'installed' | 'failed'; at: string; error?: string };
/** What /health says about builds, so the window (and anyone without access to the Mac) can tell if it is stale. */
export type BuildReport = {
  running: string;
  installed: InstalledBuild | null;
  install: InstallStatus | null;
};
type Log = {
  info: (ctx: object, msg: string) => void;
  error: (ctx: object, msg: string) => void;
};

export function createSelfInstall(deps: {
  bus: EventBus;
  isStudio: (projectId: string) => boolean;
  /** Is the installed app older than this checkout? Checked once, on start. */
  isBehind: () => boolean;
  install: Installer;
  log: Log;
}) {
  let running = false;
  let again = false;
  let last: InstallStatus | null = null;
  const mark = (state: InstallStatus['state'], error?: string) => {
    last = { state, at: new Date().toISOString(), ...(error ? { error } : {}) };
  };

  async function runOnce() {
    mark('installing');
    try {
      const code = await deps.install();
      if (code === 0) {
        mark('installed');
        deps.log.info({ module: 'self-install' }, 'Installed the newest AI Studio build');
      } else {
        mark('failed', `the installer exited with ${code}`);
        deps.log.error(
          { module: 'self-install', code },
          'AI Studio install failed — see logs/self-install.log',
        );
      }
    } catch (e) {
      const err = (e as Error).message;
      mark('failed', err);
      deps.log.error({ module: 'self-install', err }, 'Could not start the AI Studio install');
    }
  }

  /** Install now, or once more right after the install in progress. Resolves when nothing is left to do. */
  async function kick(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    running = true;
    do {
      again = false;
      await runOnce();
    } while (again);
    running = false;
  }

  const stop = deps.bus.subscribeAll((e) => {
    if (e.scope === 'project' && e.type === 'item.merged' && deps.isStudio(e.scopeId)) void kick();
  });
  try {
    if (deps.isBehind()) {
      deps.log.info({ module: 'self-install' }, 'The installed AI Studio is behind this checkout; installing');
      void kick();
    }
  } catch (e) {
    const err = (e as Error).message;
    deps.log.error({ module: 'self-install', err }, 'Could not tell whether the installed AI Studio is current');
  }
  return { kick, stop, status: (): InstallStatus | null => last };
}

/** The installer's marker in the data dir (the installer writes it under $AI_STUDIO_HOME, set by spawnInstaller). */
export const markerFile = (studioHome: string) => join(studioHome, 'installed-build.json');

/** The installed app is behind when the installer's marker (`{commit, target}`, written by app/scripts/install-mac
    after a good install) is missing, unreadable, names another commit than `head()`, or its app is gone. */
export function installedBehind(markerFile: string, head: () => string): () => boolean {
  /* no marker = never installed by the installer (or a torn one): install to be sure */
  return () => {
    const m = readMarker(markerFile);
    if (m?.commit !== head()) return true;
    return Boolean(m.target && !existsSync(m.target)); // trashed after the install: the marker alone lies
  };
}

/** The installer's marker, or null when it is missing or torn. */
export function readMarker(markerFile: string): InstalledBuild | null {
  try {
    const m = JSON.parse(readFileSync(markerFile, 'utf8'));
    if (typeof m?.commit !== 'string') return null;
    const str = (k: 'at' | 'target') => (typeof m[k] === 'string' ? { [k]: m[k] as string } : {});
    return { commit: m.commit, ...str('at'), ...str('target') };
  } catch {
    return null;
  }
}

/** A main checkout has a `.git` folder; a worktree has a `.git` file (and is deleted after its merge). */
export function isMainCheckout(repo: string): boolean {
  try {
    return statSync(join(repo, '.git')).isDirectory();
  } catch {
    return false; // not a git checkout at all
  }
}

/** The commit checked out in `repo`. */
export const headCommit = (repo: string) => () =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

/** The commit checked out right now, or 'unknown' (a report line must never stop the backend from starting). */
export function runningCommit(repo: string): string {
  try {
    return headCommit(repo)();
  } catch {
    return 'unknown';
  }
}

/** Is this project AI Studio itself, i.e. its folder is the checkout `repo`? */
export function studioProject(store: Store, sandbox: string, repo: string) {
  const real = realpathSync(repo);
  return (projectId: string): boolean => {
    const folder = store.projects.get(projectId)?.folder;
    if (!folder) return false;
    try {
      return resolveInSandbox(sandbox, folder) === real;
    } catch {
      return false; // a folder outside the sandbox can't be this checkout
    }
  };
}

/** The real installer: `node app/scripts/install-mac/main.mjs` in `repo`, detached, appending to
    <studioHome>/logs/self-install.log and writing its marker into `studioHome`. */
export function spawnInstaller(repo: string, studioHome: string): Installer {
  const logFile = join(studioHome, 'logs', 'self-install.log');
  return () =>
    new Promise((resolve, reject) => {
      mkdirSync(dirname(logFile), { recursive: true });
      const out = openSync(logFile, 'a');
      const child = spawn(process.execPath, [join(repo, 'app', 'scripts', 'install-mac', 'main.mjs')], {
        cwd: repo,
        env: { ...process.env, AI_STUDIO_HOME: studioHome },
        detached: true,
        stdio: ['ignore', out, out],
      });
      closeSync(out);
      child.unref();
      child.once('error', reject);
      child.once('exit', (code) => resolve(code));
    });
}
