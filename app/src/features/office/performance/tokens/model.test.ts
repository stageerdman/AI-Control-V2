/* Where the tokens go: every word the token view says, for none, some and many. */
import { describe, expect, it } from 'vitest';
import type { Performance, TokenUse } from '../../api';
import { agents, week } from '../fixtures';
import { EMPTY, money, NOT_MEASURED, PICKED_UP_HINT, READY_HINT, tokenView, topAgents } from './model';

const nameOf = (id: string) => agents[id]?.name ?? 'A retired agent';
const use = (u: Partial<TokenUse> = {}): TokenUse => ({
  usd: { 'a-rivet': 3.2, 'a-blair': 0.4 },
  fresh: 11,
  pickedUp: 2,
  pickedUpTokens: 1_480_000,
  ready: 111_000,
  readyOf: 3_700_000,
  ...u,
});
const withUse = (u?: Partial<TokenUse>): Performance => ({ ...week, tokenUse: use(u) });
const normal = (p: Performance) => {
  const v = tokenView(p, nameOf);
  if (v.state !== 'normal') throw new Error('expected the normal view');
  return v;
};

describe('money', () => {
  it('rounds to whole dollars and never shows cents', () => {
    expect(money(0.4)).toBe('under $1');
    expect(money(3.2)).toBe('about $3');
    expect(money(381.4)).toBe('about $381');
  });
});

describe('topAgents', () => {
  it('biggest first, until three quarters are covered', () => {
    expect(topAgents(week).map((t) => t.agentId)).toEqual(['a-rivet', 'a-blair']);
  });
});

describe('tokenView', () => {
  it('nothing measured: one calm line, never zeros', () => {
    expect(tokenView({ ...week, totals: { ...week.totals, tokens: 0 } }, nameOf)).toEqual({
      state: 'empty',
      text: EMPTY,
    });
  });

  it('a sentence first: what it cost and who, without the shares the sheet already shows', () => {
    const v = normal(withUse());
    expect(v.lead).toBe('About $4 in all, at pay-as-you-go prices: Rivet about $3, Blair under $1.');
    expect(v.lead).not.toMatch(/%/);
  });

  it('one agent with nearly all the cost', () => {
    const v = normal(withUse({ usd: { 'a-rivet': 3.2 } }));
    expect(v.lead).toBe('About $3 in all, at pay-as-you-go prices, nearly all of it Rivet.');
  });

  it('only crew calls priced: the total alone', () => {
    expect(normal(withUse({ usd: { crew: 2 } })).lead).toBe('About $2 in all, at pay-as-you-go prices.');
  });

  it('no price known: no sentence', () => {
    expect(normal(withUse({ usd: {} })).lead).toBeNull();
  });

  it('working vs getting ready, with what it means', () => {
    const v = normal(withUse());
    expect(v.ready).toEqual({ working: 97, text: '97% working · 3% getting ready' });
    expect(v.hint).toBe(`${READY_HINT} ${PICKED_UP_HINT}`);
  });

  it('getting ready not measured yet: said so, no bar, no definition', () => {
    const v = normal(withUse({ ready: null, readyOf: 0, pickedUp: 0, pickedUpTokens: 0 }));
    expect(v.ready).toEqual({ working: null, text: NOT_MEASURED });
    expect(v.hint).toBeNull();
  });

  it('fresh starts and picked-up work, one count each', () => {
    expect(normal(withUse()).starts?.text).toBe('11 fresh starts · 2 picked up old work (40% of the tokens)');
    expect(normal(withUse({ fresh: 1, pickedUp: 0, pickedUpTokens: 0 })).starts?.text).toBe(
      '1 fresh start · none picked up old work',
    );
  });

  it('per hour of work: tokens, against the week before', () => {
    const v = normal(withUse());
    expect(v.perHour?.text).toBe('766k tokens');
    expect(v.perHour?.trend?.text).toBe('↑ 2% vs last week');
    expect(normal({ ...withUse(), range: 'all', previous: null }).perHour?.trend).toBeNull();
  });

  it('an older server without the rollup: the rate only', () => {
    const v = normal(week);
    expect(v.lead).toBeNull();
    expect(v.starts).toBeNull();
    expect(v.ready.text).toBe(NOT_MEASURED);
  });

  it('plain words only', () => {
    const v = normal(withUse());
    const all = [v.lead, v.ready.text, v.starts?.text, v.perHour?.text, v.hint].join(' ');
    expect(all).not.toMatch(/cache|context|re-?read|prefix|input|output|\bAPI\b|session/i);
  });
});
