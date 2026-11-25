/* Context Window Management, the pure parts: the session meter, the resume-or-fresh rule, the summary maths and
   the handoff brief. */
import { describe, expect, it } from 'vitest';
import { handoffBrief } from '../../src/context/handoff.ts';
import { createMeter } from '../../src/context/meter.ts';
import { CACHE_WARM_MS, RESUME_MAX_CONTEXT, resumeOrFresh } from '../../src/context/resume-rule.ts';
import type { RunSession } from '../../src/context/sessions.ts';
import { median, summarize } from '../../src/context/summary.ts';

describe('meter', () => {
  it('keeps the first, peak and last context and counts turns', () => {
    const m = createMeter();
    expect([m.turns, m.first, m.peak, m.last]).toEqual([0, null, null, 0]);
    for (const c of [12_000, 30_000, 25_000]) m.see(c);
    expect([m.turns, m.first, m.peak, m.last]).toEqual([3, 12_000, 30_000, 25_000]);
  });
});

describe('resume or fresh', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('resumes only a small, warm session', () => {
    expect(resumeOrFresh({ lastContext: 20_000, endedAt: ago(60_000) }, now)).toEqual({ resume: true });
  });
  it('starts fresh when the session is big, cold or not measured — and says why', () => {
    const big = resumeOrFresh({ lastContext: RESUME_MAX_CONTEXT, endedAt: ago(1000) }, now);
    expect(big).toEqual({ resume: false, why: 'its last session ended at 40 k tokens of context' });
    const cold = resumeOrFresh({ lastContext: 1000, endedAt: ago(CACHE_WARM_MS) }, now);
    expect(cold).toMatchObject({ resume: false, why: expect.stringMatching(/5 min ago/) });
    expect(resumeOrFresh(null, now)).toMatchObject({
      resume: false,
      why: expect.stringMatching(/not measured/),
    });
  });
});

const session = (p: Partial<RunSession>): RunSession => ({
  runId: 'r',
  n: 1,
  projectId: 'p',
  agentId: 'bob',
  kind: 'building',
  startedBy: 'new',
  why: null,
  resumedGapMs: null,
  startedAt: '2026-11-25T10:00:00Z',
  endedAt: '2026-11-25T10:10:00Z',
  turns: 0,
  firstContext: null,
  peakContext: null,
  lastContext: 0,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  costUsd: null,
  endedBy: 'succeeded',
  ...p,
});

describe('summary', () => {
  it('is empty for no sessions', () => {
    expect(summarize([])).toMatchObject({ agents: [], coldStart: null, resumeStart: null });
    expect(summarize([]).total).toMatchObject({ sessions: 0, avgContext: null, reReadShare: null });
  });
  it('tallies starts, context and re-reads per agent, biggest first', () => {
    const s = summarize([
      session({
        agentId: 'jony',
        turns: 2,
        firstContext: 10_000,
        peakContext: 12_000,
        usage: { input: 2, output: 50, cacheRead: 18_000, cacheWrite: 4_000 },
        costUsd: 0.5,
      }),
      session({
        startedBy: 'resume',
        turns: 4,
        firstContext: 50_000,
        peakContext: 60_000,
        usage: { input: 0, output: 100, cacheRead: 200_000, cacheWrite: 20_000 },
        costUsd: 1,
      }),
      session({ startedBy: 'forget', turns: 1, firstContext: 14_000, peakContext: 14_000 }),
    ]);
    expect(s.agents.map((a) => a.agentId)).toEqual(['bob', 'jony']);
    expect(s.agents[0]).toMatchObject({
      sessions: 2,
      starts: { new: 0, rework: 0, resume: 1, forget: 1, limit: 0 },
      turns: 5,
      contextTokens: 220_000,
      avgContext: 44_000,
      peakContext: 60_000,
      costUsd: 1,
    });
    expect(s.agents[0]?.reReadShare).toBeCloseTo(200 / 220);
    expect(s.coldStart).toBe(12_000); // median of 10 k and 14 k: resumes don't count
    expect(s.resumeStart).toBe(50_000);
    expect(s.total.costUsd).toBe(1.5);
  });
  it('median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
  });
});

describe('handoff brief', () => {
  it('holds the ask, the work so far, the last words, the desk note and the original brief', () => {
    const text = handoffBrief({
      ask: 'Lint sent it back: fix the null check.',
      original: 'Build the cart.',
      work: 'abc123 cart\n cart.ts | 10 +++',
      lastWords: 'Built the cart.',
      note: { where: 'cart.ts', doing: 'tests', next: 'run them' },
    });
    expect(text.startsWith('Lint sent it back')).toBe(true);
    for (const part of [
      'fresh memory',
      'abc123 cart',
      'Built the cart.',
      'Next step: run them',
      'Build the cart.',
    ])
      expect(text).toContain(part);
  });
  it('leaves out what it does not have', () => {
    const text = handoffBrief({
      ask: 'Fix it.',
      original: 'Brief.',
      work: null,
      lastWords: null,
      note: null,
    });
    expect(text).not.toMatch(/work so far|summary last time|desk note/);
  });
});
