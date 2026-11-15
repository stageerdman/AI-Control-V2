/* The nine archetype kits (Visionary … Alchemist): every new hat and tool is in the
   look picker with a label, and draws on every body type, at every size, without errors. */
import { describe, expect, it } from 'vitest';
import { BUILDS, HATS, heroSVG, lookSlot, ROLE_GEAR, TOOLS } from './hero-svg';

const KITS = [
  'Visionary',
  'Moonshot',
  'Navigator',
  'Warden',
  'Rogue',
  'Fable',
  'Showman',
  'Archivist',
  'Alchemist',
];
const NEW_HATS = ['visor', 'starcrest', 'hood', 'flightcap', 'crown', 'boater', 'starhat'];
const NEW_TOOLS = [
  'eraser',
  'rocket',
  'starcompass',
  'crystalstaff',
  'grapple',
  'wand',
  'balloon',
  'scroll',
  'flask',
];
const SIZES = ['xs', 'sm', 'md', 'xl'] as const;
const base = { antenna: 'none', face: 'none', hue: 'sun' };
const clean = (svg: string) => {
  expect(svg).toContain('<svg');
  expect(svg).not.toMatch(/undefined|NaN/);
};

describe('archetype kits', () => {
  it('every kit is a role gear with a tool', () => {
    for (const k of KITS) {
      expect(ROLE_GEAR[k], k).toBeDefined();
      expect(ROLE_GEAR[k].tool, k).toBeTypeOf('function');
    }
  });

  it('the picker offers every new hat and tool, with a readable label', () => {
    const hat = lookSlot('hat');
    const tool = lookSlot('tool');
    for (const h of NEW_HATS) {
      expect(hat.options).toContain(h);
      expect(hat.name(h)).not.toBe(h);
      expect(ROLE_GEAR[HATS[h][1] as string]?.headgear, h).toBeTypeOf('function');
    }
    for (const t of NEW_TOOLS) {
      expect(tool.options).toContain(t);
      expect(tool.name(t)).not.toBe(t);
      expect(ROLE_GEAR[TOOLS[t][1] as string]?.tool, t).toBeTypeOf('function');
    }
  });

  it('every new hat draws on every body type and size', () => {
    for (const body of BUILDS) {
      for (const hat of NEW_HATS) {
        for (const size of SIZES) {
          clean(
            heroSVG({ name: 'T', look: { ...base, body, hat, tool: 'none', decal: HATS[hat][1] } }, { size }),
          );
        }
      }
    }
  });

  it('every new tool draws on every body type and size', () => {
    for (const body of BUILDS) {
      for (const tool of NEW_TOOLS) {
        for (const size of SIZES) {
          clean(heroSVG({ name: 'T', look: { ...base, body, hat: 'none', tool } }, { size }));
        }
      }
    }
  });

  it('every kit drawn by role id renders its full costume', () => {
    for (const role of KITS) {
      for (const build of BUILDS) clean(heroSVG({ name: 'T', role, build }, { size: 'md' }));
    }
  });
});
