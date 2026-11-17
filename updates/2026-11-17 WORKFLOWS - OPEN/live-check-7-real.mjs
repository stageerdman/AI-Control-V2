// Phase 7 re-check with real agents (cheap model, throwaway data; run live-check-7.mjs first so the office way is
// drawn). A: a real planner plans a goal under the drawn office way — does the plan follow the drawing?
// B: the director is told to put someone in command — a temporary way that the editor draws read-only.
// Each goal is cancelled as soon as its plan is on the board (only the planner + first tasks cost anything).
import { toGraph } from '../../app/src/features/collab/flow/model.ts';

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
const show = (label, x) => console.log(`\n== ${label}\n${JSON.stringify(x, null, 1).slice(0, 3000)}`);
const items = (g) =>
  (g?.items ?? []).map((it) => ({
    text: it.text.slice(0, 90),
    owner: it.agentId,
    status: it.status,
    signoffs: it.signoffs.map((s) => `${s.reviewer.id}:${s.kind}`),
  }));
async function untilPlanned(goalId, tries = 120) {
  let g = null;
  for (let i = 0; i < tries; i++) {
    g = (await call('GET', `/projects/${P}/work/${goalId}`)).body;
    if (g?.items?.length || ['failed', 'cancelled', 'done'].includes(g?.status)) return g;
    await sleep(2000);
  }
  return g;
}
const tasksOf = async (goal) => {
  const runs = (await call('GET', `/projects/${P}/runs`)).body;
  const list = Array.isArray(runs) ? runs : (runs?.runs ?? []);
  const all = await Promise.all(list.map(async (x) => (await call('GET', `/projects/${P}/runs/${x.id}`)).body));
  return all.filter((x) => (x?.task ?? '').includes(goal.text.slice(0, 60)));
};

const which = process.argv[2] ?? 'ab';
if (which.includes('a')) {
  /* A: the office way (drawn by live-check-7.mjs) — Pete starts, hands to Semic, Scar signs last */
  const w = (await call('GET', `/projects/${P}/workflows`)).body.workflows[0];
  show('office way', { first: w.first, final: w.final, steps: w.steps, gates: w.gates });
  const r = await call('POST', `/projects/${P}/work`, {
    goal: 'Add a "Contact us" page with a small form that posts to a new /api/contact endpoint',
    caps: { maxTurns: 4, maxBudgetUsd: 0.1 },
  });
  const g = await untilPlanned(r.body.id);
  show(`A: plan (${g?.status}, workflow ${g?.workflow?.id})`, { summary: g?.summary, items: items(g) });
  await call('POST', `/projects/${P}/work/${r.body.id}/cancel`);
  const planner = (await tasksOf(g)).find((x) => /Order items this way/.test(x.task ?? ''));
  console.log('planner saw the drawing in words:', !!planner);
}
if (which.includes('b')) {
  /* B: "X, take command of … and use Y" → a temporary way */
  const office = (await call('GET', `/projects/${P}/office`)).body;
  const director = office.director;
  const before = new Set(((await call('GET', `/projects/${P}/work`)).body ?? []).map((x) => x.id));
  const said = await call('POST', `/projects/${P}/threads/${director}/messages`, {
    text: 'Pixel Pete, take command of adding a one-paragraph NOTES.md to this project, and use Captain Semicolon for it. Put it on the whiteboard now — this command is for this goal only.',
  });
  console.log('\nB: said', said.status);
  let goal = null;
  for (let i = 0; i < 90 && !goal; i++) {
    await sleep(2000);
    const list = (await call('GET', `/projects/${P}/work`)).body ?? [];
    goal = list.find((x) => !before.has(x.id)) ?? null;
  }
  if (!goal) {
    show('B: no goal; the thread says', (await call('GET', `/projects/${P}/threads/${director}/messages`)).body);
  } else {
    goal = await untilPlanned(goal.id);
    const w = goal.workflow;
    show('B: goal workflow', w && { id: w.id, scope: w.scope, lead: w.lead, crew: w.crew, gates: w.gates });
    show('B: items', items(goal));
    console.log('B: the editor draws it:', JSON.stringify(w ? toGraph(w) : null));
    await sleep(4000);
    const tasks = await tasksOf(goal);
    for (const t of tasks)
      console.log(
        `B: task for ${t.agentId}: ${(t.task ?? '').split('\n').filter((l) => /lead|How work flows/i.test(l)).join(' | ').slice(0, 400)}`,
      );
    await call('POST', `/projects/${P}/work/${goal.id}/cancel`);
  }
}
