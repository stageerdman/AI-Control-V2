/* How the team works (pure): every rule the sheet says out loud. */
import { describe, expect, it } from 'vitest';
import type { Performance } from '../api';
import { agentPerf, agents, crew, NOW, none, quiet, week } from './fixtures';
import {
  bars,
  barTip,
  chartWords,
  detailLine,
  flags,
  groups,
  kinds,
  MAX_WEEKS,
  members,
  rowArrow,
  stateOf,
  tokensText,
  trend,
  valueText,
} from './model';

const who = (id: string) => {
  const a = agents[id];
  return a ? { name: a.name, role: a.role } : null;
};
const nameOf = (id: string) => agents[id]?.name ?? 'A retired agent';

/** n days ending 2026-11-16, 1 minute and 1 request each. */
function long(n: number): Performance {
  const end = Date.UTC(2026, 10, 16);
  const days = Array.from({ length: n }, (_, i) => {
    const day = new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return {
      day,
      ms: 60_000,
      tokens: 10,
      requests: 1,
      byAgent: { 'a-blair': { ms: 60_000, tokens: 10, requests: 1 } },
    };
  });
  return { ...week, range: 'all', days };
}

describe('numbers in words', () => {
  it('tokens: 920 · 12k · 840k · 4.1M · 12M', () => {
    expect(tokensText(920)).toBe('920');
    expect(tokensText(12_000)).toBe('12k');
    expect(tokensText(840_000)).toBe('840k');
    expect(tokensText(4_100_000)).toBe('4.1M');
    expect(tokensText(12_000_000)).toBe('12M');
    expect(tokensText(999_600)).toBe('1.0M');
    expect(tokensText(Number.NaN)).toBe('0');
  });
  it('each measure in its own words; never money', () => {
    expect(valueText('ms', 4 * 3_600_000 + 50 * 60_000)).toBe('4h 50m');
    expect(valueText('tokens', 3_700_000)).toBe('3.7M');
    expect(valueText('requests', 13)).toBe('13');
    for (const m of ['ms', 'tokens', 'requests'] as const)
      expect(valueText(m, 123_456)).not.toMatch(/\$|cost/i);
  });
});

describe('trend', () => {
  it('percent for time and tokens, plain count for few requests', () => {
    expect(trend('ms', week.totals.ms, week.previous?.ms, '7d')?.text).toBe('↑ 21% vs last week');
    expect(trend('tokens', week.totals.tokens, week.previous?.tokens, '7d')?.text).toBe('↑ 23% vs last week');
    expect(trend('requests', 13, 10, '7d')?.text).toBe('↑ 3 vs last week');
    expect(trend('requests', 40, 20, '7d')?.text).toBe('↑ 100% vs last week');
  });
  it('down, same, new; month for 30 days; spoken words', () => {
    const t = trend('ms', 50, 100, '30d');
    expect(t?.text).toBe('↓ 50% vs last month');
    expect(t?.spoken).toBe('down 50% from last month');
    expect(trend('ms', 100, 100, '7d')?.text).toBe('same as last week');
    expect(trend('ms', 1000, 999, '7d')?.text).toBe('about the same as last week');
    expect(trend('ms', 5, 0, '7d')?.text).toBe('new this week');
  });
  it('all time and nothing to compare: no trend', () => {
    expect(trend('ms', 5, 3, 'all')).toBeNull();
    expect(trend('ms', 5, null, '7d')).toBeNull();
  });
  it('row arrows stay quiet within ±10%', () => {
    expect(rowArrow(110, 100)).toBe('');
    expect(rowArrow(111, 100)).toBe('↑');
    expect(rowArrow(89, 100)).toBe('↓');
    expect(rowArrow(5, 0)).toBe('↑');
    expect(rowArrow(0, 0)).toBe('');
    expect(rowArrow(5, null)).toBe('');
  });
});

describe('the chart', () => {
  it('a week: one bar per day, weekday letters, today last', () => {
    const bs = bars(week, 'ms', null);
    expect(bs).toHaveLength(7);
    expect(bs.map((b) => b.label).join('')).toBe('TWTFSSM');
    expect(bs.map((b) => b.today)).toEqual([false, false, false, false, false, false, true]);
    expect(bs[6]?.value).toBe(2 * 3_600_000);
  });
  it('one agent: only their share of each day', () => {
    const bs = bars(week, 'tokens', 'a-rivet');
    expect(bs.map((b) => b.value)).toEqual([0, 2_400_000, 0, 0, 0, 0, 0]);
  });
  it('tooltip carries all three measures', () => {
    const b = bars(week, 'ms', null)[1];
    expect(b && barTip(b)).toBe('Wed, Nov 11 · 1h · 2.4M tokens · 4 requests');
  });
  it('30 days: daily, labelled on Mondays only', () => {
    const bs = bars(long(30), 'ms', null);
    expect(bs).toHaveLength(30);
    expect(bs.filter((b) => b.label).every((b) => b.title.startsWith('Mon'))).toBe(true);
  });
  it('longer: weekly bars ending today, nothing lost', () => {
    const bs = bars(long(60), 'ms', null);
    expect(bs).toHaveLength(9);
    expect(bs[0]?.value).toBe(4 * 60_000);
    expect(bs.at(-1)?.title).toBe('Week of Nov 10');
    expect(bs.reduce((s, b) => s + b.value, 0)).toBe(60 * 60_000);
  });
  it('very long: older weeks fold into one "earlier" bar', () => {
    const bs = bars(long(400), 'requests', null);
    expect(bs).toHaveLength(MAX_WEEKS);
    expect(bs[0]?.label).toBe('earlier');
    expect(bs[0]?.title).toMatch(/^Before /);
    expect(bs.reduce((s, b) => s + b.value, 0)).toBe(400);
  });
  it('title and spoken summary follow measure, agent and unit', () => {
    expect(chartWords(week, bars(week, 'tokens', null), 'tokens', null)).toEqual({
      title: 'Tokens per day',
      summary: 'Tokens per day, the last 7 days: most on Wednesday, 2.4M',
    });
    expect(chartWords(week, bars(week, 'ms', 'a-blair'), 'ms', 'Blair').title).toBe(
      'Blair · agent time per day',
    );
    const l = long(60);
    expect(chartWords(l, bars(l, 'ms', null), 'ms', null).title).toBe('Agent time per week');
    expect(chartWords(quiet, bars(quiet, 'ms', null), 'ms', null).summary).toMatch(/nothing yet$/);
  });
});

