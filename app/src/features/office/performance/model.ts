/* How the team works (pure): the performance read → what the sheet says. Numbers in words, trends, the bars
   of the chart, the "Worth a look" flags and the team list. No React, no I/O — every rule is tested here.
   Design: updates/2026-11-16 AGENT PERFORMANCE - OPEN/design.md. No money anywhere. */
import type { AgentPerformance, Measures, Performance, PerfRange, WorkKind } from '../api';
import { ago, worked } from '../time';

export type Measure = keyof Measures;
export const MEASURES: { id: Measure; label: string; word: string }[] = [
  { id: 'ms', label: 'Agent time', word: 'agent time' },
  { id: 'tokens', label: 'Tokens', word: 'tokens' },
  { id: 'requests', label: 'Requests', word: 'requests' },
];
export const RANGES: { id: PerfRange; label: string; words: string }[] = [
  { id: '7d', label: '7 days', words: 'the last 7 days' },
  { id: '30d', label: '30 days', words: 'the last 30 days' },
  { id: 'all', label: 'All time', words: 'all time' },
];
export const KIND_LABELS: Record<WorkKind, string> = {
  thinking: 'Thinking & planning',
  building: 'Coding & building',
  reviewing: 'Reviewing',
  research: 'Research & reports',
  setup: 'Setup',
};

/** 920 · 12k · 840k · 4.1M · 12M */
export function tokensText(n: number): string {
  const t = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  if (t < 1000) return String(t);
  if (Math.round(t / 1000) < 1000) return `${Math.round(t / 1000)}k`;
  const m = t / 1_000_000;
  return m < 9.95 ? `${m.toFixed(1)}M` : `${Math.round(m)}M`;
}

