/* Stall alerts, the pure part (src/crew/stall.ts): why it stopped, what is done, one message per stop. */
import { describe, expect, it } from 'vitest';
import { coalesce, failedReason, goalStall, itemStall, stallText, trimOutput } from '../../src/crew/stall.ts';
import type { ChecklistItem, Goal } from '../../src/db/work.ts';
import { afterLimit } from '../../src/runtime/limits.ts';

const item = (over: Partial<ChecklistItem>): ChecklistItem =>
  ({
    id: 'i1',
    text: 'Build it',
    status: 'todo',
    stage: 'build',
    buildRunId: null,
    parallel: false,
    note: null,
    notes: null,
    sendBacks: 0,
    reviews: [],
    workspace: null,
    parentId: null,
    ...over,
  }) as ChecklistItem;
const goal = (items: ChecklistItem[]): Goal =>
  ({ id: 'g1', projectId: 'aurora', text: 'The goal', status: 'running', items }) as Goal;

const STUCK = (() => {
  const v = afterLimit({ sessions: 1, stalls: 1 }, false, 40);
  if (v.carryOn) throw new Error('expected a stuck stop');
  return v.error;
})();

describe('trimOutput', () => {
  it('keeps short output whole', () => {
    expect(trimOutput('a\n\nb')).toBe('a\nb');
  });
  it('keeps the error lines of a long log, not its noise', () => {
    const log = [...Array.from({ length: 40 }, (_, i) => `compiling ${i}`), 'error: x is undefined', 'done'];
    const out = trimOutput(log.join('\n'));
    expect(out).toContain('error: x is undefined');
    expect(out).not.toContain('compiling 3');
  });
});

describe('failedReason', () => {
  it('a plain failure carries its failing output, without the kept-branch tail', () => {
    const r = failedReason(item({ note: 'FAIL test/a.test.ts — work kept on branch studio/x' }), 1);
    expect(r).toEqual({ kind: 'failed', reason: 'FAIL test/a.test.ts' });
  });
  it('sent back past the limit carries the reviewer’s last notes', () => {
    const reviews = [
      { verdict: 'changes', notes: 'first' },
      { verdict: 'changes', notes: 'second' },
    ] as ChecklistItem['reviews'];
    const r = failedReason(item({ sendBacks: 2, reviews }), 1);
    expect(r.kind).toBe('sent-back');
    expect(r.reason).toContain('the limit is 1');
    expect(r.reason).toContain('last notes: second');
  });
  it('a run the step limit gave up on is stuck, naming the limit', () => {
    const r = failedReason(item({ note: STUCK }), 1);
    expect(r.kind).toBe('stuck');
    expect(r.reason).toContain('A limit was hit: Stopped: no new work');
  });
});

describe('goalStall and coalesce', () => {
  const a = item({ id: 'a', text: 'A', status: 'done', workspace: { branch: 'studio/a' } as never });
  const b = item({ id: 'b', text: 'B', status: 'failed', note: 'boom — work kept on branch studio/b' });
  const c = item({
    id: 'c',
    text: 'C',
    status: 'cancelled',
    note: 'Skipped: an earlier item did not succeed',
  });
  const g = goal([a, b, c]);

  it('the goal’s alert names each failed task and what never started, and what is done', () => {
    const s = goalStall(g, 1);
    expect(s).toMatchObject({ kind: 'goal-stopped', itemId: null, goalStopped: true });
    expect(s.blocked).toEqual([{ task: 'C', waitsOn: ['B'] }]);
    expect(s.reason).toBe('“B” failed: boom');
    expect(s.done).toEqual({
      finished: ['A'],
      merged: [{ task: 'A', branch: 'studio/a' }],
      kept: ['studio/b'],
    });
  });
  it('a task stop that stopped its goal is one alert; repeats of the same stop go', () => {
    const task = itemStall(g, b, 1);
    const out = coalesce([task, task, goalStall(g, 1)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: 'b', kind: 'failed', goalStopped: true });
    expect(out[0]?.blocked).toEqual([{ task: 'C', waitsOn: ['B'] }]);
  });
  it('a task that stalls tells what waits on it, before dispatch even holds it', () => {
    const waiting = item({ id: 'c', text: 'C' });
    const s = itemStall(goal([a, b, waiting]), b, 1);
    expect(s.blocked).toEqual([{ task: 'C', waitsOn: ['B'] }]);
  });
  it('a task stuck but still open (back with the orchestrator) is the missing dependency', () => {
    const stuck = item({ id: 'b', text: 'B', status: 'todo', buildRunId: 'r1' });
    const waiting = item({ id: 'c', text: 'C' });
    const s = itemStall(goal([a, stuck, waiting]), stuck, 1, { kind: 'stuck', reason: 'same note twice' });
    expect(s.blocked).toEqual([{ task: 'C', waitsOn: ['B'] }]);
  });
  it('a parallel partner does not depend on the stalled task', () => {
    const partner = item({ id: 'c', text: 'C', parallel: true });
    expect(itemStall(goal([a, b, partner]), b, 1).blocked).toEqual([]);
  });
  it('a goal stopping on its own stays its own alert', () => {
    expect(coalesce([goalStall(g, 1)]).map((s) => s.kind)).toEqual(['goal-stopped']);
  });
});

describe('stallText', () => {
  it('says what stopped, why, what never started and what is done', () => {
    const g = goal([
      item({ id: 'a', text: 'A', status: 'done', workspace: { branch: 'studio/a' } as never }),
      item({ id: 'b', text: 'B', status: 'failed', note: 'boom — work kept on branch studio/b' }),
      item({ id: 'c', text: 'C', status: 'cancelled', note: 'Skipped: an earlier item did not succeed' }),
    ]);
    const [s] = coalesce([itemStall(g, g.items[1] as ChecklistItem, 1), goalStall(g, 1)]);
    const text = stallText(s as never, 'The goal', 'B');
    expect(text).toContain('stall alert: The task “B” on the goal “The goal” failed.');
    expect(text).toContain('Why: boom');
    expect(text).toContain('The goal stopped with it.');
    expect(text).toContain("On hold, because a task they depend on didn't finish: “C” (waits on “B”).");
    expect(text).toContain('Done so far: Finished: “A”. Merged into main: “A” (studio/a).');
    expect(text).toContain('Stopped work is kept on branch studio/b.');
  });
  it('nothing done says so', () => {
    const g = goal([item({ status: 'failed', note: 'x' })]);
    expect(stallText(goalStall(g, 1), 'The goal', null)).toContain('Done so far: Nothing is finished yet.');
  });
});
