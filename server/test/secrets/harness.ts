/* B3 test harness: like testApp, plus a file-backed global .env, an optional
   on-disk db (to inspect its bytes) and every log line Fastify writes, at trace. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from '../../src/app.ts';
import { ensureDirs } from '../../src/config.ts';
import { openDb } from '../../src/db/connection.ts';
import { createStore } from '../../src/db/store.ts';
import { fileSecretStore, type SecretStore } from '../../src/secrets/secretStore.ts';
import { seedIfNeeded } from '../../src/seed.ts';
import { tempDir, testConfig } from '../helpers.ts';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export function secretsApp(opts: { diskDb?: boolean; secrets?: (file: SecretStore) => SecretStore } = {}) {
  const t = tempDir();
  const config = testConfig(t.dir);
  if (opts.diskDb) config.dbPath = join(config.home, 'studio.db');
  ensureDirs(config);
  mkdirSync(config.controlHome, { recursive: true });
  const envPath = join(config.controlHome, '.env');
  const file = fileSecretStore(envPath);
  const secrets = opts.secrets ? opts.secrets(file) : file;
  const db = openDb(config.dbPath);
  const store = createStore(db, { sandbox: config.sandbox });
  seedIfNeeded(store);
  const logs: string[] = [];
  const app = buildApp({
    config,
    db,
    store,
    secrets,
    logger: { level: 'trace', stream: { write: (s: string) => logs.push(s) } },
  });
  /** Everything a client or log reader could ever see, for leak checks. */
  const seen: string[] = [];
  const call = async (method: Method, url: string, payload?: unknown, raw?: string) => {
    const res = await app.inject({
      method,
      url,
      ...(raw !== undefined
        ? { payload: raw, headers: { 'content-type': 'application/json' } }
        : payload === undefined
          ? {}
          : { payload: payload as object }),
    });
    seen.push(res.body, JSON.stringify(res.headers));
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  };
  return {
    app,
    call,
    store,
    db,
    config,
    envPath,
    logs,
    seen,
    project: (id: string) => join(config.sandbox, id),
    close: async () => {
      await app.close();
      if (db.isOpen) db.close();
      t.cleanup();
    },
  };
}
