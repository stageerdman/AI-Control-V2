// Phase 7 live check against a real backend (fake runner) on a throwaway data folder. Start it with
// PORT=3569 AI_STUDIO_RUNNER=fake AI_STUDIO_SELF_INSTALL=0 AI_STUDIO_HOME=<tmp>/home AI_STUDIO_SANDBOX=<tmp>/sandbox
// AI_CONTROL_HOME=<tmp>/control npm start --prefix server, with <tmp>/sandbox/aurora created; then `node live-check.mjs`.
const base = 'http://127.0.0.1:3569';
const call = async (method, p, body) => {
  const r = await fetch(base + p, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
/** Equal up to what the server fills in: an empty `why` on branch arrows, and key order. */
const norm = (g) =>
  JSON.stringify({
    ...g,
    nodes: g.nodes.map((n) => ({ ...n })),
    edges: g.edges.map(({ id, from, to, why = '', branch, signoff }) => ({ id, from, to, why, branch, signoff })),
  });
const same = (a, b) => !!a && norm(a) === norm(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (label, x) => console.log(`\n== ${label}\n${JSON.stringify(x, null, 1).slice(0, 2500)}`);
const A = (id, agent, x, y) => ({ id, type: 'agent', agent, x, y });
const D = (id, question, x, y) => ({ id, type: 'decision', question, x, y });

// OFFICE: Pete builds UI → hands to Semic; decision "Touches payments?" yes → Scar, no → Lint.
// Sign-offs: Lint signs Pete (quality); Scar signs Semic (crash-test). Starts at Pete, Scar signs last.
const office = {
  nodes: [
    A('ui', 'a-pete', 0, 0),
    A('api', 'a-semic', 200, 0),
    D('pay', 'Touches payments?', 400, 0),
    A('test', 'a-scar', 600, -80),
    A('tidy', 'a-lint', 600, 80),
  ],
  start: 'ui',
  end: 'test',
  edges: [
    { id: 'e1', from: 'ui', to: 'api', why: 'UI ready, wire the endpoint' },
    { id: 'e2', from: 'api', to: 'pay', why: 'decide who checks' },
    { id: 'e3', from: 'pay', to: 'test', branch: 'yes', why: 'run the payment suite' },
    { id: 'e4', from: 'pay', to: 'tidy', branch: 'no' },
    { id: 'e5', from: 'ui', to: 'tidy', why: 'keep it clean', signoff: 'quality' },
    { id: 'e6', from: 'api', to: 'test', why: 'payments must not break', signoff: 'crash-test' },
  ],
};
const usual = { id: 'usual', name: 'Our usual way', when: 'everything', summary: 'drawn', graph: office };
let r = await call('PUT', '/projects/aurora/workflows', { workflows: [usual] });
show(`office PUT ${r.status} gates`, r.body?.workflows?.[0]?.gates ?? r.body);
r = await call('GET', '/projects/aurora/workflows');
console.log('office reload equal:', same(r.body.workflows[0].graph, office));
// broken drawing: decision with one way out, start on a decision, outsider
const bad = { ...office, start: 'pay', edges: office.edges.filter((e) => e.id !== 'e4') };
bad.nodes = [...office.nodes.slice(0, 4), A('tidy', 'a-nobody', 600, 80)];
r = await call('PUT', '/projects/aurora/workflows', { workflows: [{ ...usual, graph: bad }] });
show(`office broken PUT ${r.status}`, r.body?.error?.details);

// TEAM (Ship-It, in the Cast): Semic starts → Pete; decision "UI change?" yes → Scar user-test, no → Semic.
const team = {
  nodes: [
    A('plan', 'a-semic', 0, 0),
    A('build', 'a-pete', 200, 0),
    D('ui', 'UI change?', 400, 0),
    A('try', 'a-scar', 600, -80),
    A('done', 'a-semic', 600, 80),
  ],
  start: 'plan',
  end: 'try',
  edges: [
    { id: 'e1', from: 'plan', to: 'build', why: 'the typed stub is ready' },
    { id: 'e2', from: 'build', to: 'ui', why: 'route the check' },
    { id: 'e3', from: 'ui', to: 'try', branch: 'yes' },
    { id: 'e4', from: 'ui', to: 'done', branch: 'no' },
    { id: 'e5', from: 'build', to: 'try', why: 'try it as a user', signoff: 'user-test' },
  ],
};
r = await call('PUT', '/teams/ship-it/workflow', { name: 'Ship-It way', graph: team });
show(`team PUT ${r.status}`, r.body?.workflow?.gates ?? r.body);
r = await call('GET', '/teams/ship-it/workflow');
console.log('team reload equal:', same(r.body.workflow?.graph, team));

// RUN WORK through both: a goal on aurora, planned by the (fake) crew brain.
console.log('folder', (await call('PATCH', '/projects/aurora', { folder: 'aurora' })).status);
r = await call('POST', '/projects/aurora/work', { goal: 'Add a voice search bar to the storefront' });
console.log('\nwork POST', r.status);
const goalId = r.body?.id ?? r.body?.goalId;
for (let i = 0; i < 40; i++) {
  r = await call('GET', `/projects/aurora/work/${goalId}`);
  if (['done', 'failed', 'cancelled'].includes(r.body?.status)) break;
  await sleep(500);
}
show(
  `goal ${r.body?.status} workflow`,
  r.body?.workflow && { id: r.body.workflow.id, hasGraph: !!r.body.workflow.graph },
);
show(
  'items: owner → sign-offs',
  (r.body?.items ?? []).map((it) => ({
    text: it.text,
    owner: it.agentId ?? it.owner,
    status: it.status,
    signoffs: (it.signoffs ?? []).map((s) => `${s.reviewer.name}:${s.kind}:${s.state}`),
  })),
);
show('signedBy', (r.body?.signedBy ?? []).map((p) => p.name));
