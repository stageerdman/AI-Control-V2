/* Entry point: config → dirs → db → app → listen. */
import { join } from 'node:path';
import { buildApp } from './app.ts';
import { ensureDirs, loadConfig } from './config.ts';
import { openDb } from './db/connection.ts';
import { createStore } from './db/store.ts';
import { cabinet } from './secrets/cabinet.ts';
import { fileSecretStore } from './secrets/secretStore.ts';
import { seedIfNeeded } from './seed.ts';

const config = loadConfig();
ensureDirs(config);
const db = openDb(config.dbPath);
const store = createStore(db, { sandbox: config.sandbox });
const secrets = fileSecretStore(join(config.controlHome, '.env'));
const app = buildApp({ config, db, store, secrets, logger: true });
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

await app.listen({ port: config.port, host: config.host });
