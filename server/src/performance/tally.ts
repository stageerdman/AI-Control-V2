/* Agent performance (pure): an office's spans → how each agent worked in a window — time, tokens, requests,
   how their work ended — with the previous window's totals for trends and a per-local-day breakdown.
   A span counts where it started: its time, tokens and the request all land on that day, so days and windows
   always add up and nothing is counted twice. No money anywhere. */
import { type Asked, firstStart, type Span, spanMs, spanTokens, WORK_KINDS, type WorkKind } from './spans.ts';
import { dayLabel, dayStart, daysOf, type Window } from './window.ts';

/** The three measures of the sheet. */
export type Measures = { ms: number; tokens: number; requests: number };

export type AgentPerformance = Measures & {
  agentId: string;
  turns: number;
  /** fresh = input + output + cache write; reread = cache read. */
  split: { fresh: number; reread: number };
  asked: Record<Asked, number>;
  /** Ended failed or cancelled (a turn cap, a stop, a restart). */
  stopped: number;
  /** The latest start of their work on this office, any time. */
  lastAskedAt: string;
  /** Working right now. */
  live: boolean;
  /** Their totals in the window before; null for all time. */
  previous: Measures | null;
  /** Their time in the window by kind of work (ms). */
  kinds: Record<WorkKind, number>;
};

export type DayPerformance = Measures & { day: string; byAgent: Record<string, Measures> };

export type Performance = {
  range: Window['range'];
  from: string;
  to: string;
  /** The first work on this office, null before any. */
  since: string | null;
  /** Spans going on right now. */
  live: number;
  totals: Measures;
  previous: Measures | null;
  /** Spans in the window without a token count (older crew calls): their tokens count as 0. */
  unmeasured: number;
  /** Everyone who ever worked here, most first by time in the window. */
  agents: AgentPerformance[];
  days: DayPerformance[];
};

const zero = (): Measures => ({ ms: 0, tokens: 0, requests: 0 });

function add(m: Measures, s: Span, nowMs: number): void {
  m.ms += spanMs(s, nowMs);
  m.tokens += spanTokens(s);
  m.requests++;
}

const within = (s: Span, w: { from: number; to: number }) => {
  const at = Date.parse(s.start);
  return at >= w.from && at < w.to;
};

function agentOf(agentId: string, w: Window): AgentPerformance {
  return {
    agentId,
    ...zero(),
    turns: 0,
    split: { fresh: 0, reread: 0 },
    asked: { task: 0, call: 0, chat: 0 },
    stopped: 0,
    lastAskedAt: '',
    live: false,
    previous: w.previous ? zero() : null,
    kinds: Object.fromEntries(WORK_KINDS.map((k) => [k, 0])) as Record<WorkKind, number>,
  };
}

/** Everything the "How the team works" sheet reads for one office and window. */
export function tally(spans: readonly Span[], w: Window, nowMs: number): Performance {
  const agents = new Map<string, AgentPerformance>();
  const days = new Map(daysOf(w).map((d) => [d, { ...zero(), byAgent: {} as Record<string, Measures> }]));
  const totals = zero();
  const previous = w.previous ? zero() : null;
  let live = 0;
  let unmeasured = 0;

  for (const s of spans) {
    const a = agents.get(s.agentId) ?? agentOf(s.agentId, w);
    agents.set(s.agentId, a);
    if (s.start > a.lastAskedAt) a.lastAskedAt = s.start;
    if (s.outcome === 'live') {
      live++;
      a.live = true;
    }
    if (w.previous && within(s, w.previous)) {
      add(previous as Measures, s, nowMs);
      add(a.previous as Measures, s, nowMs);
    }
    if (!within(s, w)) continue;

    add(totals, s, nowMs);
    add(a, s, nowMs);
    a.kinds[s.kind] += spanMs(s, nowMs);
    a.turns += s.turns;
    a.split.reread += s.tokens?.cacheRead ?? 0;
    a.split.fresh += spanTokens(s) - (s.tokens?.cacheRead ?? 0);
    a.asked[s.asked]++;
    if (s.outcome === 'stopped') a.stopped++;
    if (!s.tokens) unmeasured++;

    const day = days.get(dayStart(Date.parse(s.start), w.tz));
    if (day) {
      add(day, s, nowMs);
      day.byAgent[s.agentId] ??= zero();
      add(day.byAgent[s.agentId] as Measures, s, nowMs);
    }
  }

  return {
    range: w.range,
    from: new Date(w.from).toISOString(),
    to: new Date(w.to).toISOString(),
    since: firstStart(spans),
    live,
    totals,
    previous,
    unmeasured,
    agents: [...agents.values()].sort(
      (x, y) => y.ms - x.ms || y.requests - x.requests || x.agentId.localeCompare(y.agentId),
    ),
    days: [...days].map(([start, d]) => ({ day: dayLabel(start, w.tz), ...d })),
  };
}
