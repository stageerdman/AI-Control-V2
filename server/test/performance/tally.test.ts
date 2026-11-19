/* Agent performance (pure): local-day windows, the previous window, and the tally of spans per agent and per day. */
import { describe, expect, it } from 'vitest';
import type { Span } from '../../src/performance/spans.ts';
import { tally } from '../../src/performance/tally.ts';
import { dayLabel, dayStart, windowOf } from '../../src/performance/window.ts';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const CET = -60; // getTimezoneOffset() in Berlin: local = UTC + 1h
const min = (ms: number) => ms / 60_000;

const span = (
  agentId: string,
  start: string,
  minutes: number | 'live',
  o: Partial<Pick<Span, 'asked' | 'outcome' | 'tokens' | 'turns'>> = {},
): Span => ({
  agentId,
  kind: 'building',
  asked: o.asked ?? 'task',
  outcome: minutes === 'live' ? 'live' : (o.outcome ?? 'done'),
  turns: o.turns ?? 0,
  tokens: o.tokens === undefined ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } : o.tokens,
  start,
  end: minutes === 'live' ? null : new Date(Date.parse(start) + minutes * 60_000).toISOString(),
  itemId: null,
});

describe('the window', () => {
  it('7 days = today and the 6 local days before; the previous 7 just before', () => {
    const w = windowOf('7d', CET, NOW, null);
    expect(new Date(w.to).toISOString()).toBe('2026-11-16T23:00:00.000Z'); // local midnight ending today
    expect(new Date(w.from).toISOString()).toBe('2026-11-09T23:00:00.000Z');
    expect(w.previous && new Date(w.previous.from).toISOString()).toBe('2026-11-02T23:00:00.000Z');
    expect(w.previous?.to).toBe(w.from);
    expect(windowOf('30d', CET, NOW, null).from).toBe(w.to - 30 * 86_400_000);
  });

  it('local days west of UTC: 03:00 UTC is still yesterday in New York', () => {
    const ny = 300;
    const start = dayStart(Date.parse('2026-11-16T03:00:00.000Z'), ny);
    expect(new Date(start).toISOString()).toBe('2026-11-15T05:00:00.000Z');
    expect(dayLabel(start, ny)).toBe('2026-11-15');
  });

  it('all time starts on the day of the first work, has no previous; no work yet → today', () => {
    const w = windowOf('all', CET, NOW, '2026-10-01T10:00:00.000Z');
    expect(new Date(w.from).toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(w.previous).toBeNull();
    expect(windowOf('all', CET, NOW, null).from).toBe(dayStart(NOW, CET));
  });
});

describe('the tally', () => {
  const blairWork = span('a-blair', '2026-11-16T10:00:00.000Z', 60, {
    turns: 5,
    tokens: { input: 100, output: 50, cacheRead: 1000, cacheWrite: 10 },
  });
  const spans: Span[] = [
    blairWork,
    // 23:30 local on the 15th: that day, not the 16th
    span('a-blair', '2026-11-15T22:30:00.000Z', 10, {
      asked: 'chat',
      outcome: 'stopped',
      tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    }),
    span('a-rivet', '2026-11-16T11:30:00.000Z', 'live', { asked: 'call', tokens: null }), // a crew call going on
    span('a-blair', '2026-11-09T23:00:00.000Z', 2), // the window's first instant: in
    span('a-blair', '2026-11-09T22:59:00.000Z', 1), // a minute before: the previous week
    span('a-rivet', '2026-11-05T10:00:00.000Z', 20, {
      tokens: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
    }),
    span('a-quill', '2026-10-01T10:00:00.000Z', 1),
  ];
  const week = tally(spans, windowOf('7d', CET, NOW, null), NOW);

  it('totals and the previous week: time (live counts up to now), tokens of every kind, one request per span', () => {
    expect(week.totals).toEqual({ ms: (60 + 10 + 30 + 2) * 60_000, tokens: 1162, requests: 4 });
    expect(week.previous).toEqual({ ms: 21 * 60_000, tokens: 10, requests: 2 });
    expect(week).toMatchObject({
      range: '7d',
      from: '2026-11-09T23:00:00.000Z',
      to: '2026-11-16T23:00:00.000Z',
      since: '2026-10-01T10:00:00.000Z',
      live: 1,
      unmeasured: 1, // the crew call without a token count
    });
  });

  it('per agent: most time first; everyone who ever worked here is listed; asked, stopped, new vs re-read', () => {
    expect(week.agents.map((a) => [a.agentId, min(a.ms)])).toEqual([
      ['a-blair', 72],
      ['a-rivet', 30],
      ['a-quill', 0],
    ]);
    const [blair, rivet, quill] = week.agents;
    expect(blair).toMatchObject({
      tokens: 1162,
      requests: 3,
      turns: 5,
      split: { fresh: 162, reread: 1000 },
      asked: { task: 2, call: 0, chat: 1 },
      stopped: 1,
      lastAskedAt: blairWork.start,
      live: false,
      previous: { ms: 60_000, tokens: 0, requests: 1 },
    });
    expect(rivet).toMatchObject({ live: true, asked: { task: 0, call: 1, chat: 0 }, tokens: 0 });
    expect(rivet?.previous).toEqual({ ms: 20 * 60_000, tokens: 10, requests: 1 });
    expect(quill).toMatchObject({ ms: 0, requests: 0, lastAskedAt: '2026-10-01T10:00:00.000Z' });
  });

  it('per agent: time by kind of work, inside the window only', () => {
    const spans2: Span[] = [
      span('a-blair', '2026-11-16T09:00:00.000Z', 30),
      { ...span('a-blair', '2026-11-16T10:00:00.000Z', 15), kind: 'reviewing' },
      { ...span('a-blair', '2026-10-01T10:00:00.000Z', 99), kind: 'thinking' }, // outside: not counted
    ];
    const [blair] = tally(spans2, windowOf('7d', CET, NOW, null), NOW).agents;
    expect(blair?.kinds).toEqual({
      thinking: 0,
      building: 30 * 60_000,
      reviewing: 15 * 60_000,
      research: 0,
      setup: 0,
    });
  });

  it('per local day: every day of the window, a span on the day it started, split by agent', () => {
    expect(week.days.map((d) => d.day)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    const day = Object.fromEntries(week.days.map((d) => [d.day, d]));
    expect(day['2026-11-16']).toMatchObject({ ms: 90 * 60_000, tokens: 1160, requests: 2 });
    expect(day['2026-11-16']?.byAgent).toEqual({
      'a-blair': { ms: 60 * 60_000, tokens: 1160, requests: 1 },
      'a-rivet': { ms: 30 * 60_000, tokens: 0, requests: 1 },
    });
    expect(day['2026-11-15']).toMatchObject({ ms: 10 * 60_000, requests: 1 });
    expect(day['2026-11-10']).toMatchObject({ ms: 2 * 60_000, requests: 1 });
    expect(day['2026-11-12']).toEqual({ day: '2026-11-12', ms: 0, tokens: 0, requests: 0, byAgent: {} });
    // the days add up to the window
    expect(week.days.reduce((n, d) => n + d.requests, 0)).toBe(week.totals.requests);
  });

  it('all time: everything, no previous, a day for every day since the first work', () => {
    const all = tally(spans, windowOf('all', CET, NOW, '2026-10-01T10:00:00.000Z'), NOW);
    expect(all.totals.requests).toBe(spans.length);
    expect(all.previous).toBeNull();
    expect(all.agents.every((a) => a.previous === null)).toBe(true);
    expect(all.days).toHaveLength(31 + 16);
  });

  it('no work at all: zeros, nobody listed, no since', () => {
    const empty = tally([], windowOf('7d', CET, NOW, null), NOW);
    expect(empty).toMatchObject({
      totals: { ms: 0, tokens: 0, requests: 0 },
      since: null,
      agents: [],
      live: 0,
    });
    expect(empty.days).toHaveLength(7);
  });
});
