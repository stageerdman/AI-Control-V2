/* Entry point: config → dirs → db → app → listen. */
import { buildApp } from './app.ts';
import { ensureDirs, loadConfig } from './config.ts';
import { openDb } from './db/connection.ts';

const config = loadConfig();
ensureDirs(config);
const db = openDb(config.dbPath);
const app = buildApp({ config, db, logger: true });

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
