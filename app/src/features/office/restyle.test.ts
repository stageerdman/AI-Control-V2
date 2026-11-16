// @vitest-environment happy-dom
/* A look changed in the Cast shows in the office: the robot is swapped in place (same seat, same
   button), its chair takes the new colour, and nothing happens when nothing they show changed. */
import { afterEach, describe, expect, it } from 'vitest';
import type { Look } from '../../api/types';
import { hueHex } from '../../design/palette';
import { OfficeEngine, type SceneAgent } from './engine';
import { officeLayout } from './layout';
import type { Actor } from './state';
import type { BoardFacts } from './theme';

const look: Look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'mint' };
const boss: SceneAgent = { id: 'd', name: 'Pixel', look: { ...look, hue: 'sun' } };
const ha: SceneAgent = { id: 'a', name: 'Health Analyst', look };
const asleep = (id: string): Actor => ({ id, kind: 'planning', label: 'Big picture', session: 'idle' });

const FACTS: BoardFacts = {
  overall: 0,
  now: [],
  tasks: [],
  fresh: true,
  grades: [],
  unreadReports: 0,
  live: 0,
  newMail: 0,
  portrait: null,
};

let e: OfficeEngine | null = null;
afterEach(() => e?.unmount());

const office = () => {
  const box = document.createElement('div');
  document.body.appendChild(box);
  e = new OfficeEngine(box, {
    plan: officeLayout({ teams: [], solo: ['a'], guests: [] }),
    title: 'Garden',
    director: 'd',
    ids: ['d', 'a'],
    agents: { d: boss, a: ha },
    teams: {},
    teamOf: { d: null, a: null },
    stage: () => null,
    drawer: () => 0,
  });
  e.mount([asleep('d'), asleep('a')], FACTS);
  return { e, box };
};

describe('OfficeEngine.restyle', () => {
  it('swaps the robot in place and tints the chair', () => {
    const { e, box } = office();
    const rec = e.actors.a;
    if (!rec) throw new Error('not seated');
    const before = rec.hero;
    const btn = rec.btn;
    const chairOf = () => box.querySelector(`.o-chair[data-seat="${rec.seat}"]`)?.innerHTML;
    const plate = () => box.querySelector(`.o-desk[data-seat="${rec.seat}"] .d-acc`)?.getAttribute('fill');
    const chairBefore = chairOf();
    expect(chairBefore).toBeTruthy();
    expect(plate()).toBe(hueHex('mint'));
    expect(e.restyle('a', { ...ha, look: { ...look, hat: 'beret', hue: 'rose' } })).toBe(true);
    expect(rec.hero).not.toBe(before);
    expect(before.isConnected).toBe(false);
    expect(rec.hero.isConnected).toBe(true);
    expect(rec.btn).toBe(btn);
    expect(box.contains(rec.hero)).toBe(true);
    expect(chairOf()).not.toBe(chairBefore);
    expect(plate()).toBe(hueHex('rose'));
  });

  it('nothing they show changed, or not in this office: no redraw', () => {
    const { e } = office();
    const before = e.actors.a?.hero;
    expect(e.restyle('a', { ...ha, look: { ...look } })).toBe(false);
    expect(e.actors.a?.hero).toBe(before);
    expect(e.restyle('zz', { ...ha, id: 'zz' })).toBe(false);
  });
});
