/* Entry point: config → dirs → db → app → listen. */
import { join } from 'node:path';
import { buildApp } from './app.ts';
import { ensureDirs, loadConfig } from './config.ts';
import { openDb } from './db/connection.ts';
import { createStore } from './db/store.ts';
import { listen } from './listen.ts';
import { claudeCliRunner } from './runtime/claude-cli.ts';
import { loadRuntimeConfig } from './runtime/config.ts';
import { unavailableRunner } from './runtime/runner.ts';
import { cabinet } from './secrets/cabinet.ts';
import { fileSecretStore } from './secrets/secretStore.ts';
import { seedIfNeeded } from './seed.ts';

const config = loadConfig();
ensureDirs(config);
const db = openDb(config.dbPath);
const store = createStore(db, { sandbox: config.sandbox });
const secrets = fileSecretStore(join(config.controlHome, '.env'));
/* agents run as headless Claude Code (the user's login, no API key) */
const rt = loadRuntimeConfig();
const runner = rt.claudeBin
  ? claudeCliRunner({
      bin: rt.claudeBin,
      askServer: join(import.meta.dirname, 'mcp', 'ask-server.ts'),
      logDir: join(config.home, 'runs'),
    })
  : unavailableRunner(rt.binError ?? 'Claude Code CLI not found');
const app = buildApp({ config, db, store, secrets, runner, model: rt.model, logger: true });
app.log.info({ claudeBin: rt.claudeBin, model: rt.model, error: rt.binError }, 'Agent runtime');
if (seedIfNeeded(store)) app.log.info('Seeded the studio with the starter cast and projects');
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
