/* Where the tokens go: the pure rollup, and GET /projects/:id/performance carrying it from real rows. */
import { afterEach, describe, expect, it } from 'vitest';
import type { Span } from '../../src/performance/spans.ts';
import { tokenUse } from '../../src/performance/tokens.ts';
import { testApp } from '../helpers.ts';

const T = (n: number) => ({ input: 0, output: 0, cacheRead: n, cacheWrite: 0 });
const span = (o: Partial<Span>): Span => ({
  agentId: 'a',
  kind: 'building',
  asked: 'task',
  outcome: 'done',
  turns: 1,
  tokens: T(100),
  start: '2026-11-20T10:00:00.000Z',
  end: '2026-11-20T10:10:00.000Z',
  itemId: null,
  ...o,
});
const W = { from: Date.parse('2026-11-19T00:00:00Z'), to: Date.parse('2026-11-21T00:00:00Z') };

describe('tokenUse', () => {
  it('nothing in the window: zeros, getting ready not measured', () => {
    expect(tokenUse([span({ start: '2026-11-01T00:00:00Z' })], W)).toEqual({
      usd: {},
      fresh: 0,
      pickedUp: 0,
      pickedUpTokens: 0,
      ready: null,
      readyOf: 0,
    });
  });

  it('sums cost per agent and counts clean starts against picked-up work', () => {
    const u = tokenUse(
      [
        span({ agentId: 'a', costUsd: 1.5 }),
        span({ agentId: 'a', costUsd: 0.5, resumed: true, tokens: T(400) }),
        span({ agentId: 'b', costUsd: null }),
        span({ agentId: 'b', tokens: null }),
      ],
      W,
    );
    expect(u.usd).toEqual({ a: 2 });
    expect(u.fresh).toBe(3);
    expect(u.pickedUp).toBe(1);
    expect(u.pickedUpTokens).toBe(400);
    expect(u.ready).toBeNull();
  });

  it('getting ready: first steps over the tokens of the spans that measured them', () => {
    const u = tokenUse([span({ firstContext: 10, tokens: T(200) }), span({ tokens: T(800) })], W);
    expect(u.ready).toBe(10);
    expect(u.readyOf).toBe(200);
  });
});

describe('GET /projects/:id/performance · tokenUse', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const run = (id: string, session: string | null, min: number, cost: number | null) =>
    h.db
      .prepare(
        `INSERT INTO runs (id, project_id, agent_id, task, status, runner, caps, turns, started_at, ended_at,
                           session_id, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
         VALUES (?, 'aurora', 'a-pixel', 'x', 'succeeded', 'fake', '{}', 2, ?, ?, ?, ?, 10, 10, 60, 20)`,
      )
      .run(id, ago(min), ago(min - 1), session, cost);

  it('a fresh run, a forget (new session) and a rework that carries the first session on', async () => {
    h = testApp({ seed: true });
    run('r1', 'r1', 50, 0.25);
    run('r2', 'random-forget-session', 40, 0.25);
    run('r3', 'r1', 30, 0.5);
    const r = await h.call('GET', '/projects/aurora/performance');
    expect(r.status).toBe(200);
    expect(r.body.tokenUse).toMatchObject({
      usd: { 'a-pixel': 1 },
      fresh: 2,
      pickedUp: 1,
      pickedUpTokens: 100,
      ready: null,
    });
  });

  it('reads first steps once session measuring has a column for them', async () => {
    h = testApp({ seed: true });
    h.db.exec('ALTER TABLE runs ADD COLUMN first_context INTEGER');
    run('r1', 'r1', 50, null);
    h.db.prepare("UPDATE runs SET first_context = 9 WHERE id = 'r1'").run();
    const r = await h.call('GET', '/projects/aurora/performance');
    expect(r.body.tokenUse.ready).toBe(9);
    expect(r.body.tokenUse.readyOf).toBe(100);
  });
});
