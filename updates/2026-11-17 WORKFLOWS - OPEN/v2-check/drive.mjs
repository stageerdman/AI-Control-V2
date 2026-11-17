// Throwaway browser driver for the Workflows v2 live check (Phase 6).
// node drive.mjs <shotName> '<steps json>'
// steps: [{go:'#hash'}, {click:'text or role=button[name=…]'}, {fill:[selector, value]}, {press:'Enter'},
//         {wait:ms}, {shot:'name'}, {text:true}, {eval:'js'}]
// Each step is a Playwright locator string (text=…, role=button[name="…"], css). Prints what a user would read.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= here('./node_modules/.browsers');
const { chromium } = await import('playwright-core');

const APP = process.env.APP ?? 'http://localhost:3570/';
const name = process.argv[2] ?? 'shot';
const arg = process.argv[3] ?? '[]';
const steps = JSON.parse(arg.endsWith('.json') ? readFileSync(here(`./steps/${arg}`), 'utf8') : arg);
const dir = here('./shots/');

// The server only allows the app's own origins (localhost:1420, tauri://); 1420 isn't one of this check's ports,
// so the test browser skips the CORS check instead.
const browser = await chromium.launch({ args: ['--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 200)}`));
const t0 = Date.now();
await page.goto(APP);
await page.waitForTimeout(1500);
let n = 0;
for (const s of steps) {
  try {
    if (s.go) {
      await page.evaluate((h) => (location.hash = h), s.go);
      await page.waitForTimeout(1200);
    }
    if (s.click) {
      await page.locator(s.click).first().click({ timeout: 5000 });
      await page.waitForTimeout(s.after ?? 800);
    }
    if (s.dbl) {
      await page.locator(s.dbl).first().dblclick({ timeout: 5000 });
      await page.waitForTimeout(800);
    }
    if (s.fill) {
      await page.locator(s.fill[0]).first().fill(s.fill[1], { timeout: 5000 });
      await page.waitForTimeout(300);
    }
    if (s.select) {
      await page.locator(s.select[0]).first().selectOption(s.select[1], { timeout: 5000 });
      await page.waitForTimeout(500);
    }
    if (s.press) {
      await page.keyboard.press(s.press);
      await page.waitForTimeout(500);
    }
    if (s.drag) {
      const a = await page.locator(s.drag[0]).first().boundingBox();
      const b = await page.locator(s.drag[1]).first().boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    }
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.shot) await page.screenshot({ path: `${dir}${name}-${s.shot}.png` });
    if (s.text) {
      const t = await page.locator(s.text === true ? 'body' : s.text).first().innerText();
      console.log(`--- text (${s.text}) at ${((Date.now() - t0) / 1000).toFixed(1)}s\n${t.slice(0, s.max ?? 3000)}`);
    }
    if (s.buttons) {
      const bs = await page.locator(s.buttons === true ? 'button, a, [role=button]' : s.buttons).evaluateAll(
        (els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean),
      );
      console.log(`--- buttons: ${bs.join(' | ').slice(0, 3000)}`);
    }
    if (s.eval) console.log('--- eval:', JSON.stringify(await page.evaluate(s.eval)).slice(0, 3000));
  } catch (e) {
    console.log(`!! step ${n} ${JSON.stringify(s)} failed: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${dir}${name}-fail${n}.png` });
    break;
  }
  n++;
}
console.log(`hash at end: ${await page.evaluate(() => location.hash)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
await page.screenshot({ path: `${dir}${name}-end.png` });
if (errors.length) console.log(`errors:\n${errors.slice(0, 10).join('\n')}`);
await browser.close();
