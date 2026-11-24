/* The setup crew's Cast catalogue says who each agent is (about) and each member's job on their team. */
import { afterEach, expect, it } from 'vitest';
import { castCatalogue } from '../../src/crew/prompts.ts';
import { testApp } from '../helpers.ts';

let h: ReturnType<typeof testApp>;
afterEach(() => h.close());

it('every agent carries its about line, every team member its job', () => {
  h = testApp({ seed: true });
  const cat = castCatalogue(h.store);
  expect(cat.agents.find((a) => a.id === 'a-pete')?.about).toBe('You are a frontend engineer.');
  for (const a of cat.agents) expect(a.about).toEqual(expect.any(String));
  const squad = cat.teams.find((t) => t.id === 'ship-it');
  expect(squad?.members.find((m) => m.id === 'a-pete')?.job).toMatch(/^Own the storefront UI/);
});
