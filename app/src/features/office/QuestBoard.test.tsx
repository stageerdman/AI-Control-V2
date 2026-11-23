// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChecklistItem, clearQueryCache, type Goal, studio } from '../../api';
import type { Feature } from './api';
import { QuestBoard } from './QuestBoard';

const NOW = new Date('2026-11-16T15:30:00');
const OLD = '2026-11-16T09:00:00';
const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'teal' } as never;
const pete = { id: 'a', name: 'Pete', look };
const ava = { id: 'b', name: 'Ava', look };
const nameOf = (id: string) => ({ a: 'Pete', b: 'Ava' })[id] ?? id;
const item = (o: Partial<ChecklistItem>): ChecklistItem =>
  ({
    id: 'i',
    goalId: 'g',
    agentId: 'a',
    text: 'Step',
    status: 'todo',
    stage: 'build',
    note: null,
    subtasks: [],
    ...o,
  }) as never;
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
const feature = (o: Partial<Feature>): Feature =>
  ({ id: 'f', name: 'Main Quests & Side Quests', status: 'now', order: 0, pct: 60, ...o }) as Feature;

const board = (goals: Goal[], features: Feature[] = [], go = vi.fn()) => ({
  go,
  c: render(
    <QuestBoard pid="p" dir="Pixel" goals={goals} features={features} go={go} nameOf={nameOf} now={NOW} />,
  ).container,
});

const notes = vi.spyOn(studio.projects, 'notes');
beforeEach(() => {
  clearQueryCache();
  notes.mockResolvedValue([]);
});
afterEach(cleanup);

const main = goal({
  id: 'm',
  featureId: 'f',
  ships: true,
  items: [
    item({ id: 's1', goalId: 'm', text: 'Design the look', status: 'done', finishedBy: ava }),
    item({ id: 's2', goalId: 'm', text: 'Server', status: 'done', finishedBy: pete }),
    item({ id: 's3', goalId: 'm', text: 'Build the board', status: 'running', workingNow: [pete] }),
    item({ id: 's4', goalId: 'm', text: 'Check it live' }),
  ],
});

describe('Main Quests', () => {
  it('the open quest: ribbon with the feature name, %, steps, owners on the trail', () => {
    const { c, go } = board([main], [feature({}), feature({ id: 'f2', name: 'Agent performance', pct: 40 })]);
    const sec = screen.getByRole('region', { name: 'Main Quests' });
    const ribbon = within(sec).getByRole('button', {
      name: 'Main quest: Main Quests & Side Quests, 60%, 2 of 4 steps',
    });
    expect(within(sec).getByRole('heading', { level: 4 })).toBeTruthy();
    expect(c.querySelector('.qb-prog')?.textContent).toContain('2 of 4 steps');
    expect(c.querySelectorAll('.qb-trail > .ob-task')).toHaveLength(4);
    /* the trail is lit up to the last done step */
    expect(
      [...c.querySelectorAll('.qb-trail > .ob-task')].map((li) => li.classList.contains('qb-lit')),
    ).toEqual([true, false, false, false]);
    expect(c.querySelector('.qb-trail .m-active .ob-pn')?.textContent).toBe('Pete');
    expect(c.querySelector('.qb-trail .m-done .ob-pn')?.textContent).toBe('Ava');
    expect(screen.getByRole('button', { name: 'Ships when done ›' })).toBeTruthy();
    fireEvent.click(ribbon);
    expect(go).toHaveBeenCalledWith('feature', 'f');
    /* the other feature in progress: a folded strip */
    fireEvent.click(screen.getByRole('button', { name: /Agent performance/ }));
    expect(go).toHaveBeenCalledWith('feature', 'f2');
    expect(c.querySelector('.qb-others')?.textContent).toContain('40%');
  });
  it('a stuck step carries Continue / Drop on its own row', () => {
    const g = goal({
      id: 'm',
      status: 'failed',
      items: [item({ id: 'x', goalId: 'm', status: 'failed', problem: { message: 'Ran out of steps.' } })],
    });
    const { c } = board([g]);
    const row = c.querySelector('.qb-trail .m-failed');
    expect(row?.querySelector('.ob-acts')?.textContent).toBe('ContinueDropStart fresh');
    expect(row?.textContent).toContain('Ran out of steps.');
    expect(c.querySelector('.ob-stopped')).toBeNull();
  });
  it('a running step shows the notes waiting for its agent; nothing is read when nothing runs', async () => {
    notes.mockResolvedValue([
      { runId: 'r', agentId: 'a', from: 'Uncle Bob', text: 'Use the new route.', at: '1' },
    ]);
    const { c } = board([main]);
    expect(await screen.findByText('1 note waiting for Pete')).toBeTruthy();
    expect(c.querySelector('.qb-trail .m-active .ob-notes')).toBeTruthy();
    expect(notes).toHaveBeenCalledWith('p');
    cleanup();
    clearQueryCache();
    notes.mockClear();
    board([goal({ items: [item({ status: 'done' })] })]);
    expect(notes).not.toHaveBeenCalled();
  });
  it('empty: no main quest yet', () => {
    board([]);
    expect(screen.getByText('No main quest yet. Tell Pixel what to build.')).toBeTruthy();
  });
  it('a main quest with no steps yet', () => {
    board([goal({ featureId: 'f' })], [feature({})]);
    expect(screen.getByText('No steps yet. Pixel writes them here as the plan takes shape.')).toBeTruthy();
  });
});

