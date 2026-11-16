import { describe, expect, it } from 'vitest';
import {
  afterLimit,
  afterNote,
  carriesOn,
  isLimit,
  limitBrief,
  MAX_SESSIONS,
  MAX_STALLS,
  turnCapError,
} from '../../src/runtime/limits.ts';

describe('limits', () => {
  it('knows a limit from any other failure', () => {
    expect(isLimit(turnCapError(120))).toBe(true);
    expect(isLimit('error_max_turns')).toBe(true);
    expect(isLimit('error_max_budget_usd')).toBe(true);
    expect(isLimit('Claude Code exited (code 1)')).toBe(false);
    expect(isLimit(undefined)).toBe(false);
  });

  it('carries on while it commits; a commit resets the stall count', () => {
    const v = afterLimit({ sessions: 3, stalls: 1 }, true, 120);
    expect(v).toEqual({ carryOn: true, state: { sessions: 4, stalls: 0 } });
  });

  it(`stops as stuck after ${MAX_STALLS} sessions in a row with no new commit`, () => {
    let state = { sessions: 0, stalls: 0 };
    for (let i = 1; i < MAX_STALLS; i++) {
      const v = afterLimit(state, false, 120);
      if (!v.carryOn) throw new Error('stopped too early');
      state = v.state;
    }
    const v = afterLimit(state, false, 120);
    expect(v.carryOn).toBe(false);
    if (!v.carryOn) expect(isLimit(v.error)).toBe(false); // never read as a limit again
  });

  it(`stops after ${MAX_SESSIONS} fresh sessions even when it keeps committing`, () => {
    expect(afterLimit({ sessions: MAX_SESSIONS, stalls: 0 }, true, 120)).toMatchObject({ carryOn: false });
  });

  it('the brief carries the latest desk note and the original task', () => {
    const b = limitBrief('Build the thing', 120, { where: 'a.ts done', doing: 'b.ts', next: 'tests' });
    expect(b).toContain('step limit of a session (120 steps)');
    expect(b).toContain('Next step: tests');
    expect(b).toContain('Build the thing');
    expect(limitBrief('Build', 120, null)).not.toContain('Your latest note');
  });

  it('builds and research carry on; reviews, chats and unknown kinds do not', () => {
    expect(carriesOn('building')).toBe(true);
    expect(carriesOn('research')).toBe(true);
    expect(carriesOn('reviewing')).toBe(false);
    expect(carriesOn('thinking')).toBe(false);
    expect(carriesOn(undefined)).toBe(false);
  });

  it('a desk note resets the stall count, so a note between two bare sessions is not "stuck"', () => {
    const first = afterLimit({ sessions: 0, stalls: 0 }, false, 120);
    if (!first.carryOn) throw new Error('stopped too early');
    expect(afterLimit(afterNote(first.state), false, 120).carryOn).toBe(true);
  });

  it('a research brief asks for findings and notes, never for commits', () => {
    const b = limitBrief('Audit', 120, null, 'research');
    expect(b).not.toMatch(/commit/i);
    expect(b).toContain('forget');
  });
});
