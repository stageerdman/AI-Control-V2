import { describe, expect, it } from 'vitest';
import type { Collaboration } from '../../api';
import { briefName, changedKeys, designView, type Resolve } from './model';

const resolve: Resolve = {
  agent: (id) =>
    ({ 'a-scar': { name: 'Scarlett' }, 'a-pete': { name: 'Pete' } })[id] ??
    (id === 'new-agent:0' ? { name: 'QA specialist', ghost: true } : null),
  team: (id) => (id === 'ship-it' ? { id, name: 'Ship-It Squad', emblem: 'rocket', color: 'sun' } : null),
};
const c = (over: Partial<Collaboration> = {}): Collaboration => ({
  orchestratorTalksTo: 'captains',
  gates: [],
  maxSendBacks: 2,
  summary: 's',
  ...over,
});

describe('designView', () => {
  it('no design = the default: captains only, no reviews', () => {
    const v = designView(null, 'Pixel', resolve);
    expect(v.talk).toBe('Pixel talks to captains only');
    expect(v.chips).toEqual([]);
    expect(v.hint).toBe('No reviews — work merges once it’s built.');
  });
  it('gates become chips: every change / a team → reviewer · kind; why kept for hover', () => {
    const v = designView(
      c({
        orchestratorTalksTo: 'everyone',
        gates: [
          { after: '*', reviewer: 'a-scar', kind: 'quality', why: 'keep it tidy' },
          { after: 'ship-it', reviewer: 'new-agent:0', kind: 'user-test', why: 'click it' },
        ],
      }),
      'Pixel',
      resolve,
    );
    expect(v.talk).toBe('Pixel talks to everyone');
    expect(v.chips.map((x) => [x.after.label, x.reviewer.name, x.kind, x.why])).toEqual([
      ['Every change', 'Scarlett', 'quality', 'keep it tidy'],
      ['Ship-It Squad', 'QA specialist', 'user test', 'click it'],
    ]);
    expect(v.chips[1].reviewer.ghost).toBe(true);
    expect(v.chips[1].after.team?.emblem).toBe('rocket');
    expect(v.hint).toBe('Sent back up to 2× — then it comes to you.');
  });
  it('more than three gates → +N; no second tries wording', () => {
    const g = (k: string) => ({ after: '*', reviewer: 'a-pete', kind: k as 'review', why: k });
    const v = designView(
      c({ maxSendBacks: 0, gates: ['quality', 'review', 'security', 'crash-test'].map(g) }),
      'Pixel',
      resolve,
    );
    expect(v.chips).toHaveLength(3);
    expect(v.more).toBe(1);
    expect(v.hint).toMatch(/No second tries/);
  });
  it('changedKeys flags only new chips', () => {
    const a = designView(
      c({ gates: [{ after: '*', reviewer: 'a-scar', kind: 'quality', why: 'x' }] }),
      'P',
      resolve,
    );
    const b = designView(
      c({
        gates: [
          { after: '*', reviewer: 'a-scar', kind: 'quality', why: 'x' },
          { after: '*', reviewer: 'a-pete', kind: 'review', why: 'y' },
        ],
      }),
      'P',
      resolve,
    );
    expect(changedKeys(null, b).size).toBe(0);
    expect([...changedKeys(a, b)]).toEqual([b.chips[1].key]);
  });
  it('briefName shortens a brief', () => {
    expect(briefName('A QA specialist for the checkout')).toBe('QA specialist');
    expect(briefName('')).toBe('New');
  });
});
