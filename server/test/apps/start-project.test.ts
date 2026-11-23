/* Ready to Test: POST /projects/:id/start opens the newest built desktop app, or starts a website and answers with
   its http://localhost:<PORT>/ link once it is reachable (never 127.0.0.1 — passkey/OAuth sign-in need localhost). */
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDesktopProject, newestBuiltApp } from '../../src/apps/built-app.ts';
import { tempDir, testApp } from '../helpers.ts';

/** A minimal .app bundle, built at `at` (seconds). */
const bundle = (app: string, at: number) => {
  mkdirSync(join(app, 'Contents'), { recursive: true });
  writeFileSync(join(app, 'Contents', 'Info.plist'), '<plist/>');
  utimesSync(join(app, 'Contents', 'Info.plist'), at, at);
};
const tauri = (dir: string, productName: string) => {
  mkdirSync(join(dir, 'src-tauri'), { recursive: true });
  writeFileSync(join(dir, 'src-tauri', 'tauri.conf.json'), JSON.stringify({ productName }));
};

describe('newestBuiltApp', () => {
  let t: ReturnType<typeof tempDir>;
  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => t.cleanup());

  it('Tauri: the newest of its own bundles in the shared target, never another project’s', () => {
    const dir = join(t.dir, 'cut');
    const target = join(t.dir, 'target');
    tauri(dir, 'Magic Cut');
    expect(isDesktopProject(dir)).toBe(true);
    expect(newestBuiltApp(dir, target)).toBeNull(); // nothing built yet
    bundle(join(target, 'release', 'bundle', 'macos', 'Magic Cut.app'), 1000);
    bundle(join(target, 'debug', 'bundle', 'macos', 'Magic Cut.app'), 2000);
    bundle(join(target, 'release', 'bundle', 'macos', 'Pensieve.app'), 3000);
    expect(newestBuiltApp(dir, target)).toBe(join(target, 'debug', 'bundle', 'macos', 'Magic Cut.app'));
  });

  it('native Mac: any .app under build/ or .build/, skipping ones nested in another app', () => {
    const dir = join(t.dir, 'swifty');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Package.swift'), '// swift-tools-version:5.9');
    const products = join(dir, 'build', 'DerivedData', 'Build', 'Products');
    bundle(join(products, 'Debug', 'Swifty.app'), 1000);
    bundle(join(products, 'Release', 'Swifty.app'), 2000);
    bundle(join(products, 'Debug', 'Swifty.app', 'Contents', 'Helpers', 'Inner.app'), 9000);
    expect(newestBuiltApp(dir, join(t.dir, 'none'))).toBe(join(products, 'Release', 'Swifty.app'));
  });

  it('a plain website is not a desktop project', () => {
    const dir = join(t.dir, 'site');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}');
    expect(isDesktopProject(dir)).toBe(false);
  });
});

/** Listens on PORT (or a port of its own with OWN=1) on 127.0.0.1 and prints that address, after `DELAY` ms. */
const SITE = `
const http = require('node:http');
setTimeout(() => {
  const s = http.createServer((_, res) => res.end('hi'));
  s.listen(process.env.OWN ? 0 : Number(process.env.PORT), '127.0.0.1', () =>
    console.log('ready on http://127.0.0.1:' + s.address().port + '/'));
}, Number(process.env.DELAY || 300));
`;

describe('POST /projects/:id/start', () => {
  let h: ReturnType<typeof testApp>;
  let dir: string;
  afterEach(() => h.close());
  const setup = (files: Record<string, string>, opened: string[] = []) => {
    h = testApp({ seed: true, openApp: async (app) => void opened.push(app) });
    dir = join(h.config.sandbox, 'aurora');
    mkdirSync(dir);
    for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
    h.store.projects.update('aurora', { folder: 'aurora' });
  };

  it('desktop: opens the newest build; nothing built yet → a plain 409', async () => {
    const opened: string[] = [];
    setup({ '.project': 'name: Aurora\nrun: npm run app\n' }, opened);
    tauri(dir, 'Aurora');
    const none = await h.call('POST', '/projects/aurora/start');
    expect(none.status).toBe(409);
    expect(none.body.error.message).toMatch(/not been built yet/);
    const app = join(dir, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Aurora.app');
    bundle(app, Date.now() / 1000);
    const r = await h.call('POST', '/projects/aurora/start');
    expect(r).toEqual({ status: 200, body: { kind: 'desktop', app } });
    expect(opened).toEqual([app]);
    expect((await h.call('GET', '/projects/aurora/app')).body.status).toBe('stopped'); // no dev server
  });

  it('website: answers once reachable at http://localhost:<PORT>/ (it printed 127.0.0.1); again reuses it', async () => {
    setup({ '.project': 'name: Aurora\nrun: node site.js\n', 'site.js': SITE });
    const r = await h.call('POST', '/projects/aurora/start');
    const view = (await h.call('GET', '/projects/aurora/app')).body;
    expect(r).toEqual({ status: 200, body: { kind: 'website', url: `http://localhost:${view.port}/` } });
    expect((await fetch(r.body.url)).status).toBe(200);
    const again = await h.call('POST', '/projects/aurora/start');
    expect(again.body).toEqual(r.body);
    expect((await h.call('GET', '/projects/aurora/app')).body.pid).toBe(view.pid);
    await h.call('POST', '/projects/aurora/app/stop');
  });

  it('website that ignores PORT: the address it printed, as localhost', async () => {
    setup({ '.project': 'name: Aurora\nrun: OWN=1 node site.js\n', 'site.js': SITE });
    const r = await h.call('POST', '/projects/aurora/start');
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(r.body.url).not.toContain(`:${(await h.call('GET', '/projects/aurora/app')).body.port}/`);
    expect((await fetch(r.body.url)).status).toBe(200);
    await h.call('POST', '/projects/aurora/app/stop');
  });

  it('website that stops before it answers → 409 with its exit code and last lines', async () => {
    setup({ '.project': 'name: Aurora\nrun: node -e "console.log(\'boom\'); process.exit(2)"\n' });
    const r = await h.call('POST', '/projects/aurora/start');
    expect(r.status).toBe(409);
    expect(r.body.error.message).toBe('The app stopped before it was ready (exit code 2)');
    expect(r.body.error.details.log).toEqual(['boom']);
  });
});
