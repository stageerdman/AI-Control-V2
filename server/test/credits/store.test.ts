import { describe, expect, it } from 'vitest';
import type { LimitReading } from '../../src/credits/reading.ts';
import { limitStore } from '../../src/credits/store.ts';
import { openDb } from '../../src/db/connection.ts';

const RESET = '2026-11-24T15:00:00.000Z';
const reading = (at: string, used: number, weekly = 0.5): LimitReading => ({
  at,
  overage: false,
  windows: [
    { name: 'five_hour', used, resetsAt: RESET, status: 'allowed' },
    { name: 'seven_day', used: weekly, resetsAt: '2026-11-28T09:00:00.000Z', status: 'allowed' },
  ],
});

describe('limitStore', () => {
  it('writes a window only when its reading changed', () => {
    const s = limitStore(openDb(':memory:'));
    expect(s.record(reading('2026-11-24T10:00:00.000Z', 0.1))).toBe(true);
    expect(s.record(reading('2026-11-24T10:05:00.000Z', 0.1))).toBe(false);
    expect(s.record(reading('2026-11-24T10:10:00.000Z', 0.12))).toBe(true);
    expect(s.all().map((r) => [r.window, r.used, r.at.slice(11, 16)])).toEqual([
      ['five_hour', 0.1, '10:00'],
      ['seven_day', 0.5, '10:00'],
      ['five_hour', 0.12, '10:10'],
    ]);
    expect(s.all()[0]).toEqual({
      at: '2026-11-24T10:00:00.000Z',
      window: 'five_hour',
      used: 0.1,
      resetsAt: RESET,
      status: 'allowed',
      overage: false,
    });
  });

  it('keeps 8 days: older rows go when a new one is written', () => {
    const s = limitStore(openDb(':memory:'));
    s.record(reading('2026-11-10T10:00:00.000Z', 0.1, 0.1));
    s.record(reading('2026-11-17T10:00:00.000Z', 0.2, 0.2));
    s.record(reading('2026-11-24T10:00:00.000Z', 0.3, 0.3));
    expect(s.all().map((r) => r.at.slice(0, 10))).toEqual([
      '2026-11-17',
      '2026-11-17',
      '2026-11-24',
      '2026-11-24',
    ]);
  });
});
