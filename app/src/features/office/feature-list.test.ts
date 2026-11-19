import { describe, expect, it } from 'vitest';
import type { Feature } from './api';
import {
  dateLine,
  enterAction,
  exactMatch,
  featureDate,
  filterFeatures,
  newStage,
  shortDate,
  stageCounts,
  visibleChips,
} from './feature-list';

const f = (o: Partial<Feature>): Feature => ({
  id: 'f',
  projectId: 'p',
  name: 'F',
  status: 'planned',
  order: 1,
  pct: null,
  owner: null,
  description: '',
  createdAt: '2026-11-03T10:00:00',
  updatedAt: '2026-11-10T10:00:00',
  closedAt: null,
  ...o,
});
const LIST = [
  f({ id: 'a', name: 'UX: Feature List', status: 'now', description: 'Stage chips and search' }),
  f({ id: 'b', name: 'Time estimates', status: 'shipped', closedAt: '2026-11-19T09:00:00' }),
  f({ id: 'c', name: 'Notifications', status: 'planned', description: 'ping the user in time' }),
  f({ id: 'd', name: 'Agent Thinking Power', status: 'shelved', closedAt: '2026-11-19T09:00:00' }),
];
const ids = (l: Feature[]) => l.map((x) => x.id);
const TODAY = new Date('2026-11-19T12:00:00');

describe('search', () => {
  it('matches name and description, any case, words in any order, extra spaces ignored', () => {
    expect(ids(filterFeatures(LIST, '  list   ux ', 'all'))).toEqual(['a']);
    expect(ids(filterFeatures(LIST, 'CHIPS', 'all'))).toEqual(['a']);
    expect(ids(filterFeatures(LIST, 'time', 'all'))).toEqual(['b', 'c']);
    expect(ids(filterFeatures(LIST, '', 'all'))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('combines with the stage and keeps the server order', () => {
    expect(ids(filterFeatures(LIST, 'time', 'shipped'))).toEqual(['b']);
    expect(ids(filterFeatures(LIST, '', 'shelved'))).toEqual(['d']);
    expect(filterFeatures(LIST, 'zzz', 'all')).toEqual([]);
  });
});

describe('chips', () => {
  it('counts follow the search', () => {
    expect(stageCounts(LIST, 'time')).toEqual({
      all: 2,
      now: 0,
      planned: 1,
      shipped: 1,
      shelved: 0,
      denied: 0,
    });
    expect(stageCounts(LIST, '').all).toBe(4);
  });
  it('hides stages nobody uses (Denied here), keeps the selected one, none for an empty office', () => {
    expect(visibleChips(LIST, 'all')).toEqual(['all', 'now', 'planned', 'shipped', 'shelved']);
    expect(visibleChips(LIST, 'denied')).toEqual(['all', 'now', 'planned', 'shipped', 'shelved', 'denied']);
    expect(visibleChips([], 'all')).toEqual([]);
  });
  it('a new feature lands in the selected Now / Planned chip, else Planned', () => {
    expect(newStage('now')).toBe('now');
    expect(newStage('planned')).toBe('planned');
    expect(newStage('all')).toBe('planned');
    expect(newStage('shipped')).toBe('planned');
  });
});

describe('Enter', () => {
  it('opens the exact-name match, even if it is not first', () => {
    const l = [f({ id: 'x', name: 'Time estimates v2' }), f({ id: 'y', name: 'time  Estimates' })];
    expect(enterAction(l, 'Time estimates', 'all')).toMatchObject({ kind: 'open', feature: { id: 'y' } });
  });
  it('opens the first match, adds only when nothing matches, does nothing when empty', () => {
    expect(enterAction(LIST, 'time', 'all')).toMatchObject({ kind: 'open', feature: { id: 'b' } });
    expect(enterAction(LIST, '  Dark   mode ', 'all')).toEqual({ kind: 'add', name: 'Dark mode' });
    expect(enterAction(LIST, '   ', 'all')).toEqual({ kind: 'none' });
  });
  it('the Add row shows whenever no feature has exactly that name', () => {
    expect(exactMatch(LIST, 'time')).toBeUndefined();
    expect(exactMatch(LIST, ' notifications ')?.id).toBe('c');
    expect(exactMatch(LIST, '')).toBeUndefined();
  });
});

describe('dates', () => {
  it('this year → "19 Nov", another year → "19 Nov 2025"', () => {
    expect(shortDate('2026-11-19T09:00:00', TODAY)).toBe('19 Nov');
    expect(shortDate('2025-11-19T09:00:00', TODAY)).toBe('19 Nov 2025');
  });
  it('open rows show when added, closed rows when finished, with spoken words', () => {
    expect(featureDate(LIST[0], TODAY)).toEqual({ text: '3 Nov', spoken: 'Added 3 November 2026' });
    expect(featureDate(LIST[1], TODAY)).toEqual({ text: '19 Nov', spoken: 'Shipped 19 November 2026' });
    expect(featureDate(LIST[3], TODAY).spoken).toBe('Shelved 19 November 2026');
    expect(featureDate(f({ status: 'denied', closedAt: '2026-01-02T09:00:00' }), TODAY).spoken).toBe(
      'Denied 2 January 2026',
    );
  });
  it('a closed feature without closedAt falls back to updatedAt', () => {
    expect(featureDate(f({ status: 'shipped' }), TODAY).text).toBe('10 Nov');
  });
  it('the feature page line, for every stage', () => {
    expect(dateLine(f({ status: 'now' }), TODAY)).toBe('Added 3 Nov');
    expect(dateLine(f({ status: 'planned' }), TODAY)).toBe('Added 3 Nov');
    const closed = { closedAt: '2026-11-19T09:00:00' };
    expect(dateLine(f({ status: 'shipped', ...closed }), TODAY)).toBe('Added 3 Nov · Shipped 19 Nov');
    expect(dateLine(f({ status: 'shelved', ...closed }), TODAY)).toBe('Added 3 Nov · Shelved 19 Nov');
    expect(dateLine(f({ status: 'denied', ...closed }), TODAY)).toBe('Added 3 Nov · Denied 19 Nov');
  });
});
