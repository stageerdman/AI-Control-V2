/* Entry point: config → dirs → db → app → listen. */
import { join } from 'node:path';
import { buildApp } from './app.ts';
import { CAST_PACKS } from './cast-packs/index.ts';
import { installPackIfNeeded } from './cast-packs/pack.ts';
import { ensureDirs, loadConfig } from './config.ts';
import { pacedBrain } from './crew/fake-brain.ts';
import { acquireDataLock } from './data-lock.ts';
import { openDb } from './db/connection.ts';
import { createStore } from './db/store.ts';
import { ghCli } from './github/github.ts';
import { ghProbe, resolveGhBin } from './health/git-status.ts';
import { listen } from './listen.ts';
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
const db = openDb(config.dbPath);
const store = createStore(db, { sandbox: config.sandbox });
const secrets = fileSecretStore(join(config.controlHome, '.env'));
/* agents run as headless Claude Code (the user's login, no API key) */
const rt = loadRuntimeConfig();
/* AI_STUDIO_AGENT_SHELL=safe → B5's read-only shell + git; default dev (mkdir, npm, npx, node too) */
const shell = loadShell();
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

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await listen(app, config.host, config.port);
} catch (e) {
  console.error(`\nAI Studio backend did NOT start: ${(e as Error).message}\n`);
  await app.close();
  db.close();
  process.exit(1);
}
