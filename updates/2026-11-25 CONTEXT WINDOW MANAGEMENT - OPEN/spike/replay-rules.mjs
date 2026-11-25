/* Check the savings (2026-11-25): replay the shipped rules on the recorded runs.
   The live studio still runs the build from before fixes 1 + 2, so no work has run under them yet. This applies
   the shipped rules to every recorded run and recomputes its tokens. It uses the same API as analyze.mjs.
   - Fix 1 (context/resume-rule.ts): a resumed non-orchestrator run becomes fresh unless the session it continues
     ended < 5 min ago AND was < 40 k context. Fresh cost = its turns × the median fresh context per turn for runs
     of the same length.
   - Fix 2 (FORGET_AT 60 k): a session is modelled as growing in a straight line from a cold start C0 (12 k) to a
     peak of 2·avg − C0. If the peak passes 60 k, forgetting at 60 k makes the average context per turn
     (C0 + 60 k)/2 = 36 k, plus the desk note.
   Usage: node replay-rules.mjs [baseUrl] */
const BASE = process.argv[2] ?? 'http://127.0.0.1:4319';
const get = async (p) => (await fetch(BASE + p)).json();
const RESUME_MAX = 40_000, WARM_MS = 5 * 60_000, FORGET = 60_000, C0 = 12_000, NOTE = 1_500;
const projects = await get('/projects');
const runs = (await Promise.all(projects.map((p) => get(`/projects/${p.id}/runs`)))).flat().filter((r) => r.usage);
const tot = (u) => u.input + u.output + u.cacheRead + u.cacheWrite;
const ctxOf = (r) => (r.usage.input + r.usage.cacheRead + r.usage.cacheWrite) / Math.max(1, r.turns);
const bucket = (t) => (t <= 6 ? 0 : t <= 15 ? 1 : t <= 40 ? 2 : t <= 120 ? 3 : 4);
const resumed = (r) => r.sessionId && r.sessionId !== r.id;
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const freshCtx = [0, 1, 2, 3, 4].map((b) => med(runs.filter((r) => !resumed(r) && r.turns >= 3 && bucket(r.turns) === b).map(ctxOf)));
const byId = new Map(runs.map((r) => [r.id, r]));

const out = { runs: runs.length, before: 0, after1: 0, after12: 0, fix1: { resumedAgentRuns: 0, nowFresh: 0, staysResume: 0, why: { cold: 0, big: 0, unknown: 0 } }, fix2: { runsOver60k: 0 }, byAgent: {} };
for (const r of runs) {
  const before = tot(r.usage);
  let ctx = ctxOf(r);
  if (resumed(r) && r.agentId !== 'a-pixel') {
    out.fix1.resumedAgentRuns++;
    const prev = runs
      .filter((x) => (x.sessionId === r.sessionId || x.id === r.sessionId) && x.id !== r.id && x.endedAt && x.endedAt <= r.startedAt)
      .sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1))[0] ?? byId.get(r.sessionId);
    const gap = prev?.endedAt ? Date.parse(r.startedAt) - Date.parse(prev.endedAt) : null;
    /* the old session's size when it ended: at least this run's average (it starts from it) */
    /* UNKNOWN=resume: the pessimistic bound (unknown gaps keep resuming) */
    const why = gap === null ? (process.env.UNKNOWN === 'resume' ? null : 'unknown') : gap >= WARM_MS ? 'cold' : ctx >= RESUME_MAX ? 'big' : null;
    if (why) {
      out.fix1.nowFresh++;
      out.fix1.why[why]++;
      ctx = Math.min(ctx, freshCtx[bucket(r.turns)] + NOTE);
    } else out.fix1.staysResume++;
  }
  const after1 = before - (ctxOf(r) - ctx) * r.turns;
  const peak = 2 * ctx - C0;
  let after12 = after1;
  if (peak > FORGET && r.turns >= 3) {
    out.fix2.runsOver60k++;
    after12 = after1 - Math.max(0, ctx - ((C0 + FORGET) / 2 + NOTE)) * r.turns;
  }
  out.before += before;
  out.after1 += after1;
  out.after12 += after12;
  const a = (out.byAgent[r.agentId] ??= { before: 0, after: 0 });
  a.before += before;
  a.after += after12;
}
const M = (n) => Math.round(n / 1e6);
console.log(JSON.stringify({
  ...out,
  freshCtxByLength: freshCtx.map(Math.round),
  tokensM: { before: M(out.before), afterFix1: M(out.after1), afterFix1and2: M(out.after12) },
  saved: { fix1: `${Math.round((1 - out.after1 / out.before) * 100)}%`, both: `${Math.round((1 - out.after12 / out.before) * 100)}%` },
  byAgent: Object.fromEntries(Object.entries(out.byAgent).sort((a, b) => b[1].before - a[1].before).slice(0, 6).map(([k, v]) => [k, { beforeM: M(v.before), afterM: M(v.after) }])),
}, null, 1));
