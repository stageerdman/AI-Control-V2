/* The credits line's words and looks (design/credits-line.md), state by state, in a fixed zone and locale. */
import { describe, expect, it } from 'vitest';
import {
  clockTime,
  duration,
  type Forecast,
  percentLeft,
  relative,
  resetTime,
  view,
  type WindowForecast,
} from './model';

const C = { locale: 'en-US', timeZone: 'UTC' };
const NOW = Date.parse('2026-11-24T14:30:00Z'); // a Tuesday
const iso = (minFromNow: number) => new Date(NOW + minFromNow * 60_000).toISOString();

const win = (over: Partial<WindowForecast> = {}): WindowForecast => ({
  name: 'five_hour',
  used: 0.38,
  left: 0.62,
  resetsAt: iso(120), // 4:30 pm
  opensAt: iso(-180),
  ratePerHour: 0.09,
  hitsAt: null,
  verdict: 'lasts',
  readingAgeMs: 60_000,
  ...over,
});
const weekly = (over: Partial<WindowForecast> = {}) =>
  win({ name: 'seven_day', used: 0.53, left: 0.47, resetsAt: '2026-11-28T09:00:00Z', ...over });
const fc = (
  state: Forecast['state'],
  windows: WindowForecast[],
  binding = windows[0]?.name ?? null,
): Forecast => ({
  state,
  binding,
  windows,
  readingAgeMs: windows[0]?.readingAgeMs ?? null,
  at: new Date(NOW).toISOString(),
});

describe('number and time rules', () => {
  it('% left is whole, never 100 while anything is used, never below 0', () => {
    expect(percentLeft({ used: 0.38, left: 0.62 })).toBe(62);
    expect(percentLeft({ used: 0.004, left: 0.996 })).toBe(99);
    expect(percentLeft({ used: 0, left: 1 })).toBe(100);
    expect(percentLeft({ used: 1.2, left: -0.2 })).toBe(0);
  });
  it('"in ~X": minutes, hours and minutes, days', () => {
    expect(duration(40 * 60_000)).toBe('40 min');
    expect(duration(130 * 60_000)).toBe('2 h 10 min');
    expect(duration(120 * 60_000)).toBe('2 h');
    expect(duration(50 * 3_600_000)).toBe('2 days');
    expect(duration(10_000)).toBe('1 min');
  });
  it('clock times: today without a day, another day with its name, no ":00"', () => {
    expect(clockTime(Date.parse('2026-11-24T16:30:00Z'), NOW, C)).toBe('4:30 pm');
    expect(clockTime(Date.parse('2026-11-28T09:00:00Z'), NOW, C)).toBe('Sat 9 am');
  });
  it('reset times always carry the day: today, tomorrow, a weekday', () => {
    expect(resetTime(Date.parse('2026-11-24T16:30:00Z'), NOW, C)).toBe('Today 4:30 pm');
    expect(resetTime(Date.parse('2026-11-25T09:00:00Z'), NOW, C)).toBe('Tomorrow 9 am');
    expect(resetTime(Date.parse('2026-11-28T09:00:00Z'), NOW, C)).toBe('Sat 9 am');
  });
  it('"in X": one unit, rounded, singular when 1', () => {
    expect(relative(40 * 60_000)).toBe('in 40 minutes');
    expect(relative(10_000)).toBe('in 1 minute');
    expect(relative(3 * 3_600_000 + 10 * 60_000)).toBe('in 3 hours');
    expect(relative(70 * 60_000)).toBe('in 1 hour');
    expect(relative(50 * 3_600_000)).toBe('in 2 days');
  });
});