describe('Side Quests', () => {
  const sides = [
    goal({
      id: 'r',
      quest: 'side',
      text: 'Why do builds stop?',
      items: [item({ goalId: 'r', status: 'running', workingNow: [pete] })],
    }),
    goal({ id: 't', quest: 'side', text: 'Tidy the issues list', items: [item({ goalId: 't' })] }),
    goal({
      id: 'k',
      quest: 'side',
      status: 'failed',
      text: 'Free a port',
      items: [
        item({
          goalId: 'k',
          status: 'failed',
          problem: { message: 'Couldn’t start.', details: 'EADDRINUSE' },
        }),
      ],
    }),
    goal({
      id: 'd',
      quest: 'side',
      status: 'done',
      text: 'Fix the pager dot',
      items: [item({ goalId: 'd', status: 'done', finishedBy: ava })],
    }),
  ];
  it('pinned cards: who has it, Waiting, the plain stop reason, who finished it; count on the heading', () => {
    const { c } = board([main, ...sides], [feature({})]);
    const sec = screen.getByRole('region', { name: 'Side Quests' });
    expect(within(sec).getByText('2 open · 1 stuck')).toBeTruthy();
    const cards = [...c.querySelectorAll('.qb-side')];
    expect(cards.map((x) => x.querySelector('.qb-title')?.textContent)).toEqual([
      'Side quest. Stopped: Couldn’t start. Free a port',
      'Side quest. In progress, Pete working: Why do builds stop?',
      'Side quest. To do: Tidy the issues list',
      'Side quest. Done, finished by Ava: Fix the pager dot',
    ]);
    expect(cards[0].classList.contains('m-failed')).toBe(true);
    expect(cards[1].querySelector('.ob-pn')?.textContent).toBe('Pete');
    expect(cards[2].textContent).toContain('Waiting');
    expect(cards[3].querySelector('.ob-pn')?.textContent).toBe('Ava');
    expect(cards.every((x) => x.querySelector('.qb-pin') && x.getAttribute('tabindex') === '0')).toBe(true);
    /* the raw note waits behind Details */
    expect(c.textContent).not.toContain('EADDRINUSE');
    fireEvent.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'Details' }));
    expect(cards[0].querySelector('.ob-raw')?.textContent).toBe('EADDRINUSE');
    /* stuck side quests get the section's own Continue / Drop bar */
    expect(within(sec).getByText('Side quest stopped partway.')).toBeTruthy();
    /* side quests never land on the main trail */
    expect(screen.getByRole('region', { name: 'Main Quests' }).textContent).not.toContain('Free a port');
  });
  it('older finished ones fold into one strip; Show unfolds them', () => {
    const old = [
      goal({
        id: 'o1',
        quest: 'side',
        status: 'done',
        text: 'Old fix',
        updatedAt: OLD,
        items: [item({ goalId: 'o1', status: 'done', finishedBy: pete })],
      }),
      goal({
        id: 'o2',
        quest: 'side',
        status: 'done',
        text: 'Old look',
        updatedAt: OLD,
        items: [item({ goalId: 'o2', status: 'done', finishedBy: ava })],
      }),
    ];
    const { c } = board(old);
    expect(c.querySelectorAll('.qb-side')).toHaveLength(0);
    expect(c.querySelector('.qb-done')?.textContent).toContain('2 more side quests done');
    expect(c.querySelector('.qb-dn')?.textContent).toBe('by Pete, Ava');
    expect(screen.getByText('All done')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show ▾' }));
    expect(c.querySelectorAll('.qb-side')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Hide ▴' }).getAttribute('aria-expanded')).toBe('true');
  });
  it('empty: all quiet', () => {
    board([main], [feature({})]);
    expect(screen.getByText('No side quests. All quiet.')).toBeTruthy();
  });
  it('an old server without quest tags: no side section, the steps still show', () => {
    const { c } = board([{ ...main, quest: undefined }], [feature({})]);
    expect(screen.queryByRole('region', { name: 'Side Quests' })).toBeNull();
    expect(c.querySelectorAll('.qb-trail > .ob-task')).toHaveLength(4);
  });
});
