import { describe, expect, it } from 'vitest';
import { HUES } from '../../src/domain/catalog.ts';
import { familyLook, KIN_NAMES, suggestKinName } from '../../src/domain/kin.ts';
import type { Look } from '../../src/domain/look.ts';

const blair: Look = {
  hat: 'beret',
  tool: 'palette',
  decal: 'Design',
  body: 'lanky',
  antenna: 'curl',
  face: 'none',
  hue: 'grape',
};
const wearing = (hue: string): Look => ({ ...blair, hue });
/** A seeded stand-in for Math.random, so every roll is repeatable. */
const seeded = (s: number) => {
  let seed = (s * 104729) % 2147483647; // spread small seeds so the first draw isn't always near 0
  return () => {
  seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

describe('familyLook', () => {
  it('keeps the kit (hat, tool, decal) and changes colour and antenna', () => {
    for (let s = 1; s < 200; s++) {
      const look = familyLook(blair, [], seeded(s));
      expect(look).toMatchObject({ hat: 'beret', tool: 'palette', decal: 'Design' });
      expect(look.hue).not.toBe('grape');
      expect(look.antenna).not.toBe('curl');
    }
  });

  it('picks a colour no kin wears yet', () => {
    const kin = ['sun', 'coral', 'teal', 'sky', 'mint'].map(wearing);
    for (let s = 1; s < 50; s++) expect(familyLook(blair, kin, seeded(s)).hue).toBe('rose');
  });

  it('with all seven colours taken, any colour but the original’s', () => {
    const kin = HUES.map(wearing);
    const hues = new Set(Array.from({ length: 200 }, (_, s) => familyLook(blair, kin, seeded(s + 1)).hue));
    expect(hues.has('grape')).toBe(false);
    expect(hues.size).toBe(HUES.length - 1);
  });

  it('adds no decal when the original has none', () => {
    const { decal: _d, ...plain } = blair;
    expect(familyLook(plain, [], seeded(7))).not.toHaveProperty('decal');
  });
});

describe('suggestKinName', () => {
  it('starts with the original’s letter and is free', () => {
    const name = suggestKinName('Blair', ['Bea'], seeded(3));
    expect(['Bix', 'Bo']).toContain(name);
  });

  it('is case-blind about taken names', () => {
    expect(suggestKinName('Blair', ['bea', 'BIX'], seeded(3))).toBe('Bo');
  });

  it('falls back to any free pool name when the letter runs out', () => {
    const name = suggestKinName('Blair', ['Bea', 'Bix', 'Bo'], seeded(3));
    expect(KIN_NAMES).toContain(name);
    expect(name.startsWith('B')).toBe(false);
  });

  it('numbers the original’s name when the whole pool is taken', () => {
    expect(suggestKinName('Blair', [...KIN_NAMES], seeded(3))).toBe('Blair 2');
    expect(suggestKinName('Blair', [...KIN_NAMES, 'Blair 2'], seeded(3))).toBe('Blair 3');
  });
});
