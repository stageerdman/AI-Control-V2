/* Test harness: a temp home + sandbox, an in-memory db, an app driven by inject(). */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.ts';
import { type Config, ensureDirs } from '../src/config.ts';
import { openDb } from '../src/db/connection.ts';

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

export function testApp() {
  const t = tempDir();
  const config = testConfig(t.dir);
  ensureDirs(config);
  const db = openDb(':memory:');
  const app = buildApp({ config, db });
  return {
    app,
    db,
    config,
    close: async () => {
      await app.close();
      if (db.isOpen) db.close();
      t.cleanup();
    },
  };
}
