// Phase 7 re-check (Elon): draw with the editor's own model, save as the screens save, reload, then run work
// through the drawing and check it follows it. Server: see the start line in live-check.md (fake runner,
// throwaway data). Run: node "updates/2026-11-17 WORKFLOWS - OPEN/live-check-7.mjs"
import {
  addEdge,
  addNode,
  draftEdge,
  newGraph,
  setRole,
  toGraph,
  withDrawing,
} from '../../app/src/features/collab/flow/model.ts';

const base = `http://127.0.0.1:${process.env.CHECK_PORT ?? 3569}`;
const P = process.env.CHECK_PROJECT ?? 'aurora';
const call = async (method, p, body) => {
  const r = await fetch(base + p, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (label, ok, extra) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && extra ? ` — ${JSON.stringify(extra).slice(0, 900)}` : ''}`);
};
const bare = ({ scope: _s, teamId: _t, ...w }) => w;
/* Same drawing = same people in the same places, the same arrows (hand-offs are stored before sign-offs, so a
   reload lists them in that order and renumbers them), the same Starts here / Signs last. */
const meaning = (x) =>
  x && {
    nodes: x.nodes.map((n) => `${n.id}@${n.x},${n.y}`).sort(),
    edges: x.edges.map(({ id: _i, ...e }) => JSON.stringify(e, Object.keys(e).sort())).sort(),
    first: x.first,
    final: x.final,
  };
const sameMeaning = (a, b) => JSON.stringify(meaning(a)) === JSON.stringify(meaning(b));
const noTeams = () => false;

/* ---------- OFFICE: How we work → the usual way → Draw it */
const wfs = (await call('GET', `/projects/${P}/workflows`)).body.workflows;
const usual = wfs[0];
const [pete, semic, scar, lint] = ['a-pete', 'a-semic', 'a-scar', 'a-lint'];
let g = newGraph(pete); // Starts here: Pete
for (const x of [semic, scar, lint]) g = addNode(g, x);
g = addEdge(g, { ...draftEdge(pete, semic), why: 'UI ready, wire the endpoint' });
g = addEdge(g, { ...draftEdge(semic, lint), why: 'tidy the API', when: 'if it is only a tidy-up' }); // branch
g = addEdge(g, { ...draftEdge(pete, lint), why: 'keep it clean', signoff: 'quality' });
g = addEdge(g, {
  ...draftEdge(semic, scar),
  why: 'payments must not break',
  signoff: 'crash-test',
  when: 'if it touches payments',
}); // branch on a sign-off
g = addEdge(g, { ...draftEdge(semic, lint), why: 'second eyes', signoff: 'quality' });
g = setRole(g, scar, 'final', noTeams); // Signs last: Scar
const drawn = withDrawing(usual, g);
let r = await call('PUT', `/projects/${P}/workflows`, {
  workflows: wfs.map((w) => bare(w.id === usual.id ? drawn : w)),
});
check('office save', r.status === 200, r.body);
let back = (await call('GET', `/projects/${P}/workflows`)).body.workflows.find((w) => w.id === usual.id);
check('office reload = drawing', sameMeaning(toGraph(back), g), { got: toGraph(back), want: g });
console.log('   saved:', JSON.stringify({ first: back.first, final: back.final, steps: back.steps, gates: back.gates }));

/* ---------- TEAM: the Cast → Ship-It → How this team works → Draw it */
const teams = (await call('GET', '/teams')).body;
const list = Array.isArray(teams) ? teams : (teams?.teams ?? []);
const team = list.find((t) => (t.members ?? []).length >= 3) ?? list.find((t) => (t.members ?? []).length >= 2);
const m = team.members.map((x) => (typeof x === 'string' ? x : (x.agentId ?? x.id)));
let t = newGraph(m[0]);
t = addNode(t, m[1]);
if (m[2]) t = addNode(t, m[2]);
t = addEdge(t, { ...draftEdge(m[0], m[1]), why: 'the typed stub is ready' });
t = addEdge(t, { ...draftEdge(m[0], m[1]), why: 'try it as a user', signoff: 'user-test', when: 'if the UI changed' });
if (m[2]) t = addEdge(t, { ...draftEdge(m[1], m[2]), why: 'docs for the change' });
t = setRole(t, m[1], 'final', noTeams);
const tw = withDrawing(
  { id: 'team-way', name: `${team.name} way`.slice(0, 60), when: 'everything', summary: 'drawn', orchestratorTalksTo: 'captains', gates: [], maxSendBacks: 2 },
  t,
);
r = await call('PUT', `/teams/${team.id}/workflow`, { workflow: bare(tw) });
check(`team (${team.name}) save`, r.status === 200, r.body);
r = await call('GET', `/teams/${team.id}/workflow`);
check('team reload = drawing', !!r.body?.workflow && sameMeaning(toGraph(r.body.workflow), t), r.body);

/* ---------- RUN WORK through the office drawing */
if (process.env.CHECK_WORK === '0') {
  console.log(fails ? fails + ' FAILED' : 'all ok (drawings only)');
  process.exit(fails ? 1 : 0);
}
await call('PATCH', `/projects/${P}`, { folder: P });
r = await call('POST', `/projects/${P}/work`, {
  goal: process.env.CHECK_GOAL ?? 'Add a voice search bar to the storefront',
  caps: { maxTurns: 12, maxBudgetUsd: 0.5 },
});
const goalId = r.body?.id;
check('a goal starts', !!goalId, r.body);
let goal = null;
for (let i = 0; goalId && i < Number(process.env.CHECK_WAIT ?? 60); i++) {
  goal = (await call('GET', `/projects/${P}/work/${goalId}`)).body;
  if (['done', 'failed', 'cancelled'].includes(goal?.status)) break;
  await sleep(1000);
}
console.log(`   goal ${goal?.status}, workflow ${goal?.workflow?.id} (${goal?.workflow?.scope})`);
check('the goal runs under the drawn way', goal?.workflow?.id === usual.id && goal?.workflow?.first === pete, goal?.workflow);
for (const it of goal?.items ?? []) {
  const who = it.agentId;
  const want = g.edges.filter((e) => e.signoff && e.from === who).map((e) => e.to);
  const got = it.signoffs.map((s) => s.reviewer.id);
  console.log(`   item ${who}: ${it.status}; sign-offs ${it.signoffs.map((s) => `${s.reviewer.name}:${s.kind}:${s.state}`).join(', ') || '—'}`);
  check(`  ${who}'s sign-offs are the drawn arrows`, want.every((x) => got.includes(x)), { want, got });
  if (got.includes(scar)) check(`  ${who}: Scar (Signs last) signs last`, got.at(-1) === scar, got);
}
check('done goal names who signed', goal?.status !== 'done' || goal.signedBy.length > 0, goal?.signedBy);

/* every item's task carried the drawing in words */
const runs = (await call('GET', `/projects/${P}/runs`)).body;
const runList = Array.isArray(runs) ? runs : (runs?.runs ?? []);
const mine = runList.filter((x) => x.goalId === goalId || (x.task ?? '').includes(goal?.text ?? '\u0000'));
const tasks = await Promise.all(mine.map(async (x) => (await call('GET', `/projects/${P}/runs/${x.id}`)).body));
const itemTasks = tasks.filter((x) => (x?.task ?? '').startsWith('Goal from'));
console.log(`   ${tasks.length} runs on the goal, ${itemTasks.length} item tasks`);
const words = itemTasks.map((x) => (x.task.split('\n').find((l) => l.startsWith('How work flows on this goal:')) ?? '')).filter(Boolean);
check('every item task says how work flows', itemTasks.length > 0 && words.length === itemTasks.length, itemTasks.map((x) => x.task.slice(0, 300)));
if (words[0]) console.log(`   ${words[0]}`);
check(
  '  … starts with Pete, the hand-offs, the branch, Scar last',
  !!words[0] && /starts\./.test(words[0]) && /hands to/.test(words[0]) && /\(only if/.test(words[0]) && /signs last\.$/.test(words[0]),
  words[0],
);
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