export function valueText(m: Measure, n: number): string {
  if (m === 'ms') return worked(n);
  if (m === 'tokens') return tokensText(n);
  return String(Math.max(0, n));
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/* ---------- trends */

export type Trend = { arrow: '↑' | '↓' | ''; text: string; short: string; spoken: string };

/** A card's line under its number: "↑ 24% vs last week" · "↓ 3 vs last month" · "new this week". All time: none. */
export function trend(m: Measure, now: number, prev: number | null | undefined, range: PerfRange): Trend | null {
  if (prev == null || range === 'all') return null;
  const period = range === '7d' ? 'week' : 'month';
  if (now === prev) {
    const t = `same as last ${period}`;
    return { arrow: '', text: t, short: 'same', spoken: t };
  }
  if (prev === 0) {
    const t = `new this ${period}`;
    return { arrow: '↑', text: t, short: 'new', spoken: t };
  }
  const up = now > prev;
  const arrow = up ? '↑' : '↓';
  const plain = m === 'requests' && Math.max(now, prev) < 20;
  const amount = plain ? String(Math.abs(now - prev)) : `${Math.round((100 * Math.abs(now - prev)) / prev)}%`;
  if (amount === '0%') {
    const t = `about the same as last ${period}`;
    return { arrow: '', text: t, short: 'same', spoken: t };
  }
  return {
    arrow,
    text: `${arrow} ${amount} vs last ${period}`,
    short: `${arrow} ${amount}`,
    spoken: `${up ? 'up' : 'down'} ${amount} from last ${period}`,
  };
}

/** A row's arrow: nothing within ±10% (or with nothing to compare). */
export function rowArrow(now: number, prev: number | null | undefined): '↑' | '↓' | '' {
  if (prev == null || (!now && !prev)) return '';
  if (!prev) return '↑';
  const d = (now - prev) / prev;
  return d > 0.1 ? '↑' : d < -0.1 ? '↓' : '';
}

/* ---------- the chart */

export type Bar = {
  key: string;
  /** Under the bar ('' = no label). */
  label: string;
  /** The tooltip's lead: "Tue, Nov 12" · "Week of Nov 4" · "Before Nov 4". */
  title: string;
  /** For the chart's spoken summary: "Friday" · "Nov 12" · "the week of Nov 4". */
  name: string;
  value: number;
  all: Measures;
  today: boolean;
};

const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', o);
const monthDay = (d: Date) => fmt(d, { month: 'short', day: 'numeric' });
const sum = (xs: Measures[]): Measures =>
  xs.reduce((a, x) => ({ ms: a.ms + x.ms, tokens: a.tokens + x.tokens, requests: a.requests + x.requests }), {
    ms: 0,
    tokens: 0,
    requests: 0,
  });

/** Most weekly bars before older weeks fold into one "earlier" bar. */
export const MAX_WEEKS = 26;

/** One bar per day (7 or 30 — and all time while it is 30 days or less), else one per week ending today. */
export function bars(p: Performance, m: Measure, agentId: string | null): Bar[] {
  const of = (d: Performance['days'][number]): Measures => (agentId ? (d.byAgent[agentId] ?? sum([])) : d);
  const days = p.days;
  const last = days.length - 1;
  if (days.length <= 30) {
    return days.map((d, i) => {
      const date = localDate(d.day);
      const all = of(d);
      const monday = date.getDay() === 1;
      return {
        key: d.day,
        label: days.length <= 7 ? fmt(date, { weekday: 'narrow' }) : monday ? monthDay(date) : '',
        title: fmt(date, { weekday: 'short', month: 'short', day: 'numeric' }),
        name: days.length <= 7 ? fmt(date, { weekday: 'long' }) : monthDay(date),
        value: all[m],
        all,
        today: i === last,
      };
    });
  }
  const weeks: Performance['days'][] = [];
  for (let end = days.length; end > 0; end -= 7) weeks.unshift(days.slice(Math.max(0, end - 7), end));
  const folded = weeks.length > MAX_WEEKS ? weeks.length - (MAX_WEEKS - 1) : 0;
  const groups = folded ? [weeks.slice(0, folded).flat(), ...weeks.slice(folded)] : weeks;
  return groups.map((g, i) => {
    const start = localDate(g[0]?.day ?? '');
    const all = sum(g.map(of));
    const earlier = folded > 0 && i === 0;
    const firstOfFold = localDate(groups[1]?.[0]?.day ?? '');
    return {
      key: g[0]?.day ?? String(i),
      label: earlier ? 'earlier' : i === 0 || i === groups.length - 1 ? monthDay(start) : '',
      title: earlier ? `Before ${monthDay(firstOfFold)}` : `Week of ${monthDay(start)}`,
      name: earlier ? `the weeks before ${monthDay(firstOfFold)}` : `the week of ${monthDay(start)}`,
      value: all[m],
      all,
      today: i === groups.length - 1,
    };
  });
}

/** The tooltip: all three measures, so one look answers "was that a busy day in every sense?". */
export const barTip = (b: Bar) =>
  `${b.title} · ${worked(b.all.ms)} · ${tokensText(b.all.tokens)} tokens · ${plural(b.all.requests, 'request')}`;

/** The chart's title and its spoken summary. */
export function chartWords(
  p: Performance,
  bs: Bar[],
  m: Measure,
  who: string | null,
): { title: string; summary: string } {
  const range = p.range;
  const word = MEASURES.find((x) => x.id === m)?.word ?? '';
  const unit = p.days.length > 30 ? 'week' : 'day';
  const title = who ? `${who} · ${word} per ${unit}` : `${word[0]?.toUpperCase()}${word.slice(1)} per ${unit}`;
  const top = bs.reduce<Bar | null>((a, b) => (b.value > (a?.value ?? 0) ? b : a), null);
  const rangeWords = RANGES.find((r) => r.id === range)?.words ?? '';
  const most = top ? `most on ${top.name}, ${valueText(m, top.value)}` : 'nothing yet';
  return { title, summary: `${title}, ${rangeWords}: ${most}` };
}

/* ---------- who's on this office */

export type Person = { name: string; role: string };
export type Crew = {
  director: string;
  teams: { id: string; name: string; captain: string | null; members: string[] }[];
  solo: string[];
};

/** Everyone who belongs to this office now: the director, every team, the solo agents. */
export function members(c: Crew): string[] {
  return [...new Set([c.director, ...c.teams.flatMap((t) => t.members), ...c.solo].filter(Boolean))];
}

/* ---------- Worth a look */

export type Flag = { agentId: string; lead: string; name: string; rest: string };

const pct = (x: number) => `${Math.round(100 * x)}%`;
const H = 3_600_000;

/** At most three plain hints, in the design's order. null = too little work to judge (fewer than 3 requests). */
export function flags(
  p: Performance,
  c: Crew,
  who: (id: string) => Person | null,
  max = 3,
): Flag[] | null {
  if (p.totals.requests < 3) return null;
  const out: Flag[] = [];
  const team = members(c);
  const name = (id: string) => who(id)?.name ?? 'A retired agent';
  const active = p.agents.filter((a) => a.requests > 0);
  const { ms, tokens } = p.totals;

  // Carrying the load
  if (team.length >= 3 && ms >= 2 * H)
    for (const a of active)
      if (a.ms / ms > 0.5) {
        const role = who(a.agentId)?.role?.toLowerCase();
        out.push({
          agentId: a.agentId,
          lead: '',
          name: name(a.agentId),
          rest: ` did ${pct(a.ms / ms)} of the work. ${role ? `Another ${role} agent` : 'Someone else'} could share it.`,
        });
      }
  // (Work waited: not recorded yet — the flag stays hidden until it is.)
  // Stops early
  for (const a of active)
    if (a.requests >= 3 && a.stopped * 3 >= a.requests)
      out.push({
        agentId: a.agentId,
        lead: `${a.stopped} of `,
        name: name(a.agentId),
        rest: `’s ${a.requests} jobs stopped early.`,
      });
  // Heavy reader
  if (tokens > 0 && ms > 0)
    for (const a of active) {
      const tShare = a.tokens / tokens;
      const msShare = a.ms / ms;
      if (tShare > 0.25 && tShare >= 2 * msShare)
        out.push({
          agentId: a.agentId,
          lead: '',
          name: name(a.agentId),
          rest: ` used ${pct(tShare)} of the tokens in ${pct(msShare)} of the time.`,
        });
    }
  // Not asked
  if (p.range !== 'all') {
    const asked = new Set(active.map((a) => a.agentId));
    const period = p.range === '7d' ? 'this week' : 'this month';
    for (const id of team)
      if (!asked.has(id) && who(id)) out.push({ agentId: id, lead: '', name: name(id), rest: ` wasn’t asked ${period}.` });
  }
  return out.slice(0, max);
}

/* ---------- Who does the work */

export type Row = {
  agentId: string;
  /** null = on the team, nothing in the range. */
  a: AgentPerformance | null;
  value: number;
  /** Share of the office total (0–100), 2 at least when > 0; null = no bars (one agent). */
  share: number | null;
  captain: boolean;
  arrow: '↑' | '↓' | '';
};
export type Group = { id: string; title: string | null; total: number; rows: Row[] };

/** The list: by team when the office has 2+ teams (director on top, captain first, teams by total), else flat.
    Agents on the team with nothing in the range sit at the bottom of their group. */
export function groups(p: Performance, c: Crew, m: Measure, flat: boolean, name: (id: string) => string): Group[] {
  const byId = new Map(p.agents.map((a) => [a.agentId, a]));
  const ids = [...new Set([...p.agents.filter((a) => a.requests > 0).map((a) => a.agentId), ...members(c)])];
  const total = p.totals[m];
  const working = ids.filter((id) => (byId.get(id)?.requests ?? 0) > 0).length;
  const captains = new Set(c.teams.map((t) => t.captain).filter(Boolean));
  const row = (id: string): Row => {
    const found = byId.get(id);
    const a = found && found.requests > 0 ? found : null;
    const value = a?.[m] ?? 0;
    return {
      agentId: id,
      a,
      value,
      share: working <= 1 ? null : total > 0 && value > 0 ? Math.max(2, (100 * value) / total) : 0,
      captain: captains.has(id),
      arrow: a ? rowArrow(value, a.previous?.[m]) : '',
    };
  };
  const order = (rs: Row[], captainFirst: boolean) =>
    rs.sort(
      (x, y) =>
        Number(!!y.a) - Number(!!x.a) ||
        (captainFirst ? Number(y.captain) - Number(x.captain) : 0) ||
        y.value - x.value ||
        name(x.agentId).localeCompare(name(y.agentId)),
    );
  const sumOf = (rs: Row[]) => rs.reduce((s, r) => s + r.value, 0);

  if (flat || c.teams.length < 2) return [{ id: 'all', title: null, total, rows: order(ids.map(row), false) }];

  const placed = new Set<string>([c.director]);
  const teamGroups = c.teams.map((t) => {
    const rs = t.members.filter((id) => !placed.has(id)).map(row);
    for (const r of rs) placed.add(r.agentId);
    return { id: t.id, title: t.name, total: sumOf(rs), rows: order(rs, true) };
  });
  const others = ids.filter((id) => !placed.has(id)).map(row);
  const director = [row(c.director)];
  return [
    { id: 'director', title: 'Director', total: sumOf(director), rows: director },
    ...teamGroups.filter((g) => g.rows.length).sort((x, y) => y.total - x.total),
    ...(others.length ? [{ id: 'others', title: 'Also on this office', total: sumOf(others), rows: order(others, false) }] : []),
  ];
}

/** The open row's line: "140 turns · 1.2M new + 2.9M re-read tokens · 6 tasks · 4 calls · 2 chats · last asked 2h ago". */
export function detailLine(a: AgentPerformance, now = Date.now()): string {
  const parts = [plural(a.turns, 'turn')];
  if (a.tokens) parts.push(`${tokensText(a.split.fresh)} new + ${tokensText(a.split.reread)} re-read tokens`);
  for (const [k, one] of [
    ['task', 'task'],
    ['call', 'call'],
    ['chat', 'chat'],
  ] as const)
    if (a.asked[k]) parts.push(plural(a.asked[k], one));
  if (a.stopped) parts.push(`${a.stopped} stopped early`);
  if (a.lastAskedAt) parts.push(`last asked ${ago(a.lastAskedAt, now)}`);
  return parts.join(' · ');
}

/** Kind of work over the range (time), for the team or one agent; kinds with no time are left out. */
export function kinds(p: Performance, agentId: string | null): { kind: WorkKind; label: string; ms: number }[] {
  const from = agentId ? p.agents.filter((a) => a.agentId === agentId) : p.agents;
  return (Object.keys(KIND_LABELS) as WorkKind[])
    .map((kind) => ({ kind, label: KIND_LABELS[kind], ms: from.reduce((s, a) => s + (a.kinds?.[kind] ?? 0), 0) }))
    .filter((k) => k.ms > 0);
}

/** Which of the sheet's states to show. */
export function stateOf(p: Performance): 'empty' | 'quiet' | 'normal' {
  if (!p.since && !p.live) return 'empty';
  if (!p.totals.requests && !p.live) return 'quiet';
  return 'normal';
}
