/* Bring back deleted Cast agents and re-queue the work that waited for them.
   (from server/; tsx like `npm start`)
     npm run restore-missing                    dry run: every missing agent, nothing written
     npm run restore-missing -- --apply         restore every missing agent
     npm run restore-missing -- --apply a-c     restore only these ids
   Prints the RestoreResult list as JSON. A dry run does the whole restore inside a transaction and rolls it
   back, so it shows exactly what --apply would do. Re-queued work starts at the backend's next pump or restart. */
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db/connection.ts';
import { createStore } from '../src/db/store.ts';
import { findMissingAgents, type RestoreResult, restoreAgent } from '../src/office/restore-missing.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const only = args.filter((a) => !a.startsWith('--'));

const db = openDb(loadConfig().dbPath);
const store = createStore(db, { sandbox: loadConfig().sandbox });
const missing = findMissingAgents(store).filter((m) => only.length === 0 || only.includes(m.id));
const unknown = only.filter((id) => !missing.some((m) => m.id === id) && !store.agents.record(id));

db.exec('BEGIN');
let results: RestoreResult[];
try {
  results = missing.map((m) => restoreAgent(store, m.id, { blockedRuns: m.blockedRuns }));
  db.exec(apply ? 'COMMIT' : 'ROLLBACK');
} catch (e) {
  db.exec('ROLLBACK');
  console.error(`Restore failed, nothing was changed: ${(e as Error).stack ?? e}`);
  process.exit(1);
}
db.close();
console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry run', results, ...(unknown.length ? { unknown } : {}) }, null, 2));
