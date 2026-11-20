/* Task order (src/domain/task-order.ts): what a task depends on, and whether it may start. */
import { describe, expect, it } from 'vitest';
import { dependsOn, orderGate } from '../../src/domain/task-order.ts';

const list = (...xs: [string, boolean?][]) => xs.map(([status, parallel = false]) => ({ status, parallel }));

describe('orderGate', () => {
  it('waits while a task it depends on is open — building, in review or merging (todo/running)', () => {
    expect(orderGate(list(['running'], ['todo']), 1)).toBe('wait');
    expect(orderGate(list(['todo'], ['todo']), 1)).toBe('wait');
  });
  it('goes once every task it depends on is done', () => {
    expect(orderGate(list(['done'], ['done'], ['todo']), 2)).toBe('go');
  });
  it('is held (skip) when one it depends on failed or was held itself', () => {
    expect(orderGate(list(['failed'], ['todo']), 1)).toBe('skip');
    expect(orderGate(list(['done'], ['cancelled'], ['todo']), 2)).toBe('skip');
  });
  it('a parallel task runs alongside the one before it: it depends only on what came before their group', () => {
    const l = list(['done'], ['running'], ['todo', true]);
    expect(dependsOn(l, 2)).toEqual([l[0]]);
    expect(orderGate(l, 2)).toBe('go');
    expect(orderGate(list(['running'], ['todo', true]), 1)).toBe('go');
  });
  it('a team member’s part never skips: it waits for what is open, then goes', () => {
    expect(orderGate(list(['failed'], ['todo']), 1, true)).toBe('go');
    expect(orderGate(list(['running'], ['todo']), 1, true)).toBe('wait');
  });
});
