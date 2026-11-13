/* Entry point: config → dirs → db → app → listen. */
import { buildApp } from './app.ts';
import { ensureDirs, loadConfig } from './config.ts';
import { openDb } from './db/connection.ts';
import { createStore } from './db/store.ts';
import { seedIfNeeded } from './seed.ts';

const config = loadConfig();
ensureDirs(config);
const db = openDb(config.dbPath);
const store = createStore(db, { sandbox: config.sandbox });
const app = buildApp({ config, db, store, logger: true });
if (seedIfNeeded(store)) app.log.info('Seeded the studio with the starter cast and projects');

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