describe('view', () => {
  it('none: track only, "No reading yet"', () => {
    for (const f of [null, fc('none', [])]) {
      const v = view(f, NOW, C);
      expect(v).toMatchObject({ state: 'none', fill: 0, fillTone: 'none', announce: null });
      expect(v.card).toMatchObject({
        title: 'No reading yet',
        empty: 'Usage appears after the first run.',
        usage: [],
        resets: [],
      });
    }
  });

  it('ok: the line is the share left, no words on it; the card shows both windows and both resets', () => {
    const v = view(fc('ok', [win(), weekly()]), NOW, C);
    expect(v).toMatchObject({ state: 'ok', leftPct: 62, fill: 0.62, fillTone: 'rainbow', thick: false });
    expect(v).not.toHaveProperty('chip');
    expect(v.card).toEqual({
      title: '62% left',
      empty: null,
      usage: [
        { window: '5-hour', title: '62% left', note: null, fill: 0.62, tone: 'rainbow', dim: false },
        { window: 'Weekly', title: '47% left', note: null, fill: 0.47, tone: 'rainbow', dim: false },
      ],
      resets: [
        { label: '5-hour resets', when: 'Today 4:30 pm', relative: 'in 2 hours' },
        { label: 'Weekly resets', when: 'Sat 9 am', relative: 'in 4 days' },
      ],
      age: null,
      estimated: false,
    });
    expect(v.aria).toBe('AI credits: 62% left, lasts until it resets at 4:30 pm');
  });

  it('warning: warm and thick, the binding row warm in the card, one announcement', () => {
    const v = view(
      fc('warning', [win({ verdict: 'hits', hitsAt: iso(40), ratePerHour: 0.5 }), weekly()]),
      NOW,
      C,
    );
    expect(v).toMatchObject({ state: 'warning', fillTone: 'warm', thick: true });
    expect(v.card.usage.map((u) => u.tone)).toEqual(['warm', 'rainbow']);
    expect(v.announce?.text).toBe('AI credits low: runs out in about 40 minutes.');
    expect(v.aria).toBe('AI credits: 62% left, runs out in about 40 minutes, at 3:10 pm; resets at 4:30 pm');
  });

  it('read aloud, hours and minutes are words', () => {
    const v = view(fc('warning', [win({ verdict: 'hits', hitsAt: iso(88) })]), NOW, C);
    expect(v.announce?.text).toBe('AI credits low: runs out in about 1 hour 28 minutes.');
  });

  it('low but lasting: announced with what is left', () => {
    const v = view(fc('warning', [win({ used: 0.88, left: 0.12, ratePerHour: 0.004 })]), NOW, C);
    expect(v.card.usage[0]).toMatchObject({ title: '12% left', tone: 'warm' });
    expect(v.announce?.text).toBe('AI credits low: 12% left.');
  });

  it('limited: no fill; the card says limit reached and when it resets', () => {
    const v = view(
      fc('limited', [win({ used: 1, left: 0, verdict: 'limited', resetsAt: iso(80) }), weekly()]),
      NOW,
      C,
    );
    expect(v).toMatchObject({ state: 'limited', fill: 0, fillTone: 'none', thick: true });
    expect(v.card.usage[0]).toMatchObject({ title: '0% left', note: 'Limit reached', fill: 0 });
    expect(v.card.resets[0]).toEqual({
      label: '5-hour resets',
      when: 'Today 3:50 pm',
      relative: 'in 1 hour',
    });
    expect(v.aria).toBe('AI credits: limit reached, back at 3:50 pm');
    expect(v.announce?.key).not.toBe(
      view(fc('warning', [win({ verdict: 'hits', hitsAt: iso(5) })]), NOW, C).announce?.key,
    );
  });

  it('stale: as ok but dimmed, with the age in the card', () => {
    const v = view(fc('stale', [win({ readingAgeMs: 20 * 60_000 })]), NOW, C);
    expect(v).toMatchObject({ state: 'stale', dim: true, fillTone: 'rainbow' });
    expect(v.card.age).toBe('Updated 20 min ago');
  });

  it('the age keeps counting from the forecast time', () => {
    const v = view(fc('ok', [win({ readingAgeMs: 60_000 })]), NOW + 3 * 60_000, C);
    expect(v.card.age).toBe('Updated 4 min ago');
  });

  it('fresh: the window reset — full and dim; its reset time comes with the next run', () => {
    const f = fc('stale', [win({ used: 0, left: 1, verdict: 'fresh', resetsAt: null, ratePerHour: null })]);
    const v = view(f, NOW, C);
    expect(v).toMatchObject({ state: 'fresh', fill: 1, dim: true, announce: null });
    expect(v.card.usage[0]).toMatchObject({ title: '100% left', note: 'Fresh window', dim: true });
    expect(v.card.resets[0]).toEqual({
      label: '5-hour resets',
      when: 'Known after the next run',
      relative: null,
    });
  });

  it('no weekly reading yet: the weekly row says so, the 5-hour row is unchanged', () => {
    const v = view(fc('ok', [win()]), NOW, C);
    expect(v.card.usage[1]).toMatchObject({ window: 'Weekly', title: 'No reading yet', fill: 0 });
    expect(v.card.resets[1]).toEqual({
      label: 'Weekly resets',
      when: 'Known after the next run',
      relative: null,
    });
  });

  it('weekly binding: the line follows weekly, the card keeps 5-hour first, weekly warm', () => {
    const v = view(fc('warning', [win(), weekly({ used: 0.9, left: 0.1 })], 'seven_day'), NOW, C);
    expect(v.leftPct).toBe(10);
    expect(v.card.usage.map((u) => [u.window, u.title, u.tone])).toEqual([
      ['5-hour', '62% left', 'rainbow'],
      ['Weekly', '10% left', 'warm'],
    ]);
  });
});
