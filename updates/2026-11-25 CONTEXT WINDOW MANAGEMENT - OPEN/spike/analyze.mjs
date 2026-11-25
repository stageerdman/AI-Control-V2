/* Research spike (Phase 0): where do the studio's tokens and context go?
   Reads the running studio's own API only (runs, performance, chat messages) and the
   real stream fixtures in server/test/fixtures. Prints one JSON summary.
   Usage: node analyze.mjs [baseUrl] > findings.json */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4319';
const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, '../../../server/test/fixtures');

const get = async (p) => {
  const r = await fetch(BASE + p);
  return r.ok ? r.json() : null;
};
const tot = (u) => (u ? u.input + u.output + u.cacheRead + u.cacheWrite : 0);
const add = (m, k, f) => {
  m[k] ??= { runs: 0, turns: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, briefChars: 0 };
  f(m[k]);
};
const sumInto = (o, r) => {
  o.runs++;
  o.turns += r.turns ?? 0;
  o.tokens += tot(r.usage);
  for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) o[k] += r.usage?.[k] ?? 0;
  o.briefChars += r.task?.length ?? 0;
};

async function messagesOf(projectId, runId) {
  const m =
    (await get(`/projects/${projectId}/chats/${runId}/messages`)) ?? (await get(`/chats/${runId}/messages`));
  return Array.isArray(m) ? m : (m?.messages ?? []);
}

