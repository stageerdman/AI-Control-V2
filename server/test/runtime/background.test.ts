import { describe, expect, it } from 'vitest';
import type { ChecklistItem, Goal } from '../../src/db/work.ts';
import { backgroundTimeoutError, waitsForBackground } from '../../src/runtime/background.ts';
import { isStuckStop } from '../../src/runtime/limits.ts';
import { createStreamParser } from '../../src/runtime/stream.ts';
import { boardText } from '../../src/whiteboard/board-text.ts';

describe('waitsForBackground', () => {
  it.each([
    "The full e2e is still running, I'll pick up again when it finishes.",
    'The tests are running in the background; I will continue once they complete.',
    'Waiting for the e2e suite before I commit.',
    "I'll carry on when the build is done.",
  ])('reads a wait in %j', (s) => expect(waitsForBackground(s)).toBe(true));

  it.each(['Done: the app is up and all tests pass.', 'Committed the fix; tests pass.'])(
    'no wait in %j',
    (s) => expect(waitsForBackground(s)).toBe(false),
  );
});

describe('backgroundTimeoutError', () => {
  it('names the commands and the limit, and counts as a stall', () => {
    const e = backgroundTimeoutError(45 * 60_000, [{ id: 'b1', description: 'npm run e2e' }]);
    expect(e).toBe(
      'Stopped: waited 45 minutes for its background command (npm run e2e) to finish; they never did.',
    );
    expect(isStuckStop(e)).toBe(true);
    expect(isStuckStop(backgroundTimeoutError(60_000, []))).toBe(true);
  });
});

describe('stream parser: background tasks and the woken answer', () => {
  const line = (o: object) => JSON.stringify({ session_id: 's', ...o });
  const result = (text: string, extra: object = {}) =>
    line({ type: 'result', subtype: 'success', num_turns: 3, result: text, total_cost_usd: 0.1, ...extra });

  it('tracks live background tasks (scrubbed) and counts answers', () => {
    const p = createStreamParser(['SECRETVALUE123']);
    p.feed(
      line({
        type: 'system',
        subtype: 'background_tasks_changed',
        tasks: [{ task_id: 'b', description: 'TOKEN=SECRETVALUE123 npm test' }],
      }),
    );
    expect(p.background()).toHaveLength(1);
    expect(p.background()[0]?.id).toBe('b');
    expect(p.background()[0]?.description).not.toContain('SECRETVALUE123');
    p.feed(result('still running'));
    expect(p.answers()).toBe(1);
    expect(p.answerText()).toBe('still running');
    p.feed(line({ type: 'system', subtype: 'background_tasks_changed', tasks: [] }));
    expect(p.background()).toEqual([]);
  });

  it('without awaitWake a later result is only a notice (F3); with it, the woken result is the answer', () => {
    const notice = createStreamParser();
    notice.feed(result('the answer'));
    notice.feed(result('the server stopped', { origin: { kind: 'task-notification' }, num_turns: 1 }));
    expect(notice.outcome().result).toBe('the answer');
    expect(notice.answers()).toBe(1);

    const woken = createStreamParser();
    woken.feed(result('still running'));
    woken.awaitWake();
    woken.feed(
      result('all pass', { origin: { kind: 'task-notification' }, num_turns: 2, total_cost_usd: 0.4 }),
    );
    expect(woken.answers()).toBe(2);
    expect(woken.outcome()).toMatchObject({
      status: 'succeeded',
      result: 'all pass',
      turns: 5,
      costUsd: 0.4,
    });
  });

  it('a woken answer that failed fails the run', () => {
    const p = createStreamParser();
    p.feed(result('still running'));
    p.awaitWake();
    p.feed(line({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 1 }));
    expect(p.outcome()).toMatchObject({
      status: 'failed',
      result: 'still running',
      error: 'error_during_execution',
    });
  });
});

describe('board text: a running task that waits for its tests', () => {
  it('says so to Pixel', () => {
    const item = {
      id: 'i1',
      position: 0,
      text: 'Fix GPS',
      agentId: 'bob',
      status: 'running',
      runId: 'r1',
    } as ChecklistItem;
    const goal = {
      id: 'g1',
      text: 'Sea GPS',
      status: 'running',
      pct: 50,
      updatedAt: '2026-11-22',
      items: [item],
    } as unknown as Goal;
    const r = { name: (id: string) => id, usualId: 'w', directorId: 'pixel' };
    expect(boardText([goal], { ...r, waitingOn: (id) => id === 'r1' })).toContain(
      '[waiting for its background tests to finish] Fix GPS',
    );
    expect(boardText([goal], r)).toContain('[running now] Fix GPS');
  });
});
