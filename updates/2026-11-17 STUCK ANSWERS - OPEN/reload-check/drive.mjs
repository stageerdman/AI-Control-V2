// node drive.mjs <phase> — the reload check in a headless browser (server :3569 fake runner, app :3570).
// Phases: away (a reply lands while you're out), ask (a question lands while you're out, then a reload),
// after-restart (reload once the server restarted: the question is still there; answer it).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const phase = process.argv[2] ?? 'away';
const API = 'http://127.0.0.1:3569';
const APP = 'http://localhost:3570/';
const SHOTS = join(import.meta.dirname, 'node_modules', 'shots');
mkdirSync(SHOTS, { recursive: true });
const PID = 'atlas';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (method, path, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { origin: 'http://localhost:1420', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r.json().catch(() => null);
};

await api('PATCH', `/projects/${PID}`, { folder: 'demo' });
const browser = await chromium.launch({ args: ['--disable-web-security'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `${phase}-${name}.png`) });
  console.log('shot', `${phase}-${name}.png`);
};
const chat = async () =>
  page.evaluate(() => ({
    lines: [...document.querySelectorAll('.op-log .bubble')].map((b) => b.textContent.trim().slice(0, 120)),
    typing: !!document.querySelector('.op-log .typing'),
    asks: [...document.querySelectorAll('.op-ask')].map((a) => ({
      cls: a.className,
      text: a.textContent.trim(),
      chips: [...a.querySelectorAll('.chip')].map((c) => c.textContent),
    })),
    status: document.querySelector('.op-status')?.textContent,
  }));
const pager = async () =>
  page.evaluate(() => document.querySelector('#pager .o-pg-screen')?.textContent?.trim() ?? '(no pager)');
const go = async (hash) => {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await wait(1500);
};
const say = async (text) => {
  await page.waitForSelector('.op-composer input', { timeout: 15000 });
  await page.fill('.op-composer input', text);
  await page.press('.op-composer input', 'Enter');
  await wait(400);
};

await page.goto(`${APP}#projects`);
await wait(2500);

if (phase === 'away') {
  await go(`#office/${PID}`);
  await wait(2000);
  await say('Hello — reply while I am away');
  console.log('sent', await chat());
  await go('#projects');
  console.log('left the office; waiting for the reply to land');
  await wait(20000);
  await go(`#office/${PID}`);
  await wait(2500);
  console.log('back', await chat());
  await shot('back');
}

if (phase === 'ask') {
  await go(`#office/${PID}`);
  await wait(2000);
  await say('Please ask me if it works');
  await go('#projects');
  console.log('left the office; waiting for the question');
  await wait(9000);
  console.log('pager before reload:', await pager());
  await shot('pager-before');
  await page.reload();
  await wait(7000);
  console.log('pager after reload:', await pager());
  await shot('pager-after');
  await go(`#office/${PID}`);
  await wait(3000);
  console.log('office after reload', await chat());
  await shot('office');
  await go('#projects');
  await wait(1000);
}

if (phase === 'ask-away') {
  /* the question lands while you're on Projects (sent through the API, nobody in the office) */
  await api('POST', `/projects/${PID}/threads/a-query/messages`, { text: 'Please ask me if it works' });
  await wait(7000);
  console.log('pager before reload:', await pager());
  await shot('pager-before');
  await page.reload();
  await wait(7000);
  console.log('pager after reload:', await pager());
  await shot('pager-after');
  await page.click('#pager .o-pg-screen');
  await wait(3500);
  await shot('office-room');
  await page.keyboard.press('!');
  await wait(500);
  await page.keyboard.press('Enter');
  await wait(1500);
  console.log('asker chat', await chat());
  await shot('office-asker');
}

if (phase === 'after-restart') {
  await wait(5000);
  console.log('pager after restart:', await pager());
  await shot('pager');
  await go(`#office/${PID}`);
  await wait(3000);
  console.log('office after restart', await chat());
  await shot('office');
  const chip = await page.$('.op-ask.live .chip');
  if (chip) {
    await chip.click();
    console.log('answered');
    await wait(1500);
    console.log('right after answering', await chat());
    await shot('answered');
    await wait(25000);
    console.log('later', await chat());
    await shot('later');
  }
}

if (phase === 'after-restart-pager') {
  /* the non-director's question after a restart: open it from the pager, answer, the reply arrives */
  await wait(5000);
  console.log('pager after restart:', await pager());
  await page.click('#pager .o-pg-screen');
  await wait(3500);
  await page.keyboard.press('!');
  await wait(500);
  await page.keyboard.press('Enter');
  await wait(1500);
  console.log('asker chat', await chat());
  const chip = await page.$('.op-ask.live .chip');
  if (chip) {
    await chip.click();
    console.log('answered');
    await wait(25000);
    console.log('later', await chat());
    await shot('later');
  }
}

if (phase === 'reload-in-office') {
  await go(`#office/${PID}`);
  await wait(2000);
  await say('Please ask me once more');
  await wait(9000);
  console.log('in office before reload', await chat());
  await page.reload();
  await wait(6000);
  console.log('in office after reload', await chat());
  await shot('office');
}

if (phase === 'typed') {
  /* the answer typed in the message box (not the card): it answers the question, in order, also after a reload */
  await go(`#office/${PID}`);
  await wait(2000);
  await say('Please ask me if it works');
  await wait(9000);
  console.log('director asked', await chat());
  await say('No, still broken');
  await wait(1500);
  console.log('director right after typing', await chat());
  await shot('director-typed');
  await wait(15000);
  console.log('director later', await chat());
  await page.reload();
  await wait(6000);
  await go(`#office/${PID}`);
  await wait(3000);
  console.log('director after reload', await chat());
  await shot('director-reload');
}

if (phase === 'typed-member') {
  /* a team member's question (the old lost-answer case): open it from the pager, type the answer.
     The pager stays quiet while you're in the office, so this starts on Projects. */
  const open = await api('GET', `/projects/${PID}/asks`);
  if (!open?.some((a) => a.agentId === 'a-query' && a.status === 'open'))
    await api('POST', `/projects/${PID}/threads/a-query/messages`, { text: 'Please ask me if it works' });
  await wait(9000);
  console.log('pager:', await pager());
  await page.click('#pager .o-pg-screen');
  await wait(3500);
  await page.keyboard.press('!');
  await wait(500);
  await page.keyboard.press('Enter');
  await wait(1500);
  console.log('member asked', await chat());
  await say('Tomorrow, after the deploy');
  await wait(1500);
  console.log('member right after typing', await chat());
  await shot('member-typed');
  await wait(15000);
  const th = await api('GET', `/projects/${PID}/threads/a-query/messages`);
  console.log(
    'member thread on the server',
    th?.messages?.map((m) => `${m.at} ${m.from} ${m.kind}: ${m.text.slice(0, 70)}`),
  );
  const asks = await api('GET', `/projects/${PID}/asks`);
  console.log('open asks on the server', asks);
}

await browser.close();
