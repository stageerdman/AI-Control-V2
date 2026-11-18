// node drive.mjs typed|reload — a real agent asks the user a question; the user answers it in the office chat.
// Needs the studio server from this branch on :3569 (real runner, throwaway home/sandbox) and vite on :3570
// (see results.md). Each run checks: the agent gets the answer and keeps working with it, the question closes,
// the chat shows the question first and the answer second, and all of it still holds after a reload.
//   typed:  the answer is typed in the message box (the path that used to be lost).
//   reload: the page is reloaded between the question and the answer; the answer is a click on the card.
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const mode = process.argv[2] === 'reload' ? 'reload' : 'typed';
const API = 'http://127.0.0.1:3569';
const APP = 'http://localhost:3570/';
const SANDBOX = join(import.meta.dirname, '..', '..', '..', 'server', 'node_modules', '.liveans', 'sandbox');
const SHOTS = join(import.meta.dirname, 'node_modules', 'shots');
mkdirSync(SHOTS, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const at = () => new Date().toISOString().slice(11, 19);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const call = async (method, path, body) => {
  const r = await fetch(API + path, {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
};
async function until(what, read, ok, tries = 90) {
  for (let i = 0; i < tries; i++) {
    const v = await read();
    if (ok(v)) return v;
    await wait(2000);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

/* a fresh agent in a fresh project, so nothing else talks in this chat */
const tag = Date.now().toString(36);
const agent = await call('POST', '/agents', {
  name: `Asker ${tag}`,
  prompt: 'You are a careful engineer taking part in a studio check. Follow the task exactly.',
});
const folder = `answer-${tag}`;
mkdirSync(join(SANDBOX, folder), { recursive: true });
const project = await call('POST', '/projects', { name: `Answer ${tag}`, folder, agentIds: [agent.id] });
const pid = project.id;
console.log(`${at()}  ${mode}: project ${pid}, agent ${agent.id}`);

const browser = await chromium.launch({ args: ['--disable-web-security'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const shot = (name) => page.screenshot({ path: join(SHOTS, `${mode}-${name}.png`) });

/* what the chat shows, top to bottom: every line and every question card, in DOM order */
const chat = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.op-log:not([hidden]) > .bubble, .op-log:not([hidden]) > .op-ask')].map((el) => ({
      kind: el.classList.contains('op-ask') ? (el.classList.contains('live') ? 'open-card' : 'done-card') : 'line',
      mine: el.classList.contains('me'),
      text: el.textContent.trim().replace(/\s+/g, ' '),
    })),
  );
const show = (rows) => rows.map((r) => `    ${r.kind}${r.mine ? ' (you)' : ''}: ${r.text.slice(0, 110)}`).join('\n');
/* the user's way in: the office, then "!" jumps to whoever needs you and Enter opens their chat */
const openAsker = async () => {
  await page.goto(`${APP}#office/${pid}`);
  await page.waitForSelector('.o-body', { timeout: 20000 });
  await wait(2500);
  await page.locator('body').press('!');
  await wait(400);
  await page.keyboard.press('Enter');
  await page.waitForSelector(`.o-panel[aria-label="Chat with ${agent.name}"]`, { timeout: 10000 });
  await wait(1500);
};
const place = (rows, pred) => rows.findIndex(pred);

/* 1. the agent is set to work on something that needs the user's choice (the same endpoint the composer uses) */
const word = `teal-${randomBytes(3).toString('hex')}`;
const QUESTION = 'Which colour should the button be?';
await call('POST', `/projects/${pid}/threads/${agent.id}/messages`, {
  text: `Use your ask_user tool to ask me exactly "${QUESTION}" with the options Red and Blue. When I answer, write a file named colour.txt in your working folder holding exactly my answer, word for word, then reply with exactly COLOUR=<my answer, word for word>.`,
});
const ask = (
  await until('the agent asks', () => call('GET', `/projects/${pid}/asks`), (l) => l.some((a) => a.status === 'open'))
).find((a) => a.status === 'open');
console.log(`${at()}  the agent asked "${ask.question}" (options ${ask.options?.join('/')})`);

await page.goto(`${APP}#projects`);
await wait(2000);
if (mode === 'reload') {
  await page.reload();
  await wait(4000);
  console.log(`${at()}  reloaded between the question and the answer`);
}
await openAsker();
const before = await chat();
console.log(`  chat with the question open:\n${show(before)}`);
check('the open question shows as a card', before.some((r) => r.kind === 'open-card' && r.text.includes(QUESTION)));
await shot('asked');

/* 2. the user answers in the chat */
const answer = mode === 'typed' ? word : 'Blue';
if (mode === 'typed') {
  await page.fill('.op-composer input', word);
  await page.press('.op-composer input', 'Enter');
} else {
  await page.click('.op-ask.live .chip:text-is("Blue")');
}
console.log(`${at()}  answered "${answer}" (${mode === 'typed' ? 'typed in the message box' : 'clicked on the card'})`);

/* 3. the agent works with it and replies */
const reply = `COLOUR=${answer}`;
await until('the reply in the chat', chat, (rows) => rows.some((r) => r.kind === 'line' && !r.mine && r.text.includes(reply)));
await wait(1500);
await shot('replied');

const verify = async (when) => {
  const rows = await chat();
  console.log(`  chat ${when}:\n${show(rows)}`);
  const q = place(rows, (r) => !r.mine && r.text.includes(QUESTION));
  const a = place(rows, (r) => r.mine && r.text.includes(answer) && !r.text.includes('ask_user'));
  const rp = place(rows, (r) => !r.mine && r.kind === 'line' && r.text.includes(reply));
  check(`${when}: question, then answer, then reply`, q >= 0 && q < a && a < rp, `q=${q} a=${a} reply=${rp}`);
  check(`${when}: the question shows once`, rows.filter((r) => !r.mine && r.text.includes(QUESTION)).length === 1);
  check(`${when}: the answer shows once`, rows.filter((r) => r.mine && r.text.includes(answer) && !r.text.includes('ask_user')).length === 1);
  check(`${when}: no open question card`, !rows.some((r) => r.kind === 'open-card'));
  const closed = (await call('GET', `/projects/${pid}/asks`)).find((x) => x.id === ask.id);
  check(`${when}: the question is closed on the server`, closed.status === 'answered' && closed.answer === answer, closed.status);
  const pager = JSON.stringify(await call('GET', '/asks'));
  check(`${when}: the pager no longer holds it`, !pager.includes(ask.id));
};
await verify('live');
const file = await call('GET', `/projects/${pid}/threads/${agent.id}/messages`);
check('the agent kept working with the answer (colour.txt written by the same run)', await fileHolds(answer));
check('the agent is not busy any more', !file.busy);

await page.reload();
await wait(3000);
await openChatAfterReload();
await verify('after a reload');
await shot('reloaded');

await browser.close();
console.log(results.every(Boolean) ? '\nALL PASS' : '\nSOME FAILED');

async function fileHolds(text) {
  const { readFile } = await import('node:fs/promises');
  const f = await readFile(join(SANDBOX, folder, 'colour.txt'), 'utf8').catch(() => '');
  return f.trim() === text;
}
/* nobody needs you now, so the way back to the agent is its chat in the office: open it by its id */
async function openChatAfterReload() {
  await page.waitForSelector('.o-body', { timeout: 20000 });
  await wait(1500);
  await page.click(`.o-body[data-id="${agent.id}"]`);
  await wait(1500);
  /* an agent who doesn't need you opens its recap first; "Open chat" leads on */
  await page.getByRole('button', { name: 'Open chat' }).click({ timeout: 15000 });
  await page.waitForSelector(`.o-panel[aria-label="Chat with ${agent.name}"]`, { timeout: 10000 });
  await wait(1500);
}
