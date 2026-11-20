/* The one check every task finishes through: done only with real work (SuperCut: a plan-only reply showed 100%). */
import { describe, expect, it } from 'vitest';
import {
  didRealWork,
  isWorkStep,
  MAX_PLAN_ONLY,
  NO_WORK,
  planOnlyBrief,
  workVerdict,
} from '../../src/domain/real-work.ts';

describe('real work', () => {
  it('commands, edits and writes are work; reading, searching and asking are not', () => {
    expect(['running', 'editing', 'writing'].every(isWorkStep)).toBe(true);
    expect(['reading', 'searching', 'thinking', 'asking'].some(isWorkStep)).toBe(false);
  });

  it('a step, a changed checkout or a filed report each count as real work', () => {
    expect(didRealWork(NO_WORK)).toBe(false);
    expect(didRealWork({ ...NO_WORK, steps: 1 })).toBe(true);
    expect(didRealWork({ ...NO_WORK, changed: true })).toBe(true);
    expect(didRealWork({ ...NO_WORK, reportFiled: true })).toBe(true);
  });

  it('real work is done', () => {
    expect(workVerdict({ ...NO_WORK, steps: 3 }, false, 0)).toEqual({ kind: 'done' });
    expect(workVerdict({ ...NO_WORK, changed: true }, false, MAX_PLAN_ONLY)).toEqual({ kind: 'done' });
  });

  it('a plan-only reply carries on, round by round, then fails — it never shows as done', () => {
    const rounds = Array.from({ length: MAX_PLAN_ONLY + 1 }, (_, n) => workVerdict(NO_WORK, false, n));
    expect(rounds.slice(0, MAX_PLAN_ONLY)).toEqual(
      Array.from({ length: MAX_PLAN_ONLY }, (_, n) => ({ kind: 'carry-on', round: n + 1 })),
    );
    expect(rounds.at(-1)).toMatchObject({
      kind: 'failed',
      note: expect.stringMatching(/without doing the work/),
    });
  });

  it('a report task needs its report, whatever else it did', () => {
    expect(workVerdict({ ...NO_WORK, steps: 5 }, true, 0)).toEqual({
      kind: 'failed',
      note: 'Finished without filing the report',
    });
    expect(workVerdict({ ...NO_WORK, reportFiled: true }, true, 0)).toEqual({ kind: 'done' });
  });

  it('the carry-on brief names the task and asks for the work, not another plan', () => {
    const brief = planOnlyBrief('Swift build check');
    expect(brief).toContain('"Swift build check"');
    expect(brief).toContain('Do the work now');
  });
});
