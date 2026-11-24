import { describe, expect, it } from 'vitest';
import { forecast } from '../../src/credits/forecast.ts';
import type { StoredReading } from '../../src/credits/store.ts';

/* The 5-hour window opened at 10:00 and resets at 15:00; it is 12:00. */
const day = (hhmm: string) => `2026-11-24T${hhmm}:00.000Z`;
const NOW = Date.parse(day('12:00'));
const FIVE_RESET = day('15:00');
const WEEK_RESET = '2026-11-26T12:00:00.000Z'; // opened 5 days ago, 2 days to go

const five = (hhmm: string, used: number, extra: Partial<StoredReading> = {}): StoredReading => ({
  at: day(hhmm),
  window: 'five_hour',
  used,
  resetsAt: FIVE_RESET,
  status: 'allowed',
  overage: false,
  ...extra,
});
const week = (hhmm: string, used: number): StoredReading => ({
  ...five(hhmm, used),
  window: 'seven_day',
  resetsAt: WEEK_RESET,
});
const windowOf = (rs: StoredReading[], name = 'five_hour') =>
  forecast(rs, NOW).windows.find((w) => w.name === name);

describe('forecast', () => {
  it('a steady burn hits the limit before the reset: the slope of the last hour', () => {
    const f = forecast([five('11:00', 0.3), five('11:30', 0.4), five('12:00', 0.5)], NOW);
    expect(f).toMatchObject({ state: 'warning', binding: 'five_hour', readingAgeMs: 0 });
    expect(f.windows[0]).toMatchObject({
      used: 0.5,
      left: 0.5,
      resetsAt: FIVE_RESET,
      opensAt: day('10:00'),
      verdict: 'hits',
      hitsAt: day('14:30'),
    });
    expect(f.windows[0]?.ratePerHour).toBeCloseTo(0.2);
  });

  it('a slow burn lasts until the reset', () => {
    const w = windowOf([five('11:00', 0.1), five('12:00', 0.13)]);
    expect(w).toMatchObject({ verdict: 'lasts', hitsAt: null });
    expect(w?.ratePerHour).toBeCloseTo(0.03);
    expect(forecast([five('11:00', 0.1), five('12:00', 0.13)], NOW).state).toBe('ok');
  });

  it('too few readings, or a rise of one 1% step: the average since the window opened', () => {
    expect(windowOf([five('12:00', 0.2)])?.ratePerHour).toBeCloseTo(0.1);
    expect(windowOf([five('11:30', 0.19), five('12:00', 0.2)])?.ratePerHour).toBeCloseTo(0.1);
  });

  it("the last period's readings never count toward this one", () => {
    const old = { resetsAt: day('10:00') };
    const w = windowOf([five('09:00', 0.7, old), five('09:50', 0.9, old), five('12:00', 0.2)]);
    expect(w?.ratePerHour).toBeCloseTo(0.1);
  });

  it('a window whose reset passed is fresh: all left, no reading yet; an old reading says stale', () => {
    const f = forecast([five('09:00', 0.8, { resetsAt: day('11:00') })], NOW);
    expect(f.windows[0]).toMatchObject({ verdict: 'fresh', used: 0, left: 1, resetsAt: null, hitsAt: null });
    expect(f).toMatchObject({ state: 'stale', binding: 'five_hour', readingAgeMs: 3 * 3_600_000 });
  });

  it('the weekly window binds when the week is nearly used up', () => {
    const f = forecast([five('12:00', 0.2), week('12:00', 0.97)], NOW);
    expect(f.binding).toBe('seven_day');
    expect(f.state).toBe('warning');
    expect(f.windows.find((w) => w.name === 'seven_day')?.verdict).toBe('hits');
  });

  it('neither runs out: the fuller one binds', () => {
    expect(forecast([five('12:00', 0.2), week('12:00', 0.5)], NOW).binding).toBe('seven_day');
    expect(forecast([five('12:00', 0.2), week('12:00', 0.1)], NOW).binding).toBe('five_hour');
  });

  it('rejected is limited until the reset; rejected while paying overage is not', () => {
    const limited = forecast([five('12:00', 1, { status: 'rejected' })], NOW);
    expect(limited).toMatchObject({ state: 'limited', binding: 'five_hour' });
    expect(limited.windows[0]).toMatchObject({ verdict: 'limited', left: 0, resetsAt: FIVE_RESET });
    const paying = forecast([five('12:00', 0.4, { status: 'rejected', overage: true })], NOW);
    expect(paying.windows[0]?.verdict).not.toBe('limited');
  });

  it('allowed_warning from Anthropic shows as a warning even when the pace lasts', () => {
    expect(forecast([five('12:00', 0.1, { status: 'allowed_warning' })], NOW).state).toBe('warning');
  });

  it('an unknown window is listed but never binds', () => {
    const f = forecast([{ ...five('12:00', 0.9), window: 'overage' }, five('12:00', 0.1)], NOW);
    expect(f.binding).toBe('five_hour');
    expect(f.windows.find((w) => w.name === 'overage')).toMatchObject({ opensAt: null, ratePerHour: null });
  });

  it('no readings at all: none', () => {
    expect(forecast([], NOW)).toEqual({
      state: 'none',
      binding: null,
      windows: [],
      readingAgeMs: null,
      at: day('12:00'),
    });
  });
});
