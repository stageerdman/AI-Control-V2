/* Invite another — the pure kin rules (kin.ts). */
import { describe, expect, it } from 'vitest';
import type { Agent, Look } from '../../api/types';
import { canInvite, kinOf, namesLine, nameTaken, nextFreeHue, sharesLine, twinOf } from './kin';

const look: Look = { hat: 'beret', tool: 'palette', body: 'hero', antenna: 'bob', face: 'none', hue: 'sun' };
const ag = (id: string, p: Partial<Agent> = {}) =>
  ({ id, name: id, nick: null, kind: 'agent', look, createdAt: '2026-11-01T00:00:00Z', ...p }) as Agent;

describe('canInvite', () => {
  it('regular agents only — crew have one job each', () => {
    expect(canInvite({ kind: 'agent' })).toBe(true);
    expect(canInvite({ kind: 'orchestrator' })).toBe(false);
    expect(canInvite({ kind: 'creator' })).toBe(false);
  });
});

describe('kinOf', () => {
  const blair = ag('blair', { kinId: 'k', kin: ['bea', 'pip'] });
  const bea = ag('bea', { kinId: 'k', createdAt: '2026-11-02T00:00:00Z' });
  const pip = ag('pip', { kinId: 'k', createdAt: '2026-11-03T00:00:00Z' });
  const moss = ag('moss');
  it('follows the server’s kin order and drops the ones no longer in the Cast', () => {
    expect(kinOf(blair, [moss, pip, bea, blair]).map((a) => a.id)).toEqual(['bea', 'pip']);
    expect(kinOf(blair, [blair, pip]).map((a) => a.id)).toEqual(['pip']);
  });
  it('without a kin list: same kinId, first-made first, never itself', () => {
    expect(kinOf({ ...pip, kin: undefined }, [pip, blair, bea, moss]).map((a) => a.id)).toEqual([
      'blair',
      'bea',
    ]);
  });
  it('no kin: empty', () => {
    expect(kinOf(moss, [moss, blair])).toEqual([]);
  });
});

describe('the shares line', () => {
  it('reads "Blair" · "Blair and Pip" · "Blair and 2 others"', () => {
    expect(namesLine([])).toBe('');
    expect(namesLine(['Blair'])).toBe('Blair');
    expect(namesLine(['Blair', 'Pip'])).toBe('Blair and Pip');
    expect(namesLine(['Blair', 'Pip', 'Bea'])).toBe('Blair and 2 others');
  });
  it('names the original first, then the kin', () => {
    const b = { id: 'b', name: 'Blair' };
    expect(sharesLine(b, [])).toBe('Same role and instructions as Blair.');
    expect(sharesLine(b, [{ id: 'p', name: 'Pip' }])).toBe('Same role and instructions as Blair and Pip.');
    expect(sharesLine(b, [b, { id: 'p', name: 'Pip' }, { id: 'x', name: 'Bea' }])).toBe(
      'Same role and instructions as Blair and 2 others.',
    );
  });
});

describe('telling copies apart', () => {
  it('twinOf: a kin wearing exactly this look (all slots)', () => {
    const fam = [ag('blair'), ag('bea', { look: { ...look, hue: 'teal' } })];
    expect(twinOf(look, fam)?.id).toBe('blair');
    expect(twinOf({ ...look, antenna: 'tuft' }, fam)).toBeUndefined();
  });
  it('nextFreeHue: the next hue no kin wears, the kit untouched', () => {
    const fam = [ag('blair'), ag('bea', { look: { ...look, hue: 'coral' } })];
    expect(nextFreeHue(look, fam)).toEqual({ ...look, hue: 'teal' });
  });
  it('nextFreeHue: all worn → just the next hue', () => {
    const hues = ['sun', 'coral', 'teal', 'sky', 'grape', 'mint', 'rose'];
    const fam = hues.map((h) => ag(h, { look: { ...look, hue: h } }));
    expect(nextFreeHue({ ...look, hue: 'rose' }, fam).hue).toBe('sun');
  });
});

describe('nameTaken', () => {
  const cast = [ag('a', { name: 'Blair' }), ag('b', { name: 'Bartholomew', nick: 'Bart' })];
  it('name or nick, any case, trimmed', () => {
    expect(nameTaken('blair', cast)).toBe(true);
    expect(nameTaken(' BART ', cast)).toBe(true);
    expect(nameTaken('Bea', cast)).toBe(false);
    expect(nameTaken('  ', cast)).toBe(false);
  });
});
