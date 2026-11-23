/* Live check (`npm run check:start`, on the user's Mac): the Start call on real projects in ~/dev, through a
   throwaway studio (temp home, in-memory db) — Erdman Knowledge (a website) answers at http://localhost:3980/ and
   MagicCut (a Tauri app) opens its newest build with macOS `open`. Not opted in, or a project missing → skips. */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { openWithMac } from '../../src/apps/start-project.ts';
import { ensureDirs } from '../../src/config.ts';
import { openDb } from '../../src/db/connection.ts';
import { createStore } from '../../src/db/store.ts';
import { seedIfNeeded } from '../../src/seed.ts';
import { tempDir, testConfig, writeModules } from '../helpers.ts';

const DEV = join(homedir(), 'dev');
const PROJECTS = { 'erdman-knowledge': 'Erdman Knowledge', supercut: 'MagicCut' } as const;

function skipReason(): string | null {
  if (process.env.AI_STUDIO_START_CHECK !== '1') return 'opt-in check: run `npm run check:start`';
  if (process.platform !== 'darwin') return `needs macOS (this is ${process.platform})`;
  const missing = Object.keys(PROJECTS).find((f) => !existsSync(join(DEV, f)));
  return missing ? `no ~/dev/${missing} on this machine` : null;
}

/** A throwaway studio whose sandbox is the real ~/dev, knowing only the two projects. */
function liveStudio() {
  const t = tempDir();
  const config = { ...testConfig(t.dir), sandbox: DEV };
  ensureDirs({ ...config, sandbox: t.dir });
  writeModules(config.controlHome);
  const db = openDb(':memory:');
  const store = createStore(db, { sandbox: DEV });
  seedIfNeeded(store);
  for (const [id, name] of Object.entries(PROJECTS)) store.projects.create({ name, folder: id }, id);
  const app = buildApp({ config, db, store, openApp: openWithMac, userHome: join(t.dir, 'home') });
  return {
    call: async (url: string) => {
      const r = await app.inject({ method: 'POST', url });
      return { status: r.statusCode, body: r.json() };
    },
    close: async () => {
      await app.close(); // stops the website it started
      db.close();
      t.cleanup();
    },
  };
}

const reason = skipReason();
if (reason) console.info(`[start.live] skipped: ${reason}`);

describe.skipIf(reason)('Start on real projects', () => {
  let studio: ReturnType<typeof liveStudio>;
  const call = (url: string) => studio.call(url);
  beforeAll(() => {
    studio = liveStudio();
  });
  afterAll(() => studio.close());

  it('Erdman Knowledge answers at http://localhost:3980/', { timeout: 180_000 }, async () => {
    const r = await call('/projects/erdman-knowledge/start');
    expect(r).toEqual({ status: 200, body: { kind: 'website', url: 'http://localhost:3980/' } });
    const page = await fetch(r.body.url);
    expect(page.status).toBe(200);
    console.info(`[start.live] Erdman Knowledge: ${r.body.url} → ${page.status}`);
  });

  it('MagicCut opens its newest build', { timeout: 30_000 }, async () => {
    const r = await call('/projects/supercut/start');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ kind: 'desktop' });
    expect(r.body.app).toMatch(/\/Magic Cut\.app$/);
    console.info(`[start.live] MagicCut: opened ${r.body.app}`);
  });
});
