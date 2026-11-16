import { describe, expect, it } from 'vitest';
import { changedFields, sameLook } from '../../src/domain/agent-changes.ts';

const look = { hat: 'beret', tool: 'palette', body: 'lanky', antenna: 'curl', face: 'none', hue: 'coral' };
const agent = { name: 'Blair', nick: null, roleId: 'r-design', look, prompt: 'Design.', canMail: true };

describe('sameLook', () => {
  it('ignores key order', () => {
    const { hue, ...rest } = look;
    expect(sameLook(look, { hue, ...rest })).toBe(true);
  });
  it('sees a changed slot and a decal added or dropped', () => {
    expect(sameLook(look, { ...look, hat: 'captain' })).toBe(false);
    expect(sameLook(look, { ...look, decal: 'star' })).toBe(false);
  });
});

describe('changedFields', () => {
  it('a look-only edit reports only the look', () => {
    expect(changedFields(agent, { ...agent, look: { ...look, hue: 'teal' } })).toEqual(['look']);
  });
  it('nothing changed → nothing to tell', () => {
    expect(changedFields(agent, { ...agent, look: { ...look } })).toEqual([]);
  });
  it('lists every changed field in a fixed order', () => {
    const after = { ...agent, prompt: 'New.', name: 'Blair D', roleId: null, canMail: false, nick: 'B' };
    expect(changedFields(agent, after)).toEqual(['name', 'nick', 'role', 'prompt', 'canMail']);
  });
});
