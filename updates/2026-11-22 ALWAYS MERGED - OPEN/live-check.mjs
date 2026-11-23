// Always Merged live check (see live-check.md). node live-check.mjs start "<goal>" | watch <goalId>
// watch: polls the goal and prints every change of its items (status, stage, owner, branch, merged commit).
// CLASH=1: once an item is running in its checkout, commit a clashing Tagline line on master in the project folder
// (as if the user, or another task, changed the same line meanwhile).
// CLASH=dirty: leave an unsaved edit in README.md in the project folder instead.
import { execFileSync } from 'node:child_process';

const base = `http://127.0.0.1:${process.env.CHECK_PORT ?? 3569}`;
const P = process.env.CHECK_PROJECT ?? 'atlas';
const folder = process.env.CHECK_FOLDER; // the sandbox project's git folder
if (!folder) throw new Error('set CHECK_FOLDER to the sandbox project folder');
const call = async (method, p, body) => {
  const r = await fetch(base + p, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => null);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...a) => execFileSync('git', ['-C', folder, ...a], { encoding: 'utf8' }).trim();
const write = (file, text) =>
  execFileSync('node', ['-e', 'require("fs").writeFileSync(process.argv[1], process.argv[2])', file, text]);
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'start') {
  const g = await call('POST', `/projects/${P}/work`, { goal: arg, caps: { maxTurns: 30, maxBudgetUsd: 1 } });
  console.log(g?.id, g?.status);
  process.exit(0);
}
let disturbed = !process.env.CLASH;
let last = '';
for (let i = 0; i < 600; i++) {
  const g = await call('GET', `/projects/${P}/work/${arg}`);
  const items = g?.items ?? [];
  const view = items.map((it) => ({
    text: it.text.slice(0, 70),
    owner: it.agentId,
    status: it.status,
    stage: it.stage,
    tries: it.mergeTries,
    branch: it.workspace?.branch,
    main: it.workspace?.main,
    merged: it.mergedCommit,
    note: (it.note ?? '').slice(0, 300),
  }));
  const now = JSON.stringify({ goal: g?.status, view });
  if (now !== last) {
    console.log(`\n[${at()}] goal ${g?.status}`);
    for (const v of view) console.log(' ', JSON.stringify(v));
    last = now;
  }
  if (!disturbed && items.some((it) => it.workspace && it.status === 'running')) {
    const readme = git('show', 'HEAD:README.md');
    if (process.env.CLASH === 'dirty') {
      /* the user's own unsaved edit in the same file (another line), left uncommitted in the project folder */
      write(`${folder}/README.md`, readme.replace(/\s*$/, '\n- Unsaved edit by the user.\n'));
      console.log(`[${at()}] DIRTY: unsaved edit in README.md: [${git('status', '--short')}]`);
    } else {
      write(`${folder}/README.md`, readme.replace(/^Tagline: .*$/m, 'Tagline: notes that glow in the dark.'));
      git('-c', 'user.name=User', '-c', 'user.email=user@example.invalid', 'commit', '-qam', 'User: new tagline');
      console.log(`[${at()}] CLASH committed on master: ${git('log', '--oneline', '-1')}`);
    }
    disturbed = true;
  }
  if (['done', 'failed', 'cancelled'].includes(g?.status)) break;
  await sleep(3000);
}
console.log(`\nmaster log:\n${git('log', '--oneline', '--graph', '-12', 'master')}`);
console.log(`folder status: [${git('status', '--short')}] on ${git('rev-parse', '--abbrev-ref', 'HEAD')}`);
console.log(`README on master:\n${git('show', 'master:README.md')}`);
console.log(`branches: ${git('branch', '--list')}`);
