/* Ready to Test: start any project with one call — the Start button's server side.
   - A desktop app (Tauri / native Mac): open its newest build (built-app.ts). Nothing built yet → 409.
   - A website: start it through the app runner (or reuse the running one) and answer once it is reachable, at
     http://localhost:<PORT>/ — never 127.0.0.1, so passkey and OAuth sign-in work. An app that ignores PORT is
     found at the address it printed. It stopping before it answers → 409 with its last lines. */
import { execFile } from 'node:child_process';
import { conflict } from '../errors.ts';
import { type AppRunner, toLocalhost } from './app-runner.ts';
import { isDesktopProject, newestBuiltApp } from './built-app.ts';

export type StartResult = { kind: 'desktop'; app: string } | { kind: 'website'; url: string };

const READY_TIMEOUT_MS = 90_000;
const POLL_MS = 250;
const LAST_LINES = 8;

/** macOS `open`: launches the app (or brings the running copy forward). */
export const openWithMac = (app: string): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile('open', [app], (err, _out, stderr) =>
      err ? reject(new Error(String(stderr).trim() || err.message)) : resolve(),
    );
  });

const portOf = (url: string | null): number | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
  } catch {
    return null;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createProjectStarter(deps: {
  apps: AppRunner;
  cargoTarget: string;
  /** Is something accepting connections on this local port? (ports.ts `listening`) */
  listening: (port: number) => Promise<boolean>;
  /** Launches a built app (openWithMac in the studio, a stub in tests). */
  openApp: (app: string) => Promise<void>;
  readyTimeoutMs?: number;
}) {
  const { apps, openApp } = deps;
  const timeoutMs = deps.readyTimeoutMs ?? READY_TIMEOUT_MS;

  async function startDesktop(dir: string): Promise<StartResult> {
    const app = newestBuiltApp(dir, deps.cargoTarget);
    if (!app)
      throw conflict('This app has not been built yet — ask the team to build it, then press Start again');
    try {
      await openApp(app);
    } catch (e) {
      throw conflict(`Couldn't open ${app}: ${(e as Error).message}`);
    }
    return { kind: 'desktop', app };
  }

  /** The address that answers: its PORT first, else the one it printed (an app that ignores PORT). */
  async function reachable(projectId: string): Promise<string | null> {
    const v = apps.view(projectId);
    if (v.port && (await deps.listening(v.port))) return `http://localhost:${v.port}/`;
    const printed = portOf(v.url);
    if (v.url && printed && printed !== v.port && (await deps.listening(printed))) return toLocalhost(v.url);
    return null;
  }

  async function startWebsite(projectId: string): Promise<StartResult> {
    if (apps.view(projectId).status !== 'running') apps.start(projectId);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const url = await reachable(projectId);
      if (url) return { kind: 'website', url };
      const v = apps.view(projectId);
      if (v.status !== 'running') {
        const code = v.exitCode === null ? '' : ` (exit code ${v.exitCode})`;
        throw conflict(`The app stopped before it was ready${code}`, { log: v.log.slice(-LAST_LINES) });
      }
      if (Date.now() > deadline)
        throw conflict(
          `The app is running but nothing answers on port ${v.port} yet — it may still be building; press Start again`,
          { log: v.log.slice(-LAST_LINES) },
        );
      await sleep(POLL_MS);
    }
  }

  return {
    async start(projectId: string): Promise<StartResult> {
      const dir = apps.folderOf(projectId);
      return isDesktopProject(dir) ? startDesktop(dir) : startWebsite(projectId);
    },
  };
}
export type ProjectStarter = ReturnType<typeof createProjectStarter>;
