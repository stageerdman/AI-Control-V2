import { describe, expect, it } from 'vitest';
import type { Estimate, Timesheet, WorkTimes } from './api';
import {
  about,
  anyLive,
  basisLine,
  featureTags,
  guessRows,
  latestDone,
  taskTags,
  timeTag,
} from './estimates';

const M = 60_000;
const times = (activeMs: number, over: Partial<WorkTimes> = {}): WorkTimes => ({
  startedAt: activeMs ? '2026-11-19T10:00:00Z' : null,
  endedAt: null,
  activeMs,
  wallMs: 0,
  runs: activeMs ? 1 : 0,
  turns: 0,
  tokens: 0,
  live: 0,
  byAgent: [],
  ...over,
});
const est = (
  typical: number,
  low: number,
  high: number,
  basis = 4,
  from: Estimate['from'] = 'office',
): Estimate => ({
  ms: { typical: typical * M, low: low * M, high: high * M },
  tokens: { typical: 0, low: 0, high: 0 },
  basis,
  from,
});
const sheet = (over: Partial<Timesheet> = {}): Timesheet => ({
  tasks: [],
  goals: [],
  features: [],
  estimates: { task: null, goal: null, feature: null },
  ...over,
});
const task = (itemId: string, status: string, time: WorkTimes, estimate?: Estimate | null) => ({
  itemId,
  goalId: 'g1',
  agentId: 'a-pete',
  text: itemId,
  status,
  time,
  ...(estimate !== undefined ? { estimate } : {}),
});

describe('about', () => {
  it('rounds to 5 minutes under an hour and 15 above', () => {
    expect(about(13 * M)).toBe('15m');
    expect(about(2.4 * M)).toBe('2m');
    expect(about(6 * M)).toBe('5m');
    expect(about(73 * M)).toBe('1h 15m');
    expect(about(119 * M)).toBe('2h');
  });
  it('keeps sub-minute values honest', () => {
    expect(about(20_000)).toBe('<1m');
    expect(about(0)).toBe('0m');
  });
});

describe('basisLine', () => {
  it('names the agent only for their own guess', () => {
    expect(basisLine(est(60, 40, 120, 6, 'agent'), 'task', 'Pete')).toBe(
      'Usually 40m–2h, from 6 finished tasks by Pete',
    );
    expect(basisLine(est(60, 40, 120, 6, 'office'), 'task', 'Pete')).toBe(
      'Usually 40m–2h, from 6 finished tasks',
    );
    expect(basisLine(est(60, 40, 120, 1), 'feature')).toBe('Usually 40m–2h, from 1 shipped feature');
  });
});

describe('timeTag', () => {
  const g = est(30, 20, 45);
  it('done: what it took, or nothing without time', () => {
    expect(timeTag(times(0), false, g)).toBeNull();
    const t = timeTag(times(42 * M, { wallMs: 90 * M }), false, g);
    expect(t).toMatchObject({ text: '42m', spoken: 'took 42m', over: false });
    expect(t?.title).toBe('42m of agent time, 1h 30m start to finish');
    expect(timeTag(times(3 * M, { wallMs: 3.4 * M }), false, g)?.title).toBe('3m of agent time');
  });
  it('open without a guess: so far, or nothing', () => {
    expect(timeTag(times(0), true, null)).toBeNull();
    expect(timeTag(times(10 * M), true, null)).toMatchObject({ text: '10m', spoken: '10m so far' });
  });
  it('open, not started: the guess', () => {
    expect(timeTag(times(0), true, g)).toMatchObject({
      text: '~30m',
      spoken: 'usually about 30m',
      over: false,
    });
  });
  it('open and started: so far of the guess, flagged once past the range', () => {
    expect(timeTag(times(10 * M), true, g)).toMatchObject({ text: '10m of ~30m', over: false });
    const long = timeTag(times(50 * M), true, g);
    expect(long).toMatchObject({ text: '50m of ~30m', over: true });
    expect(long?.spoken).toContain('running long');
  });
});