describe('Worth a look', () => {
  it('in order, at most three', () => {
    const f = flags(week, crew, who);
    expect(f?.map((x) => `${x.lead}${x.name}${x.rest}`)).toEqual([
      'Blair did 62% of the work. Another studio design agent could share it.',
      '2 of Rivet’s 4 jobs stopped early.',
      'Rivet used 65% of the tokens in 21% of the time.',
    ]);
  });
  it('not asked comes last, and only for a week or a month', () => {
    expect(flags(week, crew, who, 9)?.at(-1)).toMatchObject({
      name: 'Quill',
      rest: ' wasn’t asked this week.',
    });
    expect(flags({ ...week, range: 'all' }, crew, who, 9)?.some((x) => x.agentId === 'a-quill')).toBe(false);
  });
  it('too little work to judge: null; even work: none', () => {
    expect(flags(none, crew, who)).toBeNull();
    const even: Performance = {
      ...week,
      totals: { ms: 4 * 3_600_000, tokens: 400, requests: 4 },
      agents: ['a-pixel', 'a-blair', 'a-quill', 'a-rivet'].map((id) =>
        agentPerf(id, { ms: 3_600_000, tokens: 100, requests: 1 }),
      ),
    };
    expect(flags(even, crew, who)).toEqual([]);
  });
});

describe('who does the work', () => {
  it('everyone on the office, once', () => {
    expect(members(crew)).toEqual(['a-pixel', 'a-blair', 'a-quill', 'a-rivet']);
  });
  it('by team: director on top, teams by total, captain first, idle last, others at the end', () => {
    const gs = groups(week, crew, 'ms', false, nameOf);
    expect(gs.map((g) => g.title)).toEqual(['Director', 'Design', 'Engineering', 'Also on this office']);
    expect(gs[1]?.rows.map((r) => [r.agentId, r.captain, !!r.a])).toEqual([
      ['a-blair', true, true],
      ['a-quill', false, false],
    ]);
    expect(gs[3]?.rows.map((r) => r.agentId)).toEqual(['a-gone']);
  });
  it('teams re-order by the chosen measure', () => {
    const gs = groups(week, crew, 'tokens', false, nameOf);
    expect(gs.map((g) => g.title)).toEqual(['Director', 'Engineering', 'Design', 'Also on this office']);
  });
  it('flat: one list by value, idle at the bottom, shares of the total', () => {
    const [g, ...rest] = groups(week, crew, 'ms', true, nameOf);
    expect(rest).toHaveLength(0);
    expect(g?.rows.map((r) => r.agentId)).toEqual(['a-blair', 'a-rivet', 'a-pixel', 'a-gone', 'a-quill']);
    expect(Math.round(g?.rows[0]?.share ?? 0)).toBe(62);
    expect(g?.rows.at(-1)?.share).toBe(0);
  });
  it('flat when there are fewer than two teams; no share bars for a lone worker', () => {
    const one = { ...crew, teams: crew.teams.slice(0, 1) };
    const solo: Performance = { ...week, agents: [agentPerf('a-blair', { ms: 5, requests: 1 })] };
    const gs = groups(solo, one, 'ms', false, nameOf);
    expect(gs).toHaveLength(1);
    expect(gs[0]?.rows.find((r) => r.agentId === 'a-blair')?.share).toBeNull();
  });
  it('the open row says how the work went', () => {
    const blair = week.agents.find((a) => a.agentId === 'a-blair');
    expect(blair && detailLine(blair, NOW)).toBe(
      '140 turns · 300k new + 900k re-read tokens · 4 tasks · 1 call · 1 chat · last asked 2h ago',
    );
    const rivet = week.agents.find((a) => a.agentId === 'a-rivet');
    expect(rivet && detailLine(rivet, NOW)).toContain('2 stopped early · last asked yesterday');
  });
});

describe('kind of work and state', () => {
  it('time by kind, for the team or one agent; empty kinds left out', () => {
    expect(kinds(week, null).map((k) => [k.label, k.ms / 60_000])).toEqual([
      ['Thinking & planning', 30],
      ['Coding & building', 180],
      ['Reviewing', 60],
      ['Setup', 20],
    ]);
    expect(kinds(week, 'a-blair').map((k) => k.kind)).toEqual(['building', 'reviewing']);
  });
  it('empty · quiet · normal', () => {
    expect(stateOf(none)).toBe('empty');
    expect(stateOf(quiet)).toBe('quiet');
    expect(stateOf(week)).toBe('normal');
    expect(stateOf({ ...quiet, live: 1 })).toBe('normal');
  });
});
