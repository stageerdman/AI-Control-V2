/* Research spike: resumed sessions (--resume) and failed runs.
   A resumed run's sessionId is the run whose session it continued (fresh runs use their own id).
   Prints: resumes by kind, the gap since that session last ended (prompt cache lives 5 min – 1 h),
   the cache written on resume, and why runs failed. Usage: node resumes.mjs [baseUrl] */
const BASE = process.argv[2] ?? 'http://127.0.0.1:4319';
const get = async (p) => (await fetch(BASE + p)).json();
const projects = await get('/projects');
const runs = (await Promise.all(projects.map((p) => get(`/projects/${p.id}/runs`)))).flat();
const byId = new Map(runs.map((r) => [r.id, r]));
const byKind = {};
const gaps = { '<5m': 0, '5m-1h': 0, '>1h': 0, unknown: 0 };
const perTurn = { resumed: [], fresh: [] };
for (const r of runs) {
  const resumed = r.sessionId && r.sessionId !== r.id;
  if (r.turns >= 3) perTurn[resumed ? 'resumed' : 'fresh'].push((r.usage.cacheRead + r.usage.cacheWrite + r.usage.input) / r.turns);
  if (!resumed) continue;
  const k = `${r.kind}/${r.agentId === 'a-pixel' ? 'orchestrator' : 'agent'}`;
  byKind[k] = (byKind[k] ?? 0) + 1;
  /* the session's newest earlier run: the one that last ended before this one started */
  const prev = runs
    .filter((x) => (x.sessionId === r.sessionId || x.id === r.sessionId) && x.id !== r.id && x.endedAt && x.endedAt <= r.startedAt)
    .sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1))[0] ?? byId.get(r.sessionId);
  if (!prev?.endedAt) gaps.unknown++;
  else {
    const m = (Date.parse(r.startedAt) - Date.parse(prev.endedAt)) / 60000;
    gaps[m < 5 ? '<5m' : m < 60 ? '5m-1h' : '>1h']++;
  }
}
const errors = {};
for (const r of runs.filter((x) => x.status === 'failed')) {
  const e = (r.error ?? 'none').replace(/\d+/g, 'N').slice(0, 70);
  errors[e] ??= { runs: 0, tokens: 0 };
  errors[e].runs++;
  errors[e].tokens += r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite;
}
const med = (xs) => Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0);
console.log(JSON.stringify({
  resumedByKind: byKind,
  gapSincePreviousSession: gaps,
  medianContextPerTurn: { resumed: med(perTurn.resumed), fresh: med(perTurn.fresh) },
  failedBy: Object.fromEntries(Object.entries(errors).sort((a, b) => b[1].tokens - a[1].tokens).slice(0, 10)),
}, null, 1));
