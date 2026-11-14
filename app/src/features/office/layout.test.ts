import { describe, expect, it } from 'vitest';
import { officeLayout, type Plan } from './layout';

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
/* the prototype's demo sizes (data-office.js OFFICE_CONFIGS), with generated ids */
const SIZES = {
  2: { teams: [{ id: 'ship', members: ids('s', 2) }], solo: [] },
  6: {
    teams: [
      { id: 'ship', members: ids('s', 3) },
      { id: 'pol', members: ids('p', 3) },
    ],
    solo: [],
  },
  12: {
    teams: [
      { id: 'ship', members: ids('s', 3) },
      { id: 'pol', members: ids('p', 3) },
      { id: 'eng', members: ids('e', 3) },
    ],
    solo: ids('x', 3),
  },
  20: {
    teams: [
      { id: 'ship', members: ids('s', 4) },
      { id: 'pol', members: ids('p', 3) },
      { id: 'eng', members: ids('e', 3) },
      { id: 'exp', members: ids('r', 4) },
      { id: 'night', members: ids('n', 4) },
    ],
    solo: ids('x', 2),
  },
} as const;

const overlap = (a: { x: number; w: number }, b: { x: number; w: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w;
const everyone = (cfg: { teams: readonly { members: readonly string[] }[]; solo: readonly string[] }) => [
  ...cfg.teams.flatMap((t) => t.members),
  ...cfg.solo,
];

function invariants(plan: Plan, people: string[]) {
  /* every agent has a desk, desks are unique, inside the floor, left of the Director's column */
  const seats = people.map((id) => plan.home[id]);
  expect(seats.every(Boolean)).toBe(true);
  expect(new Set(seats).size).toBe(people.length);
  for (const sid of seats) {
    const s = plan.seats[sid];
    expect(s.x).toBeGreaterThan(40);
    expect(s.x).toBeLessThan(plan.W - 400);
    expect(plan.rows).toContain(s.y);
  }
  expect(plan.rows.length).toBeLessThanOrEqual(2);
  /* rugs in a row never overlap */
  for (const a of plan.pods)
    for (const b of plan.pods) if (a !== b && a.row === b.row) expect(overlap(a.rug, b.rug)).toBe(false);
  /* the wall: folder < whiteboard < health < reports tray, tray ≥ 56 px after health, all before the glass */
  const o = plan.objects;
  expect(o.whiteboard.x).toBeGreaterThan(o.dossier.x + o.dossier.w);
  expect(o.health.x).toBeGreaterThan(o.whiteboard.x + o.whiteboard.w);
  expect(o.reports.x - (o.health.x + o.health.w)).toBeGreaterThanOrEqual(56);
  expect(o.reports.x + o.reports.w).toBeLessThan(plan.W - 400);
  expect(o.whiteboard.x).toBeGreaterThan(o.console.x + o.console.w);
  for (const w of plan.windows) expect(w.x).toBeGreaterThan(o.reports.x + o.reports.w);
  expect(o.reports.stand).toBeTruthy();
  /* OFFICE: the portrait hangs left of the folder with air on both sides, above the push box and the console */
  expect(o.portrait.x + o.portrait.w).toBeLessThanOrEqual(o.dossier.x - 20);
  expect(o.portrait.x).toBeGreaterThanOrEqual(o.door.x + o.door.w + 20);
  expect(o.portrait.y + o.portrait.h).toBeLessThan(o.outbox.y);
  expect(o.portrait.y + o.portrait.h).toBeLessThan(o.console.y);
}

describe('officeLayout — the room from staffing', () => {
  it.each(Object.entries(SIZES))('%s agents: everyone seated, wall in order, tray fits', (_n, cfg) => {
    const plan = officeLayout({
      teams: cfg.teams.map((t) => ({ ...t, members: [...t.members] })),
      solo: [...cfg.solo],
    });
    invariants(plan, everyone(cfg));
  });

  it('2: one pod, one centred row, no lane crossings, room at its minimum width', () => {
    const plan = officeLayout({ teams: [{ id: 'ship', members: ['a', 'b'] }], solo: [] });
    expect(plan.pods).toHaveLength(1);
    expect(plan.rows).toEqual([604]);
    expect(plan.gaps).toEqual([]);
    expect(plan.W).toBe(1760); /* 1600 grown so the planning wall + the tray clear the glass */
    const rug = plan.pods[0].rug;
    expect(Math.abs(rug.x + rug.w / 2 - (50 + plan.W - 440) / 2)).toBeLessThan(1);
  });

  it('6 (two teams): one row of two pods; a team keeps its own seats in order', () => {
    const plan = officeLayout({
      teams: [
        { id: 'ship', members: ['a', 'b', 'c'] },
        { id: 'pol', members: ['d', 'e', 'f'] },
      ],
      solo: [],
    });
    expect(plan.rows).toHaveLength(1);
    expect(plan.home.a).toBe('ship-1');
    expect(plan.home.f).toBe('pol-3');
    expect(plan.seats['ship-2'].x - plan.seats['ship-1'].x).toBe(124);
  });

  it('12: 3+ pods use both rows; lanes cross only through gaps', () => {
    const plan = officeLayout({
      teams: SIZES[12].teams.map((t) => ({ ...t, members: [...t.members] })),
      solo: [...SIZES[12].solo],
    });
    expect(plan.rows).toEqual([530, 794]);
    expect(plan.gaps.length).toBeGreaterThanOrEqual(2);
  });

  it('20: the room widens instead of overflowing', () => {
    const plan = officeLayout({
      teams: SIZES[20].teams.map((t) => ({ ...t, members: [...t.members] })),
      solo: [...SIZES[20].solo],
    });
    expect(plan.W).toBeGreaterThan(1760);
  });

  it('windows only where there is room after the tray (a narrow room drops them first)', () => {
    expect(officeLayout({ teams: [{ id: 't', members: ['a', 'b'] }], solo: [] }).windows).toEqual([]);
    const wide = officeLayout({
      teams: ['a', 'b', 'c', 'd'].map((t) => ({ id: t, members: ids(t, 7) })),
      solo: [],
    });
    expect(wide.windows.length).toBeGreaterThan(0);
  });

  it('a pod holds ≤ 7 desks; a big team splits into two blocks', () => {
    const plan = officeLayout({ teams: [{ id: 'big', members: ids('b', 9) }], solo: [] });
    expect(plan.pods.map((p) => p.seats.length)).toEqual([7, 2]);
    expect(plan.pods.every((p) => p.teamId === 'big')).toBe(true);
  });

  it('solo specialists get neutral blocks; spare desks have no owner', () => {
    const plan = officeLayout({ teams: [], solo: ['x', 'y'], spare: 1 });
    expect(plan.pods[0].teamId).toBeNull();
    expect(plan.spare).toEqual(['solo-3']);
  });
});
