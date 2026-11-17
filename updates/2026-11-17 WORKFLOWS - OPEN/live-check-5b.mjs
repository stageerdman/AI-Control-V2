// Phase 5b live check: the drawings the editor's own model builds (app/src/features/collab/flow/model.ts),
// sent the way the screens send them (officeApi.saveWorkflows, castApi.teams.saveWorkflow), against a
// real server with the fake runner (start it as in live-check.mjs). Then a broken drawing: every 422
// detail must land on an arrow or a node of the drawing that was sent (pinIssues).
// Run: node "updates/2026-11-17 WORKFLOWS - OPEN/live-check-5b.mjs"  (Node ≥ 23: imports the .ts directly)
import {
  addAgent,
  addDecision,
  addEdge,
  draftEdge,
  issueCount,
  newGraph,
  pinIssues,
  sameGraph,
  seedFromGates,
  setRole,
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
let fails = 0;
const check = (label, ok, extra) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${JSON.stringify(extra).slice(0, 600)}` : ''}`);
};
/* what officeApi.saveWorkflows puts on the wire */
const wire = (list) =>
  list.map(({ id, name, when, orchestratorTalksTo, gates, maxSendBacks, summary, graph }) => ({
    id,
    name,
    when,
    orchestratorTalksTo,
    gates,
    maxSendBacks,
    summary,
    ...(graph ? { graph } : {}),
  }));

/* ---------- office: How we work → the usual way → Draw it */
const view = await call('GET', '/projects/aurora/workflows');
check('office GET', view.status === 200, view.status);
const wfs = view.body.workflows;
const usual = wfs[0];
const office = await call('GET', '/projects/aurora/office');
/* as OfficePage builds it: teams, solo, guests — never the director */
const onProject = [
  ...new Set([
    ...(office.body?.teams ?? []).flatMap((t) => t.members),
    ...(office.body?.solo ?? []),
    ...(office.body?.guests ?? []).map((x) => x.agentId),
  ]),
].filter((x) => x && x !== office.body?.director);
console.log('on the project:', onProject.join(', '));
const [a, b, c] = onProject;
const seed = seedFromGates(usual.gates, (x) => onProject.includes(x));
let g = seed.graph ?? newGraph(a);
console.log(`seeded from ${usual.gates.length} gates: ${g.nodes.length} nodes, ${g.edges.length} arrows, ${seed.left} can't be drawn`);
/* the user adds people, a decision, arrows, and sets Signs last */
const idOf = (agent) => g.nodes.find((n) => n.type === 'agent' && n.agent === agent)?.id;
for (const x of [a, b, c]) if (!idOf(x)) g = addAgent(g, x);
g = addDecision(g, 'Touches payments?');
const d = g.nodes[g.nodes.length - 1].id;
g = addEdge(g, { ...draftEdge(g, idOf(a), idOf(b)), why: 'UI ready, wire the endpoint' });
g = addEdge(g, { ...draftEdge(g, idOf(b), d), why: 'decide who checks' });
g = addEdge(g, draftEdge(g, d, idOf(c))); // "yes"
g = addEdge(g, draftEdge(g, d, idOf(a))); // "no"
g = addEdge(g, { from: idOf(b), to: idOf(c), why: 'payments must not break', signoff: 'crash-test' });
g = setRole(setRole(g, idOf(a), 'start'), idOf(c), 'end');
let r = await call('PUT', '/projects/aurora/workflows', {
  workflows: wire(wfs.map((w) => (w.id === usual.id ? { ...w, graph: g } : w))),
});
check('office save', r.status === 200, r.status === 200 ? r.body.workflows[0].gates : r.body);
r = await call('GET', '/projects/aurora/workflows');
check('office reload = what was drawn', sameGraph(r.body.workflows[0].graph, g), r.body.workflows[0].graph);
check('sign-off arrows became the checks', r.body.workflows[0].gates.some((x) => x.kind === 'crash-test'));

/* a broken drawing: Starts here on a decision, a decision with one way out, an arrow with no why */
const broken = {
  ...g,
  start: d,
  edges: [...g.edges.filter((e) => e.branch !== 'no'), { id: 'e99', from: idOf(c), to: idOf(a), why: '' }],
};
r = await call('PUT', '/projects/aurora/workflows', {
  workflows: wire(wfs.map((w) => (w.id === usual.id ? { ...w, graph: broken } : w))),
});
const idx = wfs.findIndex((w) => w.id === usual.id);
const pinned = pinIssues(broken, r.body?.error?.details, `workflows.${idx}.graph`);
check('broken → 422 with every problem', r.status === 422, r.body?.error?.details);
check('the empty why is pinned to its arrow', !!pinned.edges.e99, pinned);
check('every detail found a home', issueCount(pinned) === (r.body?.error?.details ?? []).length, pinned);

/* ---------- team: the Cast → a team → How this team works → Draw it */
const teams = await call('GET', '/teams');
const team = (teams.body?.teams ?? teams.body ?? []).find((t) => t.members?.length >= 2);
check('a team with two members', !!team, teams.body);
if (team) {
  const m = team.members.map((x) => x.agentId ?? x.id ?? x);
  r = await call('GET', `/teams/${team.id}/workflow`);
  check('team GET', r.status === 200, r.body);
  let t = addAgent(newGraph(m[0]), m[1]);
  t = addEdge(t, { ...draftEdge(t, 'n1', 'n2'), why: 'the typed stub is ready' });
  t = addEdge(t, { from: 'n1', to: 'n2', why: 'try it as a user', signoff: 'user-test' });
  t = setRole(t, 'n2', 'end');
  r = await call('PUT', `/teams/${team.id}/workflow`, { name: `${team.name} way`.slice(0, 60), graph: t });
  check('team save', r.status === 200, r.body);
  r = await call('GET', `/teams/${team.id}/workflow`);
  check('team reload = what was drawn', sameGraph(r.body.workflow?.graph, t), r.body.workflow?.graph);
  const outsider = { ...t, nodes: [t.nodes[0], { ...t.nodes[1], agent: 'a-nobody-here' }] };
  r = await call('PUT', `/teams/${team.id}/workflow`, { name: 'x', graph: outsider });
  const p = pinIssues(outsider, r.body?.error?.details, 'graph');
  check('team outsider → refused and pinned to the node', r.status >= 400 && !!p.nodes.n2, {
    status: r.status,
    details: r.body?.error?.details,
  });
}
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
