import { describe, expect, it } from 'vitest';
import type { ChecklistItem, Goal } from '../../api';
import type { Route } from '../../shell/router';
import type { StudioAsk } from './api';
import {
  askKey,
  freshIndex,
  leftOffice,
  pagerEntries,
  pagerHidden,
  pagerLine,
  stoppedAsks,
} from './pager-logic';

const ask = (
  id: string,
  projectId: string,
  agentName = 'Scarlett Byte',
  o: Partial<StudioAsk> = {},
): StudioAsk => ({
  id,
  projectId,
  projectName: projectId.toUpperCase(),
  agentId: `ag-${id}`,
  agentName,
  runId: 'r',
  question: 'Which one?',
  options: null,
  status: 'open',
  since: '',
  seen: false,
  ...o,
});
const office = (projectId: string, sub: 'room' | 'board' = 'room'): Route => ({
  name: 'office',
  projectId,
  sub,
});

describe('pager — offices that need you', () => {
  it('one page per office, in order of the oldest ask; never the office you stand in', () => {
    const asks = [ask('1', 'lumi'), ask('2', 'aurora'), ask('3', 'lumi', 'Pete')];
    expect(pagerEntries(asks, null).map((e) => [e.projectId, e.asks.length])).toEqual([
      ['lumi', 2],
      ['aurora', 1],
    ]);
    expect(pagerEntries(asks, 'lumi').map((e) => e.projectId)).toEqual(['aurora']);
  });

  it('seen (visited and left without answering) and closed asks stay quiet', () => {
    const asks = [ask('1', 'lumi', 'x', { seen: true }), ask('2', 'lumi', 'x', { status: 'answered' })];
    expect(pagerEntries(asks, null)).toEqual([]);
  });

  it('one calm line: "<Name> needs you" or "N need you"', () => {
    expect(pagerLine({ projectId: 'p', projectName: 'P', asks: [ask('1', 'p', 'Sir Lint-a-Lot')] })).toBe(
      'Lint-a-Lot needs you',
    );
    expect(pagerLine({ projectId: 'p', projectName: 'P', asks: [ask('1', 'p'), ask('2', 'p')] })).toBe(
      '2 need you',
    );
    // the director's pages are news; a real question still wins the line
    const news = ask('3', 'p', 'Pixel', { news: true });
    expect(pagerLine({ projectId: 'p', projectName: 'P', asks: [news] })).toBe('Pixel has news');
    expect(
      pagerLine({ projectId: 'p', projectName: 'P', asks: [news, ask('4', 'p', 'Sir Lint-a-Lot')] }),
    ).toBe('Lint-a-Lot needs you');
  });

  it('a NEW ask turns the pager to its office; already-shown asks do not', () => {
    const entries = pagerEntries([ask('1', 'a'), ask('2', 'b')], null);
    expect(freshIndex(entries, new Set([askKey(ask('1', 'a'))]))).toBe(1);
    expect(freshIndex(entries, new Set(['a:1', 'b:2']))).toBe(-1);
  });

  it('leaving an office (to the studio or another office) names it; moving inside it does not', () => {
    expect(leftOffice(office('lumi'), { name: 'projects' })).toBe('lumi');
    expect(leftOffice(office('lumi'), office('aurora'))).toBe('lumi');
    expect(leftOffice(office('lumi'), office('lumi', 'board'))).toBeNull();
    expect(leftOffice({ name: 'cast', tab: 'agents' }, office('lumi'))).toBeNull();
    expect(leftOffice(null, office('lumi'))).toBeNull();
  });

  it('steps aside in the setup space and while zoomed into a board', () => {
    expect(pagerHidden({ name: 'new', draftId: null })).toBe(true);
    expect(pagerHidden(office('a', 'board'))).toBe(true);
    expect(pagerHidden(office('a'))).toBe(false);
    expect(pagerHidden({ name: 'projects' })).toBe(false);
  });
});

describe('work that stopped for you (sent back past the limit)', () => {
  const item = (o: Partial<ChecklistItem>): ChecklistItem =>
    ({
      id: 'i1',
      text: 'Tags filter',
      agentId: 'a-pete',
      status: 'failed',
      sendBacks: 2,
      runId: 'r1',
      reviews: [{ reviewer: 'a-scar', gate: 0, verdict: 'changes', notes: 'n', runId: null, at: '' }],
      updatedAt: '2026-11-14T07:00:00Z',
      ...o,
    }) as ChecklistItem;
  const goal = (items: ChecklistItem[]) => ({ items }) as Goal;
  const now = Date.parse('2026-11-14T08:00:00Z');
  const names = (id: string) => ({ 'a-scar': 'Scarlett Scenario' })[id] ?? id;
  it('pages a recent failed item whose last review asked for changes — as the reviewer', () => {
    const out = stoppedAsks(
      [{ projectId: 'p', projectName: 'Tiny', goals: [goal([item({})])] }],
      new Set(),
      names,
      now,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'stopped:i1', agentName: 'Scarlett Scenario', projectId: 'p' });
    expect(out[0].question).toBe('sent “Tags filter” back 2× — your call');
    expect(pagerLine(pagerEntries(out, null)[0])).toBe('Scarlett needs you');
  });
  it('skips seen, old, plain failures, approved ones; finds team sub-tasks too', () => {
    const w = (i: ChecklistItem) => [{ projectId: 'p', projectName: 'Tiny', goals: [goal([i])] }];
    expect(stoppedAsks(w(item({})), new Set(['stopped:i1']), names, now)).toHaveLength(0);
    expect(stoppedAsks(w(item({ updatedAt: '2026-11-01T00:00:00Z' })), new Set(), names, now)).toHaveLength(
      0,
    );
    expect(stoppedAsks(w(item({ sendBacks: 0, reviews: [] })), new Set(), names, now)).toHaveLength(0);
    expect(stoppedAsks(w(item({ status: 'done' })), new Set(), names, now)).toHaveLength(0);
    const parent = item({
      id: 'p1',
      status: 'running',
      sendBacks: 0,
      reviews: [],
      subtasks: [item({ id: 's1' })],
    });
    expect(stoppedAsks(w(parent), new Set(), names, now).map((a) => a.id)).toEqual(['stopped:s1']);
  });
});
