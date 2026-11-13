import { describe, expect, it } from 'vitest';
import type { Route } from '../../shell/router';
import type { StudioAsk } from './api';
import { askKey, freshIndex, leftOffice, pagerEntries, pagerHidden, pagerLine } from './pager-logic';

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
