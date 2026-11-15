/* Self-install: every merge into AI Studio's own project rebuilds the Mac app and replaces the installed copy,
   so the app opened from Spotlight is always the newest build. The work is app/scripts/install-mac/main.mjs;
   this module only decides when to run it.

   - Only merges into the project whose folder IS the checkout this server runs from (realpath match).
   - One install at a time; merges that land meanwhile ask for one more run afterwards (never a queue of builds).
   - The installer runs detached in its own process group: quitting the app (which stops this server) never
     kills a build halfway. Its output goes to <data dir>/logs/self-install.log. */
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Store } from '../db/store.ts';
import type { EventBus } from '../events/bus.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';

/** Runs one install; resolves with its exit code. */
export type Installer = () => Promise<number | null>;
type Log = {
  info: (ctx: object, msg: string) => void;
  error: (ctx: object, msg: string) => void;
};

export function createSelfInstall(deps: {
  bus: EventBus;
  isStudio: (projectId: string) => boolean;
  install: Installer;
  log: Log;
}) {
  let running = false;
  let again = false;

  async function runOnce() {
    try {
      const code = await deps.install();
      if (code === 0) deps.log.info({ module: 'self-install' }, 'Installed the newest AI Studio build');
      else
        deps.log.error({ module: 'self-install', code }, 'AI Studio install failed — see logs/self-install.log');
    } catch (e) {
      const err = (e as Error).message;
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
  return { kick, stop };
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

/** The real installer: `node app/scripts/install-mac/main.mjs` in `repo`, detached, appending to `logFile`. */
export function spawnInstaller(repo: string, logFile: string): Installer {
  return () =>
    new Promise((resolve, reject) => {
      mkdirSync(dirname(logFile), { recursive: true });
      const out = openSync(logFile, 'a');
      const child = spawn(process.execPath, [join(repo, 'app', 'scripts', 'install-mac', 'main.mjs')], {
        cwd: repo,
        detached: true,
        stdio: ['ignore', out, out],
      });
      closeSync(out);
      child.unref();
      child.once('error', reject);
      child.once('exit', (code) => resolve(code));
    });
}
