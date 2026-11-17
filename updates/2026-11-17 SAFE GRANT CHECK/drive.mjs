// node drive.mjs — Safe grant check in a real headless browser, with normal web security ON (no
// --disable-web-security: the bug was the browser's CORS preflight refusing PUT, so that must stay live).
// Needs: the server under test on :3569 (sandboxed AI_STUDIO_HOME / SANDBOX / AI_CONTROL_HOME) and the app
// served by vite on http://localhost:1420 (the real app origin) with VITE_API_URL=http://127.0.0.1:3569.
// Steps: add a Cloudflare access with fake test values → reload, still in the cabinet → open a project's
// Safe, grant it → no error, "Granted" → reload, reopen the Safe → still granted.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const API = 'http://127.0.0.1:3569';
const APP = 'http://localhost:1420/';
const SHOTS = join(import.meta.dirname, 'node_modules', 'shots');
mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const projects = await (await fetch(`${API}/projects`)).json();
const list = Array.isArray(projects) ? projects : (projects.projects ?? projects.items ?? []);
const project = list[0];
console.log('project', project?.id, project?.name);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const failed = [];
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
/* the live event stream is cut on every reload/navigation (ERR_ABORTED) — expected, not a failure */
page.on('requestfailed', (r) => {
  if (r.url().endsWith('/events') && r.failure()?.errorText === 'net::ERR_ABORTED') return;
  failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`);
});
page.on('response', (r) => {
  if (r.url().startsWith(API) && r.request().method() !== 'GET') console.log('  ←', r.request().method(), r.url().slice(API.length), r.status());
});
const shot = (n) => page.screenshot({ path: join(SHOTS, `${n}.png`) });
const toasts = () => page.evaluate(() => document.body.innerText.split('\n').filter((l) => /⚠|🔑|🔒|Can't reach|went wrong/.test(l)));

/* 1 — add a Cloudflare access in the cabinet */
await page.goto(`${APP}#access`);
await page.getByRole('button', { name: /Add new access/ }).first().click();
await wait(600);
const cf = page.getByRole('radio', { name: /Cloudflare/i });
if (await cf.count()) await cf.first().click();
else await page.fill('#aeName', 'Cloudflare');
await wait(300);
const name = await page.inputValue('#aeName');
for (const v of await page.locator('.ae-val').all()) await v.fill(`test-not-real-${Math.random().toString(36).slice(2, 10)}`);
for (const l of await page.locator('.ae-label').all()) if (!(await l.inputValue())) await l.fill('Token');
await shot('1-editor');
await page.getByRole('button', { name: 'Save access' }).click();
await wait(1500);
const editorErr = await page.locator('.af-error').allTextContents();
check('save the access: no error', editorErr.length === 0, editorErr.join(' | '));
await shot('2-saved');

await page.reload();
await wait(1500);
check(`"${name}" is in the cabinet after reload`, (await page.locator('.vault').innerText()).includes(name));

/* 2 — grant it in the project's Safe */
const openSafe = async () => {
  await page.goto(`${APP}#office/${project.id}`);
  await wait(2500);
  await page.locator('.o-hot[data-obj="safe"]').click({ force: true });
  await page.waitForSelector('.project-access .toggle-row', { timeout: 10000 });
  await wait(500);
};
const row = () => page.locator('.project-access .toggle-row', { hasText: name });
await openSafe();
check('Safe shows it as not granted yet', (await row().locator('.state').innerText()) === 'Not granted');
await row().getByRole('switch').click();
await wait(1500);
const t = await toasts();
check('grant: no "Can\'t reach" / error toast', !t.some((x) => /⚠|Can't reach|went wrong/.test(x)), t.join(' | '));
check('grant: toast confirms', t.some((x) => x.includes(`${name} granted`)), t.join(' | '));
check('grant: row says Granted', (await row().locator('.state').innerText()) === 'Granted');
await shot('3-granted');

/* 3 — reload: still granted (from the server, not the screen) */
await page.reload();
await openSafe();
check('after reload: row still says Granted', (await row().locator('.state').innerText()) === 'Granted');
await shot('4-after-reload');
const server = await (await fetch(`${API}/projects/${project.id}/access`)).json();
const onServer = server.accesses?.find((x) => x.name === name);
check('server has it granted', !!onServer?.granted, JSON.stringify({ granted: server.granted, total: server.total }));

check('no failed requests (CORS/network)', failed.length === 0, failed.join(' | '));
await browser.close();
console.log(results.every((r) => r.ok) ? '\nALL PASS' : '\nSOME FAILED');