/* ---- 1. runs + performance, every project ---- */
const projects = (await get('/projects')) ?? [];
const byAgent = {};
const byKind = {};
const byStatus = {};
const perfAgents = {};
const restarts = { forget: 0, limit: 0, runsWithRestart: 0, runsChecked: 0 };
const sessions = { fresh: 0, resumed: 0 };
const caps = {};
const briefs = [];
const contextPerTurn = []; // (input+cacheRead+cacheWrite)/turns per run, runs with turns >= 3
const bigRuns = [];
const shape = { byTurns: {}, bySession: {}, byKindCost: {}, byAgentCost: {} };
let allRuns = 0;
let perfTotals = { tokens: 0, requests: 0, ms: 0, unmeasured: 0 };
const boilerplate = {
  checkout: /You work in your own checkout on branch/,
  runLine: /record it in `\.project` as one line `run:/,
  featureTool: /Use the `feature` tool to read it, set its pct/,
};
const boilerHits = { checkout: 0, runLine: 0, featureTool: 0 };
let boilerChars = 0;

for (const p of projects) {
  const runs = (await get(`/projects/${p.id}/runs`)) ?? [];
  allRuns += runs.length;
  for (const r of runs) {
    sumInto((byAgent[r.agentId] ??= { runs: 0, turns: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, briefChars: 0 }), r);
    add(byKind, r.kind ?? 'none', (o) => sumInto(o, r));
    add(byStatus, r.status, (o) => sumInto(o, r));
    const cap = r.caps?.maxTurns ?? 0;
    add(caps, String(cap), (o) => sumInto(o, r));
    if (r.sessionId && r.sessionId !== r.id) sessions.resumed++;
    else sessions.fresh++;
    briefs.push(r.task?.length ?? 0);
    for (const [k, re] of Object.entries(boilerplate)) if (re.test(r.task ?? '')) boilerHits[k]++;
    const i = (r.task ?? '').indexOf('You work in your own checkout on branch');
    if (i >= 0) boilerChars += (r.task.length - i);
    if ((r.turns ?? 0) >= 3 && r.usage) {
      const ctx = (r.usage.input + r.usage.cacheRead + r.usage.cacheWrite) / r.turns;
      contextPerTurn.push({ ctx, kind: r.kind, agent: r.agentId, turns: r.turns });
    }
    /* cost and shape: by turn bucket, fresh vs resumed, per kind */
    const bucket = r.turns <= 6 ? '0-6' : r.turns <= 15 ? '7-15' : r.turns <= 40 ? '16-40' : r.turns <= 120 ? '41-120' : '121+';
    const resumed = !!(r.sessionId && r.sessionId !== r.id);
    for (const [m, k] of [
      [shape.byTurns, bucket],
      [shape.bySession, resumed ? 'resumed' : 'fresh'],
      [shape.byKindCost, r.kind ?? 'none'],
      [shape.byAgentCost, r.agentId],
    ]) {
      m[k] ??= { runs: 0, turns: 0, tokens: 0, cacheWrite: 0, cacheRead: 0, output: 0, costUsd: 0 };
      m[k].runs++;
      m[k].turns += r.turns ?? 0;
      m[k].tokens += tot(r.usage);
      m[k].cacheWrite += r.usage?.cacheWrite ?? 0;
      m[k].cacheRead += r.usage?.cacheRead ?? 0;
      m[k].output += r.usage?.output ?? 0;
      m[k].costUsd += r.costUsd ?? 0;
    }
    bigRuns.push({ id: r.id, project: p.id, agent: r.agentId, kind: r.kind, turns: r.turns, tokens: tot(r.usage), status: r.status, error: r.error?.slice(0, 80) ?? null });
    /* fresh restarts inside one run: system messages of kind forget / limit */
    if ((r.turns ?? 0) >= 20) {
      const msgs = await messagesOf(p.id, r.id);
      restarts.runsChecked++;
      let any = false;
      for (const m of msgs) {
        const k = m.meta?.kind ?? m.kind;
        if (m.role === 'system' && (k === 'forget' || k === 'limit')) {
          restarts[k]++;
          any = true;
        }
      }
      if (any) restarts.runsWithRestart++;
    }
  }
  const perf = await get(`/projects/${p.id}/performance?range=all&tz=0`);
  if (perf) {
    perfTotals.tokens += perf.totals.tokens;
    perfTotals.requests += perf.totals.requests;
    perfTotals.ms += perf.totals.ms;
    perfTotals.unmeasured += perf.unmeasured ?? 0;
    for (const a of perf.agents) {
      const o = (perfAgents[a.agentId] ??= { tokens: 0, fresh: 0, reread: 0, requests: 0, turns: 0, stopped: 0, task: 0, call: 0, chat: 0, ms: 0, thinkingMs: 0 });
      o.tokens += a.tokens;
      o.fresh += a.split.fresh;
      o.reread += a.split.reread;
      o.requests += a.requests;
      o.turns += a.turns;
      o.stopped += a.stopped;
      o.task += a.asked.task;
      o.call += a.asked.call;
      o.chat += a.asked.chat;
      o.ms += a.ms;
      o.thinkingMs += a.kinds?.thinking ?? 0;
    }
  }
}

/* ---- 2. the real stream fixtures: first-turn (cold) context, growth per turn, tool list ---- */
const fixtures = [];
for (const f of readdirSync(FIX).filter((x) => x.startsWith('live-'))) {
  const lines = readFileSync(join(FIX, f), 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  const init = lines.find((l) => l.type === 'system' && l.subtype === 'init');
  const seen = new Map();
  for (const l of lines) if (l.type === 'assistant' && l.message?.usage) seen.set(l.message.id, l.message.usage);
  const ctx = [...seen.values()].map((u) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
  const first = [...seen.values()][0];
  fixtures.push({
    file: f,
    tools: init?.tools?.length ?? null,
    mcpTools: init?.tools?.filter((t) => t.startsWith('mcp__')).length ?? null,
    turns: ctx.length,
    firstContext: ctx[0] ?? null,
    firstCacheWrite: first?.cache_creation_input_tokens ?? null,
    firstCacheRead: first?.cache_read_input_tokens ?? null,
    lastContext: ctx.at(-1) ?? null,
    growthPerTurn: ctx.length > 1 ? Math.round((ctx.at(-1) - ctx[0]) / (ctx.length - 1)) : null,
  });
}

const pct = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : 0;
};
const ctxs = contextPerTurn.map((c) => c.ctx);

const only = process.argv[3]; // optional: print one key only
const pick = (o) => (only ? o[only] : o);
console.log(
  JSON.stringify(
    pick({
      at: new Date().toISOString(),
      projects: projects.length,
      runs: allRuns,
      performanceTotals: perfTotals,
      performanceByAgent: perfAgents,
      runsByAgent: byAgent,
      runsByKind: byKind,
      runsByStatus: byStatus,
      runsByTurnCap: caps,
      sessions,
      restarts,
      briefChars: { median: pct(briefs, 0.5), p90: pct(briefs, 0.9), max: pct(briefs, 1) },
      briefBoilerplate: { ...boilerHits, chars: boilerChars },
      avgContextPerTurn: { median: pct(ctxs, 0.5), p90: pct(ctxs, 0.9), max: pct(ctxs, 1) },
      shape,
      topRuns: bigRuns.sort((a, b) => b.tokens - a.tokens).slice(0, 15),
      fixtures,
    }),
    null,
    1,
  ),
);
