/* Test harness: a temp home + sandbox, an in-memory db, an app driven by inject(). */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, secretValuesOf } from '../src/app.ts';
import { type Config, ensureDirs } from '../src/config.ts';
import { openDb } from '../src/db/connection.ts';
import { createStore } from '../src/db/store.ts';
import { createBus } from '../src/events/bus.ts';
import { eventLog } from '../src/events/log.ts';
import type { Runner } from '../src/runtime/runner.ts';
import type { Runtime } from '../src/runtime/service.ts';
import { fileSecretStore } from '../src/secrets/secretStore.ts';
import { seedIfNeeded } from '../src/seed.ts';

export function tempDir(prefix = 'ais-'): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function testConfig(root: string): Config {
  return {
    home: join(root, 'home'),
    sandbox: join(root, 'sandbox'),
    controlHome: join(root, 'control'),
    dbPath: ':memory:',
    port: 0,
    host: '127.0.0.1',
  };
}

export function testApp(
  opts: { seed?: boolean; heartbeatMs?: number; dev?: boolean; runner?: Runner; longPollMs?: number } = {},
) {
  const t = tempDir();
  const config = testConfig(t.dir);
  ensureDirs(config);
  writeModules(config.controlHome);
  const db = openDb(':memory:');
  const store = createStore(db, { sandbox: config.sandbox });
  if (opts.seed) seedIfNeeded(store);
  let runtime: Runtime | undefined;
  const secrets = fileSecretStore(join(config.controlHome, '.env'));
  const events = eventLog(db, createBus(), secretValuesOf(secrets));
  const app = buildApp({
    config,
    db,
    store,
    secrets,
    events,
    dev: opts.dev ?? true,
    ...(opts.runner ? { runner: opts.runner } : {}),
    ...(opts.longPollMs === undefined ? {} : { longPollMs: opts.longPollMs }),
    onRuntime: (rt) => {
      runtime = rt;
    },
    ...(opts.heartbeatMs === undefined ? {} : { heartbeatMs: opts.heartbeatMs }),
  });
  /** inject() shorthand: call(method, url, body?) → { status, body } */
  const call = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => {
    const res = await app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  };
  return {
    app,
    call,
    store,
    events,
    secrets,
    runtime: runtime as unknown as Runtime,
    db,
    config,
    close: async () => {
      await app.close();
      if (db.isOpen) db.close();
      t.cleanup();
    },
  };
}

/** A tiny AI Control home: two modules in the shape of the real ones. */
export function writeModules(controlHome: string): void {
  const dir = join(controlHome, 'modules');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'CODING.md'),
    'How code is written.\n\n# Coding\n\n## Keep it minimal\n- Build only what is needed.\n',
  );
  writeFileSync(
    join(dir, 'STRUCTURE.md'),
    'How projects are laid out.\n\n# Structure\n\n## Updates\n```\n# not a heading\nupdates/YYYY-MM-DD NAME - OPEN/\n```\n- One folder per update.\n',
  );
  writeFileSync(join(dir, 'notes.txt'), 'ignored: not a module');
}
