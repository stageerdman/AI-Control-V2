import { describe, expect, it } from 'vitest';
import { shareOf } from '../../src/credits/share.ts';
import type { Span } from '../../src/performance/spans.ts';

const span = (agentId: string, start: string, input: number): Span => ({
  agentId,
  kind: 'building',
  asked: 'task',
  outcome: 'done',
  turns: 1,
  tokens: { input, output: 0, cacheRead: 0, cacheWrite: 0 },
  start,
  end: null,
  itemId: null,
});

describe('shareOf', () => {
  it("the studio's tokens since the window opened, per agent, most first", () => {
    const from = Date.parse('2026-11-24T10:00:00.000Z');
    const spans = [
      span('elon', '2026-11-24T10:30:00.000Z', 300),
      span('pixel', '2026-11-24T11:00:00.000Z', 100),
      span('elon', '2026-11-24T11:30:00.000Z', 300),
      span('pixel', '2026-11-24T09:59:00.000Z', 5000), // before the window
      { ...span('bob', '2026-11-24T11:00:00.000Z', 0), tokens: null }, // not measured
    ];
    expect(shareOf(spans, from)).toEqual([
      { agentId: 'elon', tokens: 600, share: 600 / 700 },
      { agentId: 'pixel', tokens: 100, share: 100 / 700 },
    ]);
    expect(shareOf([], from)).toEqual([]);
  });
});
