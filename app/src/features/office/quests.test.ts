import { describe, expect, it } from 'vitest';
import type { ChecklistItem, Goal } from '../../api';
import type { Feature } from './api';
import { mainQuest, questBoard, sideCount, sideItem } from './quests';

const NOW = new Date('2026-11-16T15:30:00');
const item = (id: string, status: ChecklistItem['status'], goalId = 'g'): ChecklistItem =>
  ({ id, goalId, text: id, status, agentId: 'a', stage: 'build', note: null, subtasks: [] }) as never;
const goal = (o: Partial<Goal>): Goal =>
  ({
    id: 'g',
    text: 'Goal',
    status: 'running',
    items: [],
    pct: 0,
    quest: 'main',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...o,
  }) as Goal;
const feat = (o: Partial<Feature>): Feature =>
  ({ id: 'f', name: 'Quests', status: 'now', order: 0, pct: 60, ...o }) as Feature;

describe('mainQuest', () => {
  it('is the running main goal’s feature: its name, its %, the steps of main goals only', () => {
    const goals = [
      goal({ id: 's', quest: 'side', items: [item('s1', 'running', 's')] }),
      goal({
        id: 'm',
        featureId: 'f',
        ships: true,
        items: [item('m1', 'done', 'm'), item('m2', 'running', 'm')],
      }),
    ];
    const q = mainQuest(goals, [feat({})]);
    expect(q).toMatchObject({ name: 'Quests', featureId: 'f', pct: 60, ships: true, done: 1, total: 2 });
    expect(q?.steps.map((s) => s.id)).toEqual(['m1', 'm2']);
  });
  it('a main goal with no feature: the goal’s text and %', () => {
    expect(mainQuest([goal({ text: 'Tidy up', pct: 33 })], [])).toMatchObject({
      name: 'Tidy up',
      pct: 33,
      featureId: null,
    });
  });
  it('none: null (only side quests)', () => {
    expect(mainQuest([goal({ quest: 'side' })], [])).toBeNull();
  });
  it('a stopped main goal’s failed step carries its Continue / Drop', () => {
    const g = goal({ status: 'failed', items: [item('a', 'done'), item('b', 'failed'), item('c', 'todo')] });
    expect(mainQuest([g], [])?.stuckGoalOf).toEqual({ b: 'g' });
  });
  it('an old server (no quest): everything is main', () => {
    const g = goal({ quest: undefined, items: [item('x', 'running')] });
    expect(mainQuest([g], [])?.total).toBe(1);
    expect(questBoard([g], [], NOW).tagged).toBe(false);
  });
});

describe('questBoard', () => {
  it('the other features in progress fold under the open one', () => {
    const b = questBoard(
      [goal({ featureId: 'f' })],
      [feat({}), feat({ id: 'f2', name: 'Perf', order: 1 }), feat({ id: 'f3', status: 'planned' })],
      NOW,
    );
    expect(b.others.map((f) => f.id)).toEqual(['f2']);
  });
  it('side quests: stuck first, then open, then the ones done this hour; older done ones fold; older dropped ones go', () => {
    const old = '2026-11-16T13:10:00';
    const goals = [
      goal({ id: 'run', quest: 'side', status: 'running' }),
      goal({ id: 'done-now', quest: 'side', status: 'done' }),
      goal({ id: 'stuck', quest: 'side', status: 'failed' }),
      goal({ id: 'done-old', quest: 'side', status: 'done', updatedAt: old }),
      goal({ id: 'drop-old', quest: 'side', status: 'cancelled', updatedAt: old }),
      goal({ id: 'main' }),
    ];
    const b = questBoard(goals, [], NOW);
    expect(b.side.map((s) => s.goal.id)).toEqual(['stuck', 'run', 'done-now']);
    expect(b.doneEarlier.map((s) => s.goal.id)).toEqual(['done-old']);
    expect(b.stuckSide.map((g) => g.id)).toEqual(['stuck']);
    expect(b.count).toBe('1 open · 1 stuck');
  });
  it('an empty project still shows the side section (empty state)', () => {
    expect(questBoard([], [], NOW)).toMatchObject({ tagged: true, main: null, side: [], count: null });
  });
});

describe('sideCount / sideItem', () => {
  it('leaves out zero parts; "All done" when nothing is open', () => {
    expect(sideCount([goal({ status: 'running' }), goal({ status: 'running' })])).toBe('2 open');
    expect(sideCount([goal({ status: 'done' })])).toBe('All done');
    expect(sideCount([])).toBeNull();
  });
  it('speaks for the running item, the failed one, or the last one done', () => {
    expect(sideItem(goal({ items: [item('a', 'done'), item('b', 'running')] }))?.id).toBe('b');
    expect(sideItem(goal({ items: [item('a', 'todo')] }))?.id).toBe('a');
    expect(sideItem(goal({ status: 'failed', items: [item('a', 'done'), item('b', 'failed')] }))?.id).toBe(
      'b',
    );
    expect(sideItem(goal({ status: 'done', items: [item('a', 'done'), item('b', 'done')] }))?.id).toBe('b');
    expect(sideItem(goal({ items: [] }))).toBeNull();
  });
});
