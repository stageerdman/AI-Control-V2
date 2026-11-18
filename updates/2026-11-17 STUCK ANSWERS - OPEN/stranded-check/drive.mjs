// node drive.mjs ask|after — answers reach a real agent; a question nobody waits on is withdrawn after a restart.
// Needs the studio server from this branch on :3569 with a throwaway home/sandbox (see results.md).
//   ask:   (A) a chat turn asks with ask_user; we answer with a random word; the agent must quote it back, the
//          question must close, and the chat must read question → answer → reply.
//          (B) a hand-started run asks, then stays waiting — restart the server now.
//   after: A's question is still answered (never open again). B's question is withdrawn (nothing resumes a
//          hand-started run); answering it says so (409); typing to that agent gets a real reply (not swallowed).
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const phase = process.argv[2] === 'after' ? 'after' : 'ask';
const API = 'http://127.0.0.1:3569';
const STATE = join(import.meta.dirname, 'node_modules', 'state.json');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const raw = async (method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
};
const call = async (method, path, body) => {
  const r = await raw(method, path, body);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body).slice(0, 500)}`);
  return r.body;
};
const at = () => new Date().toISOString().slice(11, 19);
async function until(what, read, ok, tries = 90) {
  for (let i = 0; i < tries; i++) {
    const v = await read();
    if (ok(v)) return v;
    await wait(2000);
  }
  throw new Error(`timed out waiting for: ${what}`);
}
const asks = (pid) => call('GET', `/projects/${pid}/asks`);
const thread = (pid, aid) => call('GET', `/projects/${pid}/threads/${aid}/messages`);
const show = (t) => t.messages.map((m) => `  ${m.at.slice(11, 19)} ${m.from} ${m.kind}: ${m.text.slice(0, 120)}`).join('\n');

if (phase === 'ask') {
  const tag = Date.now().toString(36);
  const word = `teal-${randomBytes(3).toString('hex')}`;
  mkdirSync(join(import.meta.dirname, 'node_modules'), { recursive: true });
  const agent = await call('POST', '/agents', {
    name: `Asker ${tag}`,
    prompt: 'You are a careful engineer taking part in a studio check. Follow the task exactly.',
  });
  const folder = `asks-${tag}`;
  const project = await call('POST', '/projects', { name: `Asks ${tag}`, folder, agentIds: [agent.id] });
  const pid = project.id;
  console.log('project', pid, 'agent', agent.id);

  /* A: a chat turn asks; the answer must reach the agent */
  const said = await call('POST', `/projects/${pid}/threads/${agent.id}/messages`, {
    text: 'Use your ask_user tool to ask me exactly "Which colour should the button be?" with the options Red and Blue. Then reply with exactly COLOUR=<my answer, word for word>. Do nothing else.',
  });
  console.log(`${at()}  A: chat turn started`, said.message.runId);
  const [qa] = await until('A asks', () => asks(pid), (l) => l.some((a) => a.status === 'open'));
  console.log(`${at()}  A: asked "${qa.question}"`);
  const ans = await call('POST', `/projects/${pid}/asks/${qa.id}/answer`, { answer: word });
  check('A: answer accepted', ans.status === 'answered');
  const t = await until('A replies', () => thread(pid, agent.id), (x) => !x.busy && x.messages.at(-1)?.from !== 'user');
  console.log(show(t));
  check('A: the agent got the answer (quotes it back)', t.messages.some((m) => m.text.includes(`COLOUR=${word}`)));
  const order = t.messages.map((m) => (m.kind === 'ask' ? 'question' : m.kind === 'answer' ? 'answer' : m.from === 'user' ? 'you' : 'agent'));
  check('A: chat reads you → question → answer → reply', order.join(',') === 'you,question,answer,agent', order.join(','));
  const qaNow = (await asks(pid)).find((a) => a.id === qa.id);
  check('A: question closed (answered by user)', qaNow.status === 'answered' && qaNow.answeredBy === 'user', qaNow.status);

  /* B: a hand-started run asks and waits — then the studio restarts under it */
  const run = await call('POST', `/projects/${pid}/runs`, {
    agentId: agent.id,
    task: 'Use your ask_user tool to ask me exactly "Ship it today?" with the options Yes and No. Then reply with SHIP=<my answer>.',
    caps: { maxTurns: 20, maxBudgetUsd: 1 },
  });
  const qb = (await until('B asks', () => asks(pid), (l) => l.some((a) => a.runId === run.id && a.status === 'open'))).find(
    (a) => a.runId === run.id,
  );
  console.log(`${at()}  B: asked "${qb.question}" — restart the server now`);
  writeFileSync(STATE, JSON.stringify({ pid, agentId: agent.id, qa: qa.id, qb: qb.id, word }));
}

if (phase === 'after') {
  const { pid, agentId, qa, qb, word } = JSON.parse(readFileSync(STATE, 'utf8'));
  const list = await asks(pid);
  const a = list.find((x) => x.id === qa);
  const b = list.find((x) => x.id === qb);
  check('A: still answered after the restart, never open again', a.status === 'answered' && a.answer === word, a.status);
  check('B: withdrawn at boot (nothing resumes a hand-started run)', b.status === 'cancelled', b.status);
  check('no open questions left on the screen', list.every((x) => x.status !== 'open'));
  const pager = await call('GET', '/asks');
  check('pager has none of them', !JSON.stringify(pager).includes(qb));
  const late = await raw('POST', `/projects/${pid}/asks/${qb}/answer`, { answer: 'Yes' });
  check('answering B says it is closed (409)', late.status === 409, JSON.stringify(late.body).slice(0, 160));

  const sent = await call('POST', `/projects/${pid}/threads/${agentId}/messages`, {
    text: 'Yes, ship it. Reply with exactly GOT=ship and nothing else.',
  });
  check('typed words start a real chat turn (not swallowed as an answer)', !!sent.message.runId);
  const t = await until('reply', () => thread(pid, agentId), (x) => !x.busy && x.messages.at(-1)?.from !== 'user');
  console.log(show(t));
  check('the agent replied to it', t.messages.at(-1)?.text.includes('GOT=ship'));
}

console.log(results.every(Boolean) ? '\nALL PASS' : '\nSOME FAILED');
