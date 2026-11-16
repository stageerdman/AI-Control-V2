import { describe, expect, it } from 'vitest';
import { heldForMain, mainFirst, type Quest } from '../../src/domain/quests.ts';

describe('main quests first', () => {
  it('puts main quests ahead and keeps each kind in its own order', () => {
    const queue: [string, Quest][] = [
      ['s1', 'side'],
      ['m1', 'main'],
      ['s2', 'side'],
      ['m2', 'main'],
    ];
    expect(mainFirst(queue, ([, q]) => q).map(([id]) => id)).toEqual(['m1', 'm2', 's1', 's2']);
  });

  it('holds side quests only for agents with main work that could start now', () => {
    const held = heldForMain([
      { holder: 'baron', quest: 'main', ready: true },
      { holder: 'madame', quest: 'main', ready: false },
      { holder: 'pete', quest: 'side', ready: true },
    ]);
    expect([...held]).toEqual(['baron']);
  });
});
