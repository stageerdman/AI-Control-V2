/* Entry point: config → dirs → lock → sweep leftovers → db → app → listen. */
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { buildApp } from './app.ts';
import { openWithMac } from './apps/start-project.ts';
import { CAST_PACKS } from './cast-packs/index.ts';
import { installPackIfNeeded } from './cast-packs/pack.ts';
import { ensureDirs, loadConfig } from './config.ts';
import { createCredits } from './credits/credits.ts';
import { pacedBrain } from './crew/fake-brain.ts';
import { acquireDataLock } from './data-lock.ts';
import { openDb } from './db/connection.ts';
import { createStore } from './db/store.ts';
import { ghCli } from './github/github.ts';
import { ghProbe, resolveGhBin } from './health/git-status.ts';
import { listen } from './listen.ts';
import { createReaper } from './reaper/reaper.ts';
import { claudeCliRunner, shellAllowed, shellHookCommand } from './runtime/claude-cli.ts';
import { loadRuntimeConfig, loadShell, macToolsFor } from './runtime/config.ts';
import { fakeRunner } from './runtime/fake.ts';
import { unavailableRunner } from './runtime/runner.ts';
import { ASK_TOOL } from './runtime/stream.ts';
import { cabinet } from './secrets/cabinet.ts';
import { macFolderPicker } from './secrets/pickFolder.ts';
import { fileSecretStore } from './secrets/secretStore.ts';
import { seedIfNeeded } from './seed.ts';
import {
  headCommit,
  installedBehind,
  isMainCheckout,
  markerFile,
  readMarker,
  runningCommit,
  spawnInstaller,
} from './self-install/self-install.ts';

const BOOT_GRACE_MS = 2000;
const CLOSE_BUDGET_MS = 3000;
const SWEEP_GRACE_MS = 1000;

const config = loadConfig();
ensureDirs(config);
/* one backend per data dir: a second one's startup recovery would interrupt the first one's running work */
let lock: { release: () => void };
try {
  lock = acquireDataLock(config.home, config.port);
} catch (e) {
  console.error(`\nAI Studio backend did NOT start: ${(e as Error).message}\n`);
  process.exit(1);
}
process.on('exit', () => lock.release());
/* nothing we start outlives us: first stop what a crashed run left behind (before recovery resumes its work, so
   no agent ever runs twice on one checkout), then tag everything this run starts */
const reaper = createReaper({ home: config.home });
const leftovers = await reaper.sweep(BOOT_GRACE_MS);
if (leftovers.termed > 0) console.error(`[reaper] stopped ${leftovers.termed} processes left from the last run`);
Object.assign(process.env, reaper.tag);
const db = openDb(config.dbPath);
const store = createStore(db, { sandbox: config.sandbox });
const secrets = fileSecretStore(join(config.controlHome, '.env'));
/* agents run as headless Claude Code (the user's login, no API key) */
const rt = loadRuntimeConfig();
/* AI_STUDIO_AGENT_SHELL=safe → B5's read-only shell + git; default dev (mkdir, npm, npx, node too) */
const shell = loadShell();
/* AI Credits Tracker: every CLI run reports the plan's usage; the app serves it (GET /credits) */
const credits = createCredits({ db, store });
/* AI_STUDIO_RUNNER=fake: the free, scripted runner + fake crew brain (UI work, demos) */
const runner =
  process.env.AI_STUDIO_RUNNER === 'fake'
    ? fakeRunner(pacedBrain(Number(process.env.AI_STUDIO_FAKE_PACE_MS) || 0))
    : rt.claudeBin
      ? claudeCliRunner({
          bin: rt.claudeBin,
          askServer: join(import.meta.dirname, 'mcp', 'ask-server.ts'),
          logDir: join(config.home, 'runs'),
          allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', ...shellAllowed(shell), ASK_TOOL],
          /* G1: `NAME=value <allowed command>` (literal values) — approved by a PreToolUse hook */
          /* + native Mac builds (swift, xcodebuild, ad-hoc codesign, hdiutil create) in Mac projects, dev shell only */
          shellHook: shellHookCommand(
            join(import.meta.dirname, 'runtime', 'shell-hook.ts'),
            shell,
            process.execPath,
            macToolsFor(shell),
          ),
          nudgeHook: shellHookCommand(join(import.meta.dirname, 'runtime', 'nudge-hook.ts'), []),
          onLimits: credits.record,
        })
      : unavailableRunner(rt.binError ?? 'Claude Code CLI not found');
