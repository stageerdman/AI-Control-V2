// @vitest-environment happy-dom
/* OFFICE: the second progress bar above the safe is gone; the wall clock above the door opens How the team works. */
import { describe, expect, it } from 'vitest';
import type { WorkTime } from './api';
import { officeLayout } from './layout';
import { boardFacts } from './state';
import { clockLabel } from './TimeSheet';
import { officeArt, syncArt } from './theme';
import { worked } from './time';

const H = 3_600_000;
const M = 60_000;
const none: WorkTime = {
  totalMs: 0,
  byKind: [
    { kind: 'thinking', label: 'Thinking & planning', ms: 0 },
    { kind: 'building', label: 'Coding & building', ms: 0 },
    { kind: 'reviewing', label: 'Reviewing', ms: 0 },
    { kind: 'research', label: 'Research & reports', ms: 0 },
    { kind: 'setup', label: 'Setup', ms: 0 },
  ],
  byAgent: [],
  runs: 0,
  turns: 0,
  since: null,
  live: 0,
};
const some: WorkTime = {
  ...none,
  totalMs: 12 * H + 40 * M,
  byKind: none.byKind.map((k) =>
    k.kind === 'building' ? { ...k, ms: 10 * H } : k.kind === 'thinking' ? { ...k, ms: 2 * H + 40 * M } : k,
  ),
  byAgent: [
    { agentId: 'a-semic', ms: 10 * H, runs: 5 },
    { agentId: 'a-gone', ms: 2 * H + 40 * M, runs: 3 },
  ],
  runs: 8,
  turns: 140,
  since: '2026-11-03T10:00:00Z',
  live: 2,
};

describe('the work clock', () => {
  it('worked(): minutes, hours, never days', () => {
    expect(worked(0)).toBe('0m');
    expect(worked(59_000)).toBe('<1m');
    expect(worked(45 * M)).toBe('45m');
    expect(worked(3 * H)).toBe('3h');
    expect(worked(12 * H + 40 * M)).toBe('12h 40m');
    expect(worked(99 * H + 59 * M)).toBe('99h 59m');
    expect(worked(128 * H + 5 * M)).toBe('128h');
    expect(worked(Number.NaN)).toBe('0m');
  });

  it('the plaque above the safe is gone (no bar, no time); the wall clock above the door is the control', () => {
    const plan = officeLayout({ teams: [], solo: [] });
    expect(plan.objects.clock).toMatchObject({ x: 64, y: 40, w: 60, h: 60 });
    expect(Object.keys(plan.objects)).not.toContain('timeclock');
    expect(Object.keys(plan.objects)).not.toContain('plaque');
    const host = document.createElement('div');
    host.innerHTML = officeArt(plan, { title: 'Habit Hatch', teams: {} });
    for (const gone of ['#bossBar', '#bossPct', '#otTimeClock', '#otTimeTxt'])
      expect(host.querySelector(gone)).toBeNull();
    syncArt(host, boardFacts({ time: some }));
    expect(host.querySelector('#otClock')?.getAttribute('class')).toBe('ticking');
    syncArt(host, boardFacts({ time: none }));
    expect(host.querySelector('#otClock')?.getAttribute('class')).toBe('');
  });

  it('the clock’s label says the time and who is working', () => {
    expect(clockLabel(undefined)).toBe('Agent time: none yet');
    expect(clockLabel(none)).toBe('Agent time: none yet');
    expect(clockLabel(some)).toBe('Agent time: 12h 40m, 2 agents working now');
  });
  // The sheet behind the clock: performance/TeamSheet.test.tsx.
});
