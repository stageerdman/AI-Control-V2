// Phase 5b live check (master's shape): the drawings the editor's own model builds
// (app/src/features/collab/flow/model.ts — toGraph / toDrawing / withDrawing), sent the way the screens
// send them (officeApi.saveWorkflows, castApi.teams.saveWorkflow), against a real server with the fake
// runner (start it as in live-check.md). Each one must reload exactly as drawn; a refused one must
// come back with paths that land on an arrow or a node (pinIssues). Then a goal's temporary workflow
// must draw (read-only, on top of the office way).
// Run: node "updates/2026-11-17 WORKFLOWS - OPEN/live-check-5b.mjs"  (Node ≥ 23: imports the .ts directly)
import {
  addEdge,
  addNode,
  draftEdge,
  issueCount,
  newGraph,
  pinIssues,
  sameGraph,
  setRole,
  toDrawing,
  toGraph,
  withDrawing,
} from '../../app/src/features/collab/flow/model.ts';

const base = 'http://127.0.0.1:3569';
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
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && extra ? ` — ${JSON.stringify(extra).slice(0, 800)}` : ''}`);
};
/* what officeApi.saveWorkflows / castApi.teams.saveWorkflow put on the wire */
const bare = ({ scope: _s, teamId: _t, ...w }) => w;
const noTeams = () => false;

/* ---------- office: How we work → the usual way → Draw it */
let view = await call('GET', '/projects/aurora/workflows');
check('office GET', view.status === 200, view);
const wfs = view.body.workflows;
const office = await call('GET', '/projects/aurora/office');
/* as OfficePage builds it: teams' members, solo, guests — never the director */
const onProject = [
  ...new Set([
    ...(office.body?.teams ?? []).flatMap((t) => t.members ?? []),
    ...(office.body?.solo ?? []),
    ...(office.body?.guests ?? []).map((x) => x.agentId),
  ]),
].filter((x) => typeof x === 'string' && x !== office.body?.director);
console.log('on the project:', onProject.join(', '));
const [a, b, c] = onProject.length >= 3 ? onProject : ['a-pete', 'a-semic', 'a-scar'];
const usual = wfs[0];
let g = toGraph(usual) ?? newGraph(a);
console.log(`the usual way opens with ${g.nodes.length} nodes, ${g.edges.length} arrows`);
/* the user draws: three people, two hand-offs (one only-when), a sign-off, Starts here + Signs last */
g = { ...newGraph(a), nodes: newGraph(a).nodes };
for (const x of [b, c]) g = addNode(g, x);
g = { ...g, nodes: g.nodes.map((n, i) => ({ ...n, x: 120 + i * 300, y: 200 + (i % 2) * 140 })) };
g = addEdge(g, { ...draftEdge(a, b), why: 'UI ready, wire the endpoint' });
g = addEdge(g, { ...draftEdge(b, c), why: 'run the payment suite', when: 'if it touches payments' });
g = addEdge(g, { ...draftEdge(b, c), why: 'payments must not break', signoff: 'crash-test' });
g = setRole(g, c, 'final', noTeams);
const drawn = withDrawing(usual, g);
let r = await call('PUT', '/projects/aurora/workflows', {
  workflows: wfs.map((w) => bare(w.id === usual.id ? drawn : w)),
});
check('office save', r.status === 200, r.body);
r = await call('GET', '/projects/aurora/workflows');
const back = r.body.workflows.find((w) => w.id === usual.id);
check('office reload = what was drawn', sameGraph(toGraph(back), g), { got: toGraph(back), want: g });
check(
  'the saved fields are the drawing',
  JSON.stringify(toDrawing(toGraph(back))) === JSON.stringify(toDrawing(g)),
  toDrawing(toGraph(back)),
);

/* a refused drawing: Signs last on someone who signs nothing, a hand-off to oneself */
const broken = { ...g, final: a, edges: [...g.edges, { id: 'e9', from: c, to: c, why: 'loop' }] };
r = await call('PUT', '/projects/aurora/workflows', {
  workflows: wfs.map((w) => bare(w.id === usual.id ? withDrawing(usual, broken) : w)),
});
const idx = wfs.findIndex((w) => w.id === usual.id);
const details = r.body?.error?.details ?? [];
const pinned = pinIssues(broken, details, `workflows.${idx}`);
check('broken → refused (409/422) with paths', [409, 422].includes(r.status) && details.length > 0, r.body);
check('the self-arrow is pinned to its row', !!pinned.edges.e9, { details, pinned });
check('every detail found a home', issueCount(pinned) === details.length, pinned);
console.log('   server said:', details.map((d) => `${d.path}: ${d.message}`).join(' | '));
r = await call('GET', '/projects/aurora/workflows');
check('a refused save changes nothing', sameGraph(toGraph(r.body.workflows[idx]), g));

/* ---------- team: the Cast → a team → How this team works → Draw it */
const teams = await call('GET', '/teams');
const list = Array.isArray(teams.body) ? teams.body : (teams.body?.teams ?? []);
const team = list.find((t) => (t.members ?? []).length >= 2);
check('a team with two members', !!team, teams.body);
if (team) {
  const m = team.members.map((x) => (typeof x === 'string' ? x : (x.agentId ?? x.id)));
  r = await call('GET', `/teams/${team.id}/workflow`);
  check('team GET', r.status === 200, r.body);
  let t = addNode(newGraph(m[0]), m[1]);
  t = addEdge(t, { ...draftEdge(m[0], m[1]), why: 'the typed stub is ready' });
  t = addEdge(t, { ...draftEdge(m[0], m[1]), why: 'try it as a user', signoff: 'user-test' });
  t = setRole(t, m[1], 'final', noTeams);
  /* as TeamWay.tsx starts a team's first way */
  const fresh = {
    id: 'team-way',
    name: `${team.name} way`.slice(0, 60),
    when: 'everything',
    summary: `How ${team.name} hands work on and signs it off.`,
    orchestratorTalksTo: 'captains',
    gates: [],
    maxSendBacks: 2,
  };
  const tw = withDrawing(fresh, t);
  r = await call('PUT', `/teams/${team.id}/workflow`, { workflow: bare(tw) });
  check('team save', r.status === 200, r.body);
  r = await call('GET', `/teams/${team.id}/workflow`);
  check('team reload = what was drawn', !!r.body?.workflow && sameGraph(toGraph(r.body.workflow), t), {
    got: r.body?.workflow,
    want: t,
  });
  const outsider = addEdge(addNode(t, 'a-nobody-here'), { ...draftEdge(m[0], 'a-nobody-here'), why: 'x' });
  r = await call('PUT', `/teams/${team.id}/workflow`, { workflow: bare(withDrawing(tw, outsider)) });
  const p = pinIssues(outsider, r.body?.error?.details, 'workflow');
  check('team outsider → refused, pinned', r.status >= 400 && issueCount(p) > 0, {
    status: r.status,
    details: r.body?.error?.details,
  });
  console.log('   server said:', (r.body?.error?.details ?? []).map((d) => `${d.path}: ${d.message}`).join(' | '));
}

/* ---------- temporary: a goal's own way, drawn read-only on top of the office way */
await call('PATCH', '/projects/aurora', { folder: 'aurora' });
r = await call('POST', '/projects/aurora/work', { goal: 'Add a voice search bar to the storefront' });
const goalId = r.body?.id ?? r.body?.goalId;
check('a goal starts', !!goalId, r.body);
let goal = null;
for (let i = 0; goalId && i < 40; i++) {
  goal = (await call('GET', `/projects/aurora/work/${goalId}`)).body;
  if (goal?.workflow) break;
  await sleep(500);
}
const gw = goal?.workflow;
console.log('   goal workflow:', gw ? `${gw.id} (${gw.scope ?? 'no scope'})` : 'none');
check('the goal carries its workflow', !!gw, goal);
if (gw) check('it draws', !!toGraph({ gates: [], ...gw }), gw);
/* The fake runner never calls set_workflow, so a goal here rides the office way. A temporary way
   (lead + crew, scope 'temporary') drawing read-only is covered by model.test.ts and
   WorkflowEditor.test.tsx; on a real runner it shows as "This goal's own way" on How we work. */

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
