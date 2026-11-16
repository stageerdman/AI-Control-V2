// HR: scan studio runs + desk notes to see who forgets and who should have.
const base = 'http://127.0.0.1:4319';
const pid = process.argv[2] ?? 'ai-studio';
const runs = await (await fetch(`${base}/projects/${pid}/runs`)).json();
const desk = await (await fetch(`${base}/projects/${pid}/desk-notes`)).json();
const agents = await (await fetch(`${base}/agents`)).json().catch(() => []);
const nameOf = Object.fromEntries((Array.isArray(agents) ? agents : agents.agents ?? []).map((a) => [a.id, a.name]));
const notes = desk.notes ?? [];
const forgetsByRun = {};
for (const n of notes) forgetsByRun[n.runId] = (forgetsByRun[n.runId] ?? 0) + 1;
console.log('desk note keys:', Object.keys(notes[0] ?? {}).join(','));
const by = {};
for (const r of runs) {
  const k = nameOf[r.agentId] ?? r.agentId;
  const b = (by[k] ??= { runs: 0, kinds: {}, turns: 0, cost: 0, forgets: 0, runsForgot: 0, long: 0, longNoForget: 0, maxTurns: 0 });
  b.runs++;
  b.kinds[r.kind ?? 'work'] = (b.kinds[r.kind ?? 'work'] ?? 0) + 1;
  b.turns += r.turns ?? 0;
  b.cost += r.costUsd ?? 0;
  b.maxTurns = Math.max(b.maxTurns, r.turns ?? 0);
  const f = forgetsByRun[r.id] ?? 0;
  b.forgets += f;
  if (f) b.runsForgot++;
  // "long": many turns or heavy cache reads — likely past the 120k nudge line
  const big = (r.turns ?? 0) >= 60 || (r.usage?.cacheRead ?? 0) >= 5_000_000;
  if (big) b.long++;
  if (big && !f) b.longNoForget++;
}
console.table(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { ...v, kinds: JSON.stringify(v.kinds), cost: v.cost.toFixed(2) }])));
console.log('\nTop 15 runs by turns:');
for (const r of [...runs].sort((a, b) => (b.turns ?? 0) - (a.turns ?? 0)).slice(0, 15))
  console.log(
    String(r.turns).padStart(4),
    'turns',
    `$${(r.costUsd ?? 0).toFixed(2)}`.padStart(7),
    `cacheRead ${Math.round((r.usage?.cacheRead ?? 0) / 1e6)}M`.padEnd(14),
    `forgets ${forgetsByRun[r.id] ?? 0}`,
    (nameOf[r.agentId] ?? r.agentId).padEnd(14),
    r.kind ?? 'work',
    r.status,
    '|',
    r.task.slice(0, 60).replace(/\n/g, ' '),
  );
