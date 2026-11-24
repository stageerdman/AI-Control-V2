/* The credits line's words and looks (design/credits-line.md), state by state, in a fixed zone and locale. */
import { describe, expect, it } from 'vitest';
import { clockTime, duration, type Forecast, percentLeft, view, type WindowForecast } from './model';

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
});

describe('view', () => {
  it('none: track only, "No reading yet"', () => {
    for (const f of [null, fc('none', [])]) {
      const v = view(f, NOW, C);
      expect(v).toMatchObject({ state: 'none', fill: 0, fillTone: 'none', chip: null, announce: null });
      expect(v.card).toMatchObject({
        title: 'No reading yet',
        verdict: 'Usage appears after the first run.',
      });
      expect(v.card.rate).toBeNull();
    }
  });

  it('ok: full rainbow at the share left, lasts until reset, the weekly row', () => {
    const v = view(fc('ok', [win(), weekly()]), NOW, C);
    expect(v).toMatchObject({ state: 'ok', leftPct: 62, fill: 0.62, fillTone: 'rainbow', thick: false });
    expect(v.chip).toBeNull();
    expect(v.card).toEqual({
      title: '62% left',
      window: '5-hour',
      rate: 'Using about 9% an hour',
      verdict: 'Lasts until it resets at 4:30 pm',
      other: 'Weekly · 47% left · resets Sat 9 am',
      age: null,
      estimated: false,
    });
    expect(v.aria).toBe('AI credits: 62% left, lasts until it resets at 4:30 pm');
  });

  it('warning (runs out before reset): warm, thick, chip with the time, one announcement', () => {
    const v = view(fc('warning', [win({ verdict: 'hits', hitsAt: iso(40), ratePerHour: 0.5 })]), NOW, C);
    expect(v).toMatchObject({ state: 'warning', fillTone: 'warm', thick: true, chip: 'runs out ≈ 3:10 pm' });
    expect(v.card.verdict).toBe('Runs out in ~40 min (≈ 3:10 pm) · resets 4:30 pm');
    expect(v.announce?.text).toBe('AI credits low: runs out in about 40 minutes.');
    expect(v.aria).toBe('AI credits: 62% left, runs out in about 40 minutes, at 3:10 pm; resets at 4:30 pm');
  });

  it('read aloud, hours and minutes are words', () => {
    const v = view(fc('warning', [win({ verdict: 'hits', hitsAt: iso(88) })]), NOW, C);
    expect(v.announce?.text).toBe('AI credits low: runs out in about 1 hour 28 minutes.');
    expect(v.card.verdict).toBe('Runs out in ~1 h 28 min (≈ 3:58 pm) · resets 4:30 pm');
  });

  it('warning (low but lasts): the chip says what is left', () => {
    const v = view(fc('warning', [win({ used: 0.88, left: 0.12, ratePerHour: 0.004 })]), NOW, C);
    expect(v.chip).toBe('12% left · resets 4:30 pm');
    expect(v.card.rate).toBe('Using under 1% an hour');
    expect(v.announce?.text).toBe('AI credits low: 12% left.');
  });

  it('limited: no fill, chip and verdict say when it is back; no burn rate', () => {
    const v = view(fc('limited', [win({ used: 1, left: 0, verdict: 'limited', resetsAt: iso(80) })]), NOW, C);
    expect(v).toMatchObject({ state: 'limited', fill: 0, fillTone: 'none', thick: true });
    expect(v.chip).toBe('Limit reached · back at 3:50 pm');
    expect(v.card.verdict).toBe('Limit reached. Back at 3:50 pm (in 1 h 20 min)');
    expect(v.card.rate).toBeNull();
    expect(v.announce?.key).not.toBe(
      view(fc('warning', [win({ verdict: 'hits', hitsAt: iso(5) })]), NOW, C).announce?.key,
    );
  });

  it('stale: as ok but dimmed, with the age in the card', () => {
    const v = view(fc('stale', [win({ readingAgeMs: 20 * 60_000 })]), NOW, C);
    expect(v).toMatchObject({ state: 'stale', dim: true, fillTone: 'rainbow', chip: null });
    expect(v.card.age).toBe('Updated 20 min ago');
  });

  it('the age keeps counting from the forecast time', () => {
    const v = view(fc('ok', [win({ readingAgeMs: 60_000 })]), NOW + 3 * 60_000, C);
    expect(v.card.age).toBe('Updated 4 min ago');
  });

  it('fresh: the window reset — full and dim, no numbers to explain', () => {
    const f = fc('stale', [win({ used: 0, left: 1, verdict: 'fresh', resetsAt: null, ratePerHour: null })]);
    const v = view(f, NOW, C);
    expect(v).toMatchObject({ state: 'fresh', fill: 1, dim: true, chip: null, announce: null });
    expect(v.card.verdict).toBe('Fresh window. The next run brings a reading.');
    expect(v.card.rate).toBeNull();
  });

  it('weekly binding: its name in the title, the 5-hour window in the other row', () => {
    const v = view(fc('warning', [win(), weekly({ used: 0.9, left: 0.1 })], 'seven_day'), NOW, C);
    expect(v.card.window).toBe('Weekly');
    expect(v.card.title).toBe('10% left');
    expect(v.card.other).toBe('5-hour · 62% left · resets 4:30 pm');
  });

  it('a rare window shows its name only when it binds', () => {
    const v = view(fc('ok', [win({ name: 'seven_day_opus' })], 'seven_day_opus'), NOW, C);
    expect(v.card.window).toBe('Opus weekly');
  });
});
