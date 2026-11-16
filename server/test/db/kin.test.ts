import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Look } from '../../src/domain/look.ts';
import { testApp } from '../helpers.ts';

const teal: Look = {
  hat: 'goggles',
  tool: 'wrench',
  body: 'hero',
  antenna: 'bob',
  face: 'none',
  hue: 'teal',
};
const rose: Look = { ...teal, hue: 'rose', antenna: 'tuft' };

describe('kin: copies of one Cast agent', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());
  const agents = () => h.store.agents;
  const copy = (name: string, look = teal, of = 'a-pete') =>
    h.store.tx(() => agents().copy(of, { name, look }));

  it('a copy has its own id, name and look, and the same instructions; it joins nothing yet', () => {
    agents().update('a-pete', { canMail: false });
    const pete = agents().require('a-pete');
    const bea = copy('Bea');
    expect(bea).toMatchObject({
      id: 'a-bea',
      name: 'Bea',
      nick: null,
      look: teal,
      kind: 'agent',
      roleId: pete.roleId,
      prompt: pete.prompt,
      tools: pete.tools,
      canMail: false,
      teamIds: [],
      projectIds: [],
    });
  });

  it('kin know each other, first-made first; the original joins the group on the first copy', () => {
    expect(agents().require('a-pete')).toMatchObject({ kinId: null, kin: [] });
    copy('Bea');
    copy('Bix', rose);
    expect(agents().require('a-pete')).toMatchObject({ kinId: 'a-pete', kin: ['a-bea', 'a-bix'] });
    expect(agents().require('a-bix').kin).toEqual(['a-pete', 'a-bea']);
    expect(agents().require('a-scar')).toMatchObject({ kinId: null, kin: [] }); // strangers untouched
  });

  it('a copy of a copy joins the same group', () => {
    copy('Bea');
    const bix = copy('Bix', rose, 'a-bea');
    expect(bix).toMatchObject({ kinId: 'a-pete', kin: ['a-pete', 'a-bea'] });
  });

  it('editing the instructions on any kin changes all of them; name, nick and look stay personal', () => {
    copy('Bea');
    agents().update('a-bea', { prompt: 'Shared brain v2', roleId: null, canMail: false });
    agents().update('a-bea', { name: 'Bea B', nick: 'Bee', look: rose });
    expect(agents().require('a-pete')).toMatchObject({
      prompt: 'Shared brain v2',
      roleId: null,
      canMail: false,
    });
    expect(agents().require('a-pete').name).toBe('Pixel Pete');
    expect(agents().require('a-pete').look).not.toEqual(rose);
    expect(agents().require('a-scar').prompt).not.toBe('Shared brain v2');
  });

  it('a look-only edit leaves the kin row alone', () => {
    copy('Bea');
    const before = agents().require('a-pete').updatedAt;
    agents().update('a-bea', { look: rose });
    expect(agents().require('a-pete').updatedAt).toBe(before);
  });

  it('refuses a name already in the Cast (name or nick, any case) and copies of crew', () => {
    expect(() => copy('pixel pete')).toThrow(expect.objectContaining({ code: 'name_taken', status: 409 }));
    agents().update('a-scar', { nick: 'Scout' });
    expect(() => copy('SCOUT')).toThrow(expect.objectContaining({ code: 'name_taken' }));
    expect(() => copy('Bea', teal, 'a-pixel')).toThrow(expect.objectContaining({ code: 'conflict' }));
    expect(agents().require('a-pete').kinId).toBeNull(); // a refused copy leaves no trace
  });

  it('deleting a kin never touches the others; restored, it takes the group’s current instructions', () => {
    copy('Bea');
    const gone = h.store.trash.trashAgent('a-pete');
    expect(agents().require('a-bea')).toMatchObject({ kinId: 'a-pete', kin: [] });
    agents().update('a-bea', { prompt: 'Changed while Pete was away' });
    h.store.trash.restore(gone.restoreToken);
    expect(agents().require('a-pete')).toMatchObject({
      prompt: 'Changed while Pete was away',
      kin: ['a-bea'],
    });
  });
});
