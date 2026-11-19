// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Timesheet, WorkTimes } from '../api';
import { HowLong } from './HowLong';

const M = 60_000;
const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'teal' };
const agents = { a: { id: 'a', name: 'Pete', look } } as never;
const times = (activeMs: number, endedAt: string | null): WorkTimes => ({
  startedAt: null,
  endedAt,
  activeMs,
  wallMs: 0,
  runs: 1,
  turns: 0,
  tokens: 0,
  live: 0,
  byAgent: [],
});
const sheet = (o: Partial<Timesheet> = {}): Timesheet => ({
  tasks: [],
  goals: [],
  features: [],
  estimates: { task: null, goal: null, feature: null },
  ...o,
});
const done = (itemId: string, agentId: string, ms: number, endedAt: string) => ({
  itemId,
  goalId: 'g',
  agentId,
  text: `Task ${itemId}`,
  status: 'done',
  time: times(ms, endedAt),
});

afterEach(cleanup);

describe('HowLong', () => {
  it('hidden until something has finished', () => {
    expect(render(<HowLong sheet={undefined} agents={agents} />).container.innerHTML).toBe('');
    expect(render(<HowLong sheet={sheet()} agents={agents} />).container.innerHTML).toBe('');
  });
  it('finished work but no guesses yet: says when they start, lists latest done', () => {
    const c = render(
      <HowLong sheet={sheet({ tasks: [done('1', 'a', 25 * M, '2026-11-19T10:00:00Z')] })} agents={agents} />,
    ).container;
    expect(screen.getByRole('heading', { name: 'How long work takes' })).toBeTruthy();
    expect(c.textContent).toContain('Guesses start once 3 tasks are done.');
    expect(c.querySelector('.pf-done li')?.textContent).toContain('Task 1');
    expect(c.querySelector('.pf-done .ts-num')?.textContent).toBe('25m');
  });
  it('guess rows; a retired agent still shows', () => {
    const e = { ms: { typical: 30 * M, low: 20 * M, high: 45 * M }, tokens: { typical: 0, low: 0, high: 0 } };
    const c = render(
      <HowLong
        sheet={sheet({
          tasks: [done('1', 'gone', 5 * M, '2026-11-19T10:00:00Z')],
          estimates: { task: { ...e, basis: 6, from: 'office' }, goal: null, feature: null },
        })}
        agents={agents}
      />,
    ).container;
    const row = c.querySelector('.pf-guess li') as HTMLElement;
    expect(row.textContent).toContain('A task');
    expect(row.textContent).toContain('~30m');
    expect(row.textContent).toContain('most 20m–45m · from 6 done');
    expect(c.textContent).toContain('a retired agent');
  });
});
