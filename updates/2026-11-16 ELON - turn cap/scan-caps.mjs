// Elon: how runs end, how many turns they take, what the turn cap and carry-ons cost.
// Usage: node "updates/2026-11-16 ELON - turn cap/scan-caps.mjs" [projectId] (studio on :4319)
const base = process.env.STUDIO ?? 'http://127.0.0.1:4319';
const pid = process.argv[2] ?? 'ai-studio';
const runs = await (await fetch(`${base}/projects/${pid}/runs`)).json();
const desk = await (await fetch(`${base}/projects/${pid}/desk-notes`)).json();
const notes = desk.notes ?? [];
const forgot = new Set(notes.map((n) => n.runId));
const CAP = /reached the turn cap/;
const kindOf = (r) => (r.caps?.maxTurns ?? 0) + 'cap';
console.log('fields:', Object.keys(runs[0] ?? {}).join(','));
console.log('runs:', runs.length);

const groups = {};
for (const r of runs) {
  const g = (groups[kindOf(r)] ??= { runs: 0, capped: 0, ok: 0, failedOther: 0, cancelled: 0, turns: [] });
  g.runs++;
  if (r.status === 'succeeded') g.ok++;
  else if (CAP.test(r.error ?? '')) g.capped++;
  else if (r.status === 'cancelled') g.cancelled++;
  else if (r.status === 'failed') g.failedOther++;
  if (r.status === 'succeeded') g.turns.push(r.turns ?? 0);
}
const pct = (a, n) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * n))] : '-');
for (const [k, g] of Object.entries(groups)) {
  const t = g.turns.sort((a, b) => a - b);
  console.log(
    k.padEnd(7),
    `runs ${g.runs}  ok ${g.ok}  capped ${g.capped}  otherFail ${g.failedOther}  cancelled ${g.cancelled}`,
    `| succeeded turns p50 ${pct(t, 0.5)} p75 ${pct(t, 0.75)} p90 ${pct(t, 0.9)} max ${t.at(-1) ?? '-'}`,
  );
}

// carry-on chains: resumed runs (task starts "You were stopped partway")
const resumed = runs.filter((r) => /^You were stopped partway/.test(r.task ?? ''));
console.log('\nresumed (carry-on) runs:', resumed.length, ' of which capped again:', resumed.filter((r) => CAP.test(r.error ?? '')).length,
  ' succeeded:', resumed.filter((r) => r.status === 'succeeded').length);

// cost visibility
const withCost = runs.filter((r) => typeof r.costUsd === 'number');
const capped = runs.filter((r) => CAP.test(r.error ?? ''));
console.log('runs with a cost:', withCost.length, ' capped runs with a cost:', capped.filter((r) => typeof r.costUsd === 'number').length);
console.log('forgot runs:', [...forgot].map((id) => {
  const r = runs.find((x) => x.id === id);
  return r ? `${r.status}/${r.turns}t/$${r.costUsd ?? 'null'}/${(r.error ?? '').slice(0, 40)}` : id;
}).join('  '));

// context at the end of capped runs: the last-message input size isn't stored; use cacheRead/turns as a proxy
const avgCtx = (r) => Math.round(((r.usage?.cacheRead ?? 0) + (r.usage?.input ?? 0) + (r.usage?.cacheWrite ?? 0)) / Math.max(1, r.turns ?? 1) / 1000);
const ctx = capped.map(avgCtx).sort((a, b) => a - b);
console.log('capped runs, mean context per turn (k tokens): p50', pct(ctx, 0.5), 'p90', pct(ctx, 0.9), 'max', ctx.at(-1));
const ok = runs.filter((r) => r.status === 'succeeded' && (r.caps?.maxTurns ?? 0) >= 30).map(avgCtx).sort((a, b) => a - b);
console.log('succeeded 30-cap runs, mean context per turn (k): p50', pct(ok, 0.5), 'p90', pct(ok, 0.9), 'max', ok.at(-1));
const costs = runs.filter((r) => typeof r.costUsd === 'number' && (r.caps?.maxTurns ?? 0) >= 30);
const cs = costs.map((r) => r.costUsd).sort((a, b) => a - b);
const perTurn = costs.map((r) => r.costUsd / Math.max(1, r.turns)).sort((a, b) => a - b);
console.log('30-cap runs with cost:', cs.length, ' $ p50', pct(cs, 0.5)?.toFixed(2), 'p90', pct(cs, 0.9)?.toFixed(2), 'max', cs.at(-1)?.toFixed(2),
  '| $/turn p50', pct(perTurn, 0.5)?.toFixed(3), 'max', perTurn.at(-1)?.toFixed(3));
const by = {};
for (const r of runs.filter((x) => (x.caps?.maxTurns ?? 0) >= 30)) {
  const k = /^You were stopped partway/.test(r.task ?? '') ? 'carry-on' : r.kind ?? 'work';
  const b = (by[k] ??= { runs: 0, capped: 0 });
  b.runs++;
  if (CAP.test(r.error ?? '')) b.capped++;
}
console.log('by kind:', JSON.stringify(by));
// chains: carry-ons resume the same session, so one session = one piece of work; total turns per chain
const chains = {};
for (const r of runs.filter((x) => (x.caps?.maxTurns ?? 0) >= 30 && x.sessionId)) {
  const c = (chains[r.sessionId] ??= { runs: 0, turns: 0, last: null, start: r.startedAt });
  c.runs++;
  c.turns += r.turns ?? 0;
  if (!c.last || r.startedAt > c.last.startedAt) c.last = r;
}
const ch = Object.values(chains);
const ct = ch.map((c) => c.turns).sort((a, b) => a - b);
console.log('\nchains:', ch.length, ' multi-run:', ch.filter((c) => c.runs > 1).length,
  ' total turns p50', pct(ct, 0.5), 'p75', pct(ct, 0.75), 'p90', pct(ct, 0.9), 'p95', pct(ct, 0.95), 'max', ct.at(-1));
for (const n of [30, 60, 80, 100, 120]) console.log(`  chains over ${n} turns: ${ct.filter((t) => t > n).length}`);
console.log('  chains whose last run still capped:', ch.filter((c) => CAP.test(c.last.error ?? '')).length);
// team members: how failed member runs ended
const team = runs.filter((r) => r.teamId && r.status === 'failed');
console.log('team member failed runs:', team.length, ' of which turn cap:', team.filter((r) => CAP.test(r.error ?? '')).length,
  ' other:', team.filter((r) => !CAP.test(r.error ?? '')).map((r) => (r.error ?? '').slice(0, 60)));
console.log('other failures:', runs.filter((r) => r.status === 'failed' && !CAP.test(r.error ?? '')).map((r) => (r.error ?? '').slice(0, 70)));
const dur = (r) => (r.endedAt && r.startedAt ? (Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 60000 : null);
const cd = capped.map(dur).filter((x) => x != null).sort((a, b) => a - b);
console.log('capped runs minutes: p50', pct(cd, 0.5)?.toFixed?.(1), 'p90', pct(cd, 0.9)?.toFixed?.(1));
