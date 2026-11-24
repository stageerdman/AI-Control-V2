import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRateLimit } from '../../src/credits/reading.ts';

const AT = new Date('2026-11-24T10:00:00.000Z');
const FIXTURES = join(import.meta.dirname, '../fixtures');
const event = (info: unknown) => JSON.stringify({ type: 'rate_limit_event', rate_limit_info: info });

describe('parseRateLimit', () => {
  it('reads every real limit line on record: fractions 0–1, ISO resets, the status', () => {
    const lines = readdirSync(FIXTURES)
      .filter((f) => f.startsWith('live-'))
      .flatMap((f) => readFileSync(join(FIXTURES, f), 'utf8').split('\n'))
      .filter((l) => l.includes('"rate_limit_event"'));
    expect(lines.length).toBeGreaterThan(20);
    for (const l of lines) {
      const r = parseRateLimit(l, AT);
      expect(r?.windows.map((w) => w.name)).toEqual(['five_hour', 'seven_day']);
      for (const w of r?.windows ?? []) {
        expect(w.used).toBeGreaterThanOrEqual(0);
        expect(w.used).toBeLessThanOrEqual(1);
        expect(w.resetsAt).toMatch(/^2026-11-\d\dT/);
        expect(w.status).toBe('allowed');
      }
      expect(r?.overage).toBe(false);
      expect(r?.at).toBe(AT.toISOString());
    }
  });

  it('takes percents and epoch milliseconds too; keeps new window names', () => {
    const r = parseRateLimit(
      event({
        isUsingOverage: true,
        unifiedWindows: { seven_day_opus: { utilization: 42, resetsAt: 1794808800000, status: 'rejected' } },
      }),
      AT,
    );
    expect(r).toEqual({
      at: AT.toISOString(),
      overage: true,
      windows: [
        {
          name: 'seven_day_opus',
          used: 0.42,
          resetsAt: new Date(1794808800000).toISOString(),
          status: 'rejected',
        },
      ],
    });
  });

  it('drops what it cannot trust, never throws', () => {
    const partial = parseRateLimit(
      event({
        unifiedWindows: {
          five_hour: { utilization: 0.2, resetsAt: 1794630600 },
          bad_used: { utilization: 'lots', resetsAt: 1794630600 },
          too_much: { utilization: 250, resetsAt: 1794630600 },
          no_reset: { utilization: 0.2 },
          junk: 7,
        },
      }),
      AT,
    );
    expect(partial?.windows.map((w) => [w.name, w.status])).toEqual([['five_hour', null]]);
    for (const line of [
      event({ status: 'allowed', resetsAt: 1794630600 }), // a bare event: no windows
      event(null),
      '{"type":"rate_limit_event"',
      'not json at all',
      JSON.stringify({ type: 'assistant', message: { content: 'rate_limit_event' } }),
      JSON.stringify([1, 2]),
    ])
      expect(parseRateLimit(line, AT)).toBeNull();
  });
});