describe('taskTags', () => {
  it("uses the assignee's guess, else the office's, and skips empty ones", () => {
    const s = sheet({
      tasks: [
        task('own', 'todo', times(0), est(10, 5, 15, 3, 'agent')),
        task('office', 'todo', times(0)),
        task('none', 'todo', times(0), null),
        task('done', 'done', times(25 * M, { endedAt: '2026-11-19T11:00:00Z' })),
        task('skipped', 'skipped', times(0)),
      ],
      estimates: { task: est(60, 30, 90), goal: null, feature: null },
    });
    const tags = taskTags(s, () => 'Pete');
    expect(tags.get('own')?.text).toBe('~10m');
    expect(tags.get('own')?.title).toContain('by Pete');
    expect(tags.get('office')?.text).toBe('~1h');
    expect(tags.has('none')).toBe(false);
    expect(tags.get('done')?.text).toBe('25m');
    expect(tags.has('skipped')).toBe(false);
  });
  it('is empty without a sheet', () => {
    expect(taskTags(undefined, () => '').size).toBe(0);
  });
});

describe('featureTags', () => {
  it('shipped = took, started = so far of the usual, not started = nothing (same guess on every row)', () => {
    const s = sheet({
      features: [
        { featureId: 'f1', name: 'A', status: 'shipped', goals: 2, time: times(3 * 60 * M) },
        { featureId: 'f2', name: 'B', status: 'planned', goals: 0, time: times(0) },
        { featureId: 'f3', name: 'C', status: 'now', goals: 1, time: times(20 * M) },
      ],
      estimates: { task: null, goal: null, feature: est(240, 120, 360) },
    });
    const tags = featureTags(s);
    expect(tags.get('f1')?.text).toBe('3h');
    expect(tags.has('f2')).toBe(false);
    expect(tags.get('f3')?.text).toBe('20m of ~4h');
  });
  it('shelved / denied show what they took, not "so far of the usual"', () => {
    const s = sheet({
      features: [
        { featureId: 'f1', name: 'A', status: 'shelved', goals: 1, time: times(20 * M) },
        { featureId: 'f2', name: 'B', status: 'denied', goals: 1, time: times(5 * M) },
      ],
      estimates: { task: null, goal: null, feature: est(240, 120, 360) },
    });
    const tags = featureTags(s);
    expect(tags.get('f1')?.text).toBe('20m');
    expect(tags.get('f2')?.spoken).toBe('took 5m');
  });
});

describe('guessRows', () => {
  it('one row per kind with a guess, smallest first', () => {
    const rows = guessRows(
      sheet({ estimates: { task: est(30, 20, 45, 7), goal: null, feature: est(240, 120, 360) } }),
    );
    expect(rows.map((r) => r.id)).toEqual(['task', 'feature']);
    expect(rows[0]).toEqual({ id: 'task', label: 'A task', usual: '30m', range: '20m–45m', basis: 7 });
    expect(guessRows(undefined)).toEqual([]);
  });
});

describe('latestDone / anyLive', () => {
  it('newest finished tasks with time', () => {
    const s = sheet({
      tasks: [
        task('old', 'done', times(5 * M, { endedAt: '2026-11-18T10:00:00Z' })),
        task('new', 'done', times(5 * M, { endedAt: '2026-11-19T10:00:00Z' })),
        task('empty', 'done', times(0, { endedAt: '2026-11-19T12:00:00Z' })),
        task('open', 'running', times(5 * M, { live: 1 })),
      ],
    });
    expect(latestDone(s).map((t) => t.itemId)).toEqual(['new', 'old']);
    expect(latestDone(s, 1).map((t) => t.itemId)).toEqual(['new']);
    expect(anyLive(s)).toBe(true);
    expect(anyLive(sheet())).toBe(false);
  });
});
