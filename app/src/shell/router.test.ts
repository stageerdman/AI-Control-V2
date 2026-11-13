import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute, type Route, stageOf } from './router';

const cases: [string, Route][] = [
  ['#projects', { name: 'projects' }],
  ['#cast', { name: 'cast', tab: 'agents' }],
  ['#cast/teams', { name: 'cast', tab: 'teams' }],
  ['#cast/agent/a-pete', { name: 'cast.agent', id: 'a-pete' }],
  ['#cast/teams/t-1', { name: 'cast.team', id: 't-1' }],
  ['#access', { name: 'access' }],
  ['#blueprint', { name: 'blueprint' }],
  ['#new', { name: 'new', draftId: null }],
  ['#new/d-9', { name: 'new', draftId: 'd-9' }],
  ['#office/aurora', { name: 'office', projectId: 'aurora', sub: 'room' }],
  ['#office/aurora/board', { name: 'office', projectId: 'aurora', sub: 'board' }],
  ['#office/aurora/health', { name: 'office', projectId: 'aurora', sub: 'health' }],
  ['#office/aurora/features', { name: 'office', projectId: 'aurora', sub: 'features' }],
  ['#office/aurora/feature/f-2', { name: 'office', projectId: 'aurora', sub: 'feature', id: 'f-2' }],
  ['#office/aurora/reports', { name: 'office', projectId: 'aurora', sub: 'reports' }],
  ['#office/aurora/report/r-7', { name: 'office', projectId: 'aurora', sub: 'report', id: 'r-7' }],
  ['#gallery', { name: 'gallery', section: '' }],
  ['#gallery/poses', { name: 'gallery', section: 'poses' }],
];

describe('router', () => {
  it.each(cases)('%s parses and round-trips', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
    expect(formatRoute(route)).toBe(hash);
  });
  it('sends anything unknown to projects', () => {
    for (const h of ['', '#', '#nope', '#office', '#office/x/weird'.slice(0, 7)])
      expect(parseRoute(h).name).toBe('projects');
    expect(parseRoute('#office/x/weird')).toEqual({ name: 'office', projectId: 'x', sub: 'room' });
  });
  it('encodes ids', () => {
    const r: Route = { name: 'cast.agent', id: 'a b/c' };
    expect(parseRoute(formatRoute(r))).toEqual(r);
  });
  it('lights the right stage', () => {
    expect(stageOf({ name: 'new', draftId: null })).toBe('projects');
    expect(stageOf({ name: 'cast.team', id: 'x' })).toBe('cast');
    expect(stageOf({ name: 'office', projectId: 'p', sub: 'room' })).toBeNull();
  });
});
