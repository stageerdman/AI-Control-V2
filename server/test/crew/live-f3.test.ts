/* The real streams of the F3 end-to-end runs (2026-11-14), replayed so the shapes the CLI actually produced stay handled. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DispatchSchema } from '../../src/crew/dispatch.ts';
import { extractJson } from '../../src/crew/structured.ts';
import { parseRework } from '../../src/crew/team.ts';
import { createStreamParser } from '../../src/runtime/stream.ts';

const lines = (name: string) =>
  readFileSync(join(import.meta.dirname, '../fixtures', `live-f3-${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim());
const replay = (name: string) => {
  const p = createStreamParser();
  for (const l of lines(name)) p.feed(l);
  return p.outcome();
};

describe('F3 live streams', () => {
  it('a background command that ends after the answer: the answer stays the result, the follow-up only adds usage', () => {
    // the captain integrated, started `npm start` in the background to smoke-test, answered — then the CLI killed the
    // background task and ran one more turn about it ("The test copy of the server … has now stopped")
    const results = lines('integrate-background').filter((l) => JSON.parse(l).type === 'result');
    expect(results).toHaveLength(2);
    const o = replay('integrate-background');
    expect(o.status).toBe('succeeded');
    expect(o.result).toMatch(/^The three parts work together/);
    expect(o.result).not.toMatch(/has now stopped/);
    expect(o.turns).toBe(21); // 20 + the follow-up's 1
    expect(o.costUsd).toBeCloseTo(0.2193812); // the CLI's total is cumulative
    expect(o.usage.output).toBe(3455 + 105);
    expect(parseRework(o.result ?? '')).toEqual([]);
  });

  it('a failed first result is not hidden by a follow-up either way: a later result replaces only a failure', () => {
    const p = createStreamParser();
    p.feed(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 3 }));
    p.feed(JSON.stringify({ type: 'result', subtype: 'success', result: 'ok', num_turns: 1 }));
    expect(p.outcome()).toMatchObject({ status: 'succeeded', result: 'ok' });
  });

  it('a mixed goal plans the report first (for the reporter), then the builds; a feature is linked', () => {
    const o = replay('dispatch-report-first');
    const plan = DispatchSchema.parse(extractJson(o.result ?? ''));
    expect(plan.items.map((i) => [i.assignee, i.report ?? false])).toEqual([
      ['a-prof', true],
      ['a-semic', false],
      ['a-semic', false],
    ]);
    expect(plan.feature?.name).toBeTruthy();
  });

  it('the build that lingered on its background `npm start`: one clean result — the runner must end it (claude-cli.test)', () => {
    const o = replay('build-lingers');
    expect(o.status).toBe('succeeded');
    expect(o.result).toMatch(/node:sqlite/);
    const bg = lines('build-lingers').filter((l) => l.includes('"run_in_background":true'));
    expect(bg.length).toBeGreaterThan(0); // the background server that kept the CLI alive
  });
});