/* GitHub visibility for health checks — only if gh is installed (read-only `gh repo view`) */
let ghBin: string | null;
try {
  ghBin = resolveGhBin(process.env.AI_STUDIO_GH_BIN?.trim() || undefined);
} catch (e) {
  console.error(`\nAI Studio backend did NOT start: ${(e as Error).message}\n`);
  process.exit(1);
}
/* on a Mac, the main checkout keeps /Applications/AI Studio.app current: on start if it is behind, and after
   every merge (AI_STUDIO_SELF_INSTALL=0 turns it off). Worktrees can't install, so they don't try. */
const studioRepo = join(import.meta.dirname, '..', '..');
const selfInstall =
  process.platform === 'darwin' && process.env.AI_STUDIO_SELF_INSTALL !== '0' && isMainCheckout(studioRepo)
    ? {
        repo: studioRepo,
        install: spawnInstaller(studioRepo, config.home),
        isBehind: installedBehind(markerFile(config.home), headCommit(studioRepo)),
        /* the code this backend loaded: a merge doesn't change it until the backend restarts */
        running: runningCommit(studioRepo),
        installed: () => readMarker(markerFile(config.home)),
      }
    : null;
const app = buildApp({
  config,
  db,
  store,
  secrets,
  runner,
  model: rt.model,
  logger: true,
  gh: ghBin ? ghProbe(ghBin) : null,
  ghRun: ghBin ? ghCli(ghBin) : null,
  ghBin,
  shell,
  selfInstall,
  pickFolder: macFolderPicker,
  credits,
  /* written down before it opens, so even a crash right after can't lose it */
  openApp: (bundle) => {
    reaper.opened(bundle);
    return openWithMac(bundle);
  },
});
app.log.info(
  { runner: runner.name, claudeBin: rt.claudeBin, model: rt.model, shell, ghBin, error: rt.binError },
  'Agent runtime',
);
store.trash.purge(); // "kept 30 days" means 30 days, even when nothing is deleted for a while
if (seedIfNeeded(store)) app.log.info('Seeded the studio with the starter cast and projects');
for (const pack of CAST_PACKS)
  if (installPackIfNeeded(store, pack)) app.log.info({ pack: pack.key }, 'Added a cast pack to the studio');
/* existing keys in the global .env show up in the cabinet (masked) */
const { imported, refreshed } = cabinet(store, secrets).importFromEnv();
app.log.info(
  { imported: imported.length, refreshed: refreshed.length },
  'Key Cabinet synced with the global .env',
);

/* The app hard-kills us at 5 s (backend.rs QUIT_DEADLINE): the graceful close gets 3 s, the sweep the rest. */
let stopping: Promise<never> | null = null;
const shutdown = (code: number) => {
  stopping ??= (async () => {
    const closed = await Promise.race([app.close().then(() => true), sleep(CLOSE_BUDGET_MS).then(() => false)]);
    if (!closed) app.log.warn({ budgetMs: CLOSE_BUDGET_MS }, 'Graceful close ran out of time; stopping what is left');
    const swept = await reaper.sweep(SWEEP_GRACE_MS);
    if (swept.termed > 0) app.log.info(swept, 'Stopped what the studio had started');
    db.close();
    process.exit(code);
  })();
  return stopping;
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await listen(app, config.host, config.port);
} catch (e) {
  console.error(`\nAI Studio backend did NOT start: ${(e as Error).message}\n`);
  await shutdown(1);
}
