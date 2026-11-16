/* GET /projects/:id/performance: the sheet's one read — totals, per agent, per local day over a range. */
import { afterEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe('GET /projects/:id/performance', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('an office with no work: zeros and seven empty days', async () => {
    h = testApp({ seed: true });
    const r = await h.call('GET', '/projects/aurora/performance');
    expect(r.status).toBe(200);
    expect(r.body.range).toBe('7d');
    expect(r.body.totals).toEqual({ ms: 0, tokens: 0, requests: 0 });
    expect(r.body.agents).toEqual([]);
    expect(r.body.days).toHaveLength(7);
  });

  it('rejects an unknown range and an unknown project', async () => {
    h = testApp({ seed: true });
    expect((await h.call('GET', '/projects/aurora/performance?range=1y')).status).toBe(422);
    expect((await h.call('GET', '/projects/aurora/performance?tz=9999')).status).toBe(422);
    expect((await h.call('GET', '/projects/nope/performance')).status).toBe(404);
  });

  it('counts a chat run with its tokens, and an old crew call without tokens as unmeasured', async () => {
    h = testApp({ seed: true });
    h.db
      .prepare(
        `INSERT INTO runs (id, project_id, agent_id, task, status, runner, caps, turns, started_at, ended_at, asked,
                           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
         VALUES ('r1', 'aurora', 'a-pixel', 'hi', 'succeeded', 'fake', '{}', 2, ?, ?, 'chat', 100, 20, 0, 0)`,
      )
      .run(ago(30), ago(20));
    h.db
      .prepare(
        `INSERT INTO crew_time (id, scope, owner_id, agent_id, kind, turns, started_at, ended_at)
         VALUES ('c1', 'project', 'aurora', 'a-pixel', 'thinking', 1, ?, ?)`,
      )
      .run(ago(10), ago(5));

    const r = await h.call('GET', '/projects/aurora/performance?range=30d&tz=-60');
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(30);
    expect(r.body.totals.requests).toBe(2);
    expect(r.body.totals.tokens).toBe(120);
    expect(r.body.unmeasured).toBe(1);
    const [pixel] = r.body.agents;
    expect(pixel.agentId).toBe('a-pixel');
    expect(pixel.asked).toEqual({ task: 1, call: 0, chat: 1 });
  });
});
