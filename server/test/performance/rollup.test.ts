/* Time estimates, the pure core: spans + the whiteboard → per task / goal / feature times; finished times → a guess. */
import { describe, expect, it } from 'vitest';
import { estimateFrom, estimatesOf, quantile } from '../../src/performance/estimate.ts';
import { type Board, rollUp, timesOf, type WorkTimes } from '../../src/performance/rollup.ts';
import type { Span } from '../../src/performance/spans.ts';

const T0 = Date.parse('2026-11-19T09:00:00.000Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const MIN = 60_000;

const span = (
  agentId: string,
  itemId: string | null,
  from: number,
  to: number | 'live',
  tokens = 100,
): Span => ({
  agentId,
  kind: 'building',
  asked: 'task',
  outcome: to === 'live' ? 'live' : 'done',
  turns: 1,
  tokens: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0 },
  start: at(from),
  end: to === 'live' ? null : at(to),
  itemId,
});

const board: Board = {
  items: [
    { id: 'i1', goalId: 'g1', parentId: null, agentId: 'a-cap', text: 'Build search', status: 'done' },
    { id: 'i1a', goalId: 'g1', parentId: 'i1', agentId: 'a-pete', text: 'Search UI', status: 'done' },
    { id: 'i2', goalId: 'g1', parentId: null, agentId: 'a-bob', text: 'API', status: 'done' },
    { id: 'i3', goalId: 'g2', parentId: null, agentId: 'a-bob', text: 'More', status: 'running' },
  ],
  goals: [
    { id: 'g1', featureId: 'f1', text: 'Search', status: 'done' },
    { id: 'g2', featureId: 'f1', text: 'More search', status: 'running' },
  ],
  features: [{ id: 'f1', name: 'Search', status: 'now' }],
};

describe('rollUp', () => {
  const spans = [
    span('a-cap', 'i1', 0, 10), // the captain's split
    span('a-pete', 'i1a', 10, 40), // a member's sub-task: counts in i1
    span('a-pete', 'i1a', 15, 25), // side by side: agent time adds, wall time doesn't
    span('a-bob', 'i2', 0, 20),
    span('a-bob', 'i3', 50, 'live'),
    span('a-pixel', null, 0, 5), // a chat: no task's work
  ];
  const sheet = rollUp(spans, board, T0 + 60 * MIN);

  it('a task sums its own runs and its members’ sub-tasks; sub-tasks are not tasks of their own', () => {
    expect(sheet.tasks.map((t) => t.itemId)).toEqual(['i1', 'i2', 'i3']);
    const i1 = sheet.tasks[0]?.time as WorkTimes;
    expect(i1).toMatchObject({ startedAt: at(0), endedAt: at(40), runs: 3, turns: 3, tokens: 300, live: 0 });
    expect(i1.activeMs).toBe(50 * MIN);
    expect(i1.wallMs).toBe(40 * MIN);
    expect(i1.byAgent).toEqual([
      { agentId: 'a-pete', ms: 40 * MIN, tokens: 200, runs: 2 },
      { agentId: 'a-cap', ms: 10 * MIN, tokens: 100, runs: 1 },
    ]);
  });

  it('open work has no end and counts up to now', () => {
    const i3 = sheet.tasks[2]?.time as WorkTimes;
    expect(i3).toMatchObject({ endedAt: null, live: 1, activeMs: 10 * MIN, wallMs: 10 * MIN });
  });

  it('goals sum their tasks, features their goals; work with no task is left out', () => {
    expect(sheet.goals.map((g) => [g.goalId, g.tasks, g.time.activeMs / MIN, g.time.endedAt])).toEqual([
      ['g1', 2, 70, at(40)],
      ['g2', 1, 10, null],
    ]);
    const f1 = sheet.features[0];
    expect(f1).toMatchObject({ featureId: 'f1', goals: 2 });
    expect(f1?.time.activeMs).toBe(80 * MIN); // not the chat
    expect(f1?.time.endedAt).toBeNull(); // not shipped yet
  });

  it('a finished item with no spans: no start, no end, nothing counted', () => {
    expect(timesOf([], true, T0)).toMatchObject({ startedAt: null, endedAt: null, activeMs: 0, wallMs: 0 });
  });
});

describe('estimates', () => {
  const t = (min: number, tokens = min * 10): WorkTimes => ({
    ...timesOf([span('a', 'x', 0, min, tokens)], true, T0),
  });

  it('quantile interpolates; empty is 0', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10, 20, 30], 0.25)).toBe(15);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('median with the middle half as the range; a hung run barely moves it; under 3 samples → null', () => {
    const e = estimateFrom([t(10), t(20), t(30), t(600)], 'office');
    expect(e).toEqual({
      ms: { typical: 25 * MIN, low: 17.5 * MIN, high: 172.5 * MIN },
      tokens: { typical: 250, low: 175, high: 1725 },
      basis: 4,
      from: 'office',
    });
    expect(estimateFrom([t(10), t(20)], 'office')).toBeNull();
  });

  it('a task: the assignee’s own past when there is enough, else the office’s; only finished, done work counts', () => {
    const task = (id: string, agentId: string, min: number, status = 'done') => ({
      itemId: id,
      goalId: 'g',
      agentId,
      text: id,
      status,
      time: t(min),
    });
    const sheet = {
      tasks: [
        task('1', 'a-bob', 10),
        task('2', 'a-bob', 12),
        task('3', 'a-bob', 14),
        task('4', 'a-pete', 100),
        task('5', 'a-pete', 100, 'failed'), // a failed task is no sample
      ],
      goals: [],
      features: [],
    };
    expect(estimatesOf(sheet, 'a-bob').task).toMatchObject({
      from: 'agent',
      basis: 3,
      ms: { typical: 12 * MIN },
    });
    expect(estimatesOf(sheet, 'a-pete').task).toMatchObject({ from: 'office', basis: 4 });
    expect(estimatesOf(sheet).task?.from).toBe('office');
    expect(estimatesOf(sheet)).toMatchObject({ goal: null, feature: null });
  });
});
