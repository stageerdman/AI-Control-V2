import { describe, expect, it } from 'vitest';
import type { Goal, Signoff } from '../../api';
import { chipOf, crewRings, signedLine, signoffView } from './workflow-view';

const p = (id: string, name: string) => ({ id, name, look: undefined as never });
const goal = (o: Partial<Goal>): Goal =>
  ({ id: 'g', text: 'Goal', status: 'running', items: [], pct: 0, ...o }) as Goal;

describe('chipOf', () => {
  it('the usual way (or an older goal) shows nothing', () => {
    expect(chipOf({ workflow: null } as never, 'w1')).toBeNull();
    expect(chipOf({ workflow: { id: 'w1', name: 'Usual', temporary: false } }, 'w1')).toBeNull();
    /* the list is not loaded yet: a stable one stays quiet rather than flash */
    expect(chipOf({ workflow: { id: 'w2', name: 'Hotfix', temporary: false } }, undefined)).toBeNull();
  });
  it('another stable workflow: a plain chip', () => {
    expect(chipOf({ workflow: { id: 'w2', name: 'Hotfix', temporary: false } }, 'w1')).toEqual({
      name: 'Hotfix',
      temporary: false,
      lead: null,
    });
  });
  it('a temporary one: dashed, with its lead — even before the list loads', () => {
    expect(
      chipOf({ workflow: { id: 'temp', name: 'Elon leads', temporary: true, lead: 'a-elon' } }, undefined),
    ).toEqual({ name: 'Elon leads', temporary: true, lead: 'a-elon' });
  });
});

describe('signoffView', () => {
  const s = (id: string, state: Signoff['state']): Signoff =>
    ({ reviewer: p(id, id.toUpperCase()), kind: 'review', state }) as Signoff;
  it('no reviewer: no strip', () => {
    expect(signoffView([])).toBeNull();
    expect(signoffView(undefined)).toBeNull();
  });
  it('3 faces, then +N; every state in words', () => {
    const v = signoffView([s('a', 'signed'), s('b', 'sent-back'), s('c', 'pending'), s('d', 'pending')]);
    expect(v?.faces).toHaveLength(3);
    expect(v?.more).toBe(1);
    expect(v?.label).toBe('Sign-offs: A: signed, B: sent it back, C: not signed yet, D: not signed yet');
  });
});

describe('signedLine', () => {
  it('only on a done goal with signers', () => {
    const signedBy = [p('a', 'Health Analyst'), p('b', 'Humanitarian')];
    expect(signedLine({ status: 'done', signedBy })).toBe('Signed by Health Analyst, Humanitarian');
    expect(signedLine({ status: 'running', signedBy })).toBeNull();
    expect(signedLine({ status: 'done', signedBy: [] })).toBeNull();
  });
});

describe('crewRings', () => {
  it('one ring per running temporary goal; lead not repeated in the crew', () => {
    const temp = { id: 'temp', name: 'Elon leads', temporary: true, lead: 'e', crew: ['e', 'x', 'y'] };
    const rings = crewRings([
      goal({ id: 'g1', text: 'Fix the login', workflow: temp }),
      goal({ id: 'g2', status: 'done', workflow: temp }),
      goal({ id: 'g3', workflow: { id: 'w1', name: 'Usual', temporary: false } }),
      goal({ id: 'g4' }),
    ]);
    expect(rings).toEqual([{ goalId: 'g1', label: 'Fix the login', lead: 'e', crew: ['x', 'y'] }]);
  });
  it('a long goal is cut short on the pill', () => {
    const temp = { id: 'temp', name: 'T', temporary: true, lead: 'e' };
    const [r] = crewRings([goal({ text: 'x'.repeat(60), workflow: temp })]);
    expect(r.label).toHaveLength(40);
    expect(r.label.endsWith('…')).toBe(true);
    expect(r.crew).toEqual([]);
  });
});
