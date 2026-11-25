// node drive.mjs live|restart — share an access with an agent who is already working, on a real Claude Code run.
// Needs: the studio server from this branch on :3568 with a throwaway sandbox (see results.md for the command).
// The "lab API" here (:3570) is the thing the access opens: it answers only a caller holding the right token,
// with a word the agent can't guess. So "the agent reached it" = the lab saw the right token + the agent reports
// the word. The token is a fresh random test value — nothing real.
//   live:    the studio writes the access into the agent's .env mid-run and tells it to use it now.
//   restart: the agent's .env can't be written (it is a folder), so the studio tells it to restart (forget);
//            the fresh session must have the access in its environment.
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const mode = process.argv[2] === 'restart' ? 'restart' : 'live';
const API = 'http://127.0.0.1:3568';
const LAB_PORT = 3570;
const SANDBOX = join(import.meta.dirname, 'node_modules', 'sandbox');
const tag = `${mode}-${Date.now().toString(36)}`;
const token = `test-not-real-${randomBytes(12).toString('hex')}`;
const word = `word-${randomBytes(4).toString('hex')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const call = async (method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : null;
};
const at = () => new Date().toISOString().slice(11, 19);

/* the lab API: GET /whoami with the right bearer token → { word } */
const hits = [];
const lab = createServer((req, res) => {
  const ok = req.headers.authorization === `Bearer ${token}`;
  hits.push({ at: at(), path: req.url, ok });
  console.log(`${at()}  lab ← ${req.method} ${req.url} ${ok ? 'right token' : 'WRONG/NO token'}`);
  res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
  res.end(JSON.stringify(ok ? { word } : { error: 'unauthorized' }));
});
await new Promise((r) => lab.listen(LAB_PORT, '127.0.0.1', r));

/* a fresh project folder, an agent, and the access — not granted yet */
const folder = `busy-${tag}`;
mkdirSync(join(SANDBOX, folder), { recursive: true });
if (mode === 'restart') mkdirSync(join(SANDBOX, folder, '.env')); // a folder where .env should be: can't be written
const agent = await call('POST', '/agents', {
  name: `Tester ${tag}`,
  prompt: 'You are a careful engineer taking part in a studio check. Follow the task exactly.',
});
const project = await call('POST', '/projects', { name: `Busy ${tag}`, folder, agentIds: [agent.id] });
const access = await call('POST', '/accesses', {
  name: `Lab ${tag}`,
  serves: 'The local lab API at http://127.0.0.1:3570',
  /* an env var is unique in the cabinet: one per check run */
  fields: [{ label: 'Token', envVar: `LAB_TOKEN_${tag.replace(/\W/g, '_').toUpperCase()}`, value: token }],
});
console.log('project', project.id, 'agent', agent.id, 'access', access.id);

const task = [
  'This is a live studio check. Loop: run the shell command `node -e "setTimeout(()=>{},8000)"` (an 8 second wait),',
  'then see whether the studio has told you that a new access was shared with you. Repeat up to 15 times.',
  'When an access arrives, follow the studio note to use it: with node, send GET http://127.0.0.1:3570/whoami with the',
  'header `Authorization: Bearer <the access token>`. Never print, echo or write down the token itself.',
  'Then reply with exactly: WORD=<the word field of the JSON reply>. If no access arrives after 15 waits, reply NO ACCESS.',
].join(' ');
const run = await call('POST', `/projects/${project.id}/runs`, {
  agentId: agent.id,
  task,
  caps: { maxTurns: 60, maxBudgetUsd: 2 },
});
console.log(`${at()}  run started`, run.id);

const messages = () => call('GET', `/projects/${project.id}/chats/${run.id}/messages`);
const runNow = () => call('GET', `/projects/${project.id}/runs/${run.id}`);
const flat = (ms) => JSON.stringify(ms);
const list = (ms) => (Array.isArray(ms) ? ms : (ms.messages ?? []));
const toolCalls = async () => list(await messages()).filter((m) => m.role === 'tool').length;

/* wait until it is really busy: it has made at least one tool call (its first wait) */
let busy = 0;
for (let i = 0; i < 60 && !busy; i++) {
  await wait(2000);
  if ((await runNow()).status !== 'running') break;
  busy = await toolCalls();
}
const before = await runNow();
check('agent is working before the access is shared', busy > 0 && before.status === 'running', `${before.status}, ${busy} tool call(s) so far`);

/* share the access while it works */
await call('PUT', `/projects/${project.id}/access/${access.id}`);
console.log(`${at()}  access granted`);

/* let it finish */
let end = before;
for (let i = 0; i < 150; i++) {
  await wait(3000);
  end = await runNow();
  if (end.status !== 'running') break;
}
const ms = await messages();
const all = flat(ms);
const notice = list(ms).find((m) => m.meta?.kind === 'access');
console.log(`${at()}  run ended`, end.status, end.error ?? '');

check('the studio sent the access notice', !!notice, notice?.meta?.pickup);
check(`notice took the ${mode} path`, notice?.meta?.pickup === mode);
if (mode === 'restart')
  check(
    'agent restarted (forget → fresh session) after the notice',
    list(ms).findIndex((m) => m.meta?.kind === 'forget') > list(ms).indexOf(notice),
  );
check('same run, no new run started', (await call('GET', `/projects/${project.id}/runs`)).length === 1);
check('lab saw the right token', hits.some((h) => h.ok), `${hits.length} call(s)`);
check('agent reported the word the lab returned', all.includes(`WORD=${word}`));
check('the token value never appears in the chat', !all.includes(token));

if (end.status === 'running') await call('POST', `/projects/${project.id}/runs/${run.id}/cancel`);
lab.close();
if (mode === 'restart') rmSync(join(SANDBOX, folder, '.env'), { recursive: true });
console.log(results.every((r) => r.ok) ? '\nALL PASS' : '\nSOME FAILED');
console.log('chat:\n', list(ms).map((m) => `[${m.role}${m.meta?.kind ? `/${m.meta.kind}` : ''}] ${String(m.text).slice(0, 400)}`).join('\n'));
