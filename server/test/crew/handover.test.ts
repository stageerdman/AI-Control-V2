/* Handover rules (src/crew/handover.ts): how an item changes hands by its status, and whose a run's result is. */
import { describe, expect, it } from 'vitest';
import {
  freshBuild,
  handoverLine,
  handoverMode,
  handoverNote,
  outlivedOwner,
} from '../../src/crew/handover.ts';
import type { ChecklistItem } from '../../src/db/work.ts';

const item = (over: Partial<ChecklistItem>) =>
  ({ agentId: 'a-bob', teamId: null, teamPhase: null, ...over }) as ChecklistItem;

describe('handover rules', () => {
  it('done work changes hands as it is; a live run first ends; anything else restarts now', () => {
    expect(handoverMode({ status: 'done' })).toBe('keep');
    expect(handoverMode({ status: 'running' })).toBe('later');
    for (const status of ['todo', 'failed', 'cancelled'] as const)
      expect(handoverMode({ status })).toBe('now');
  });

  it('a fresh build drops the old owner’s sessions and review progress, back to the first gate', () => {
    expect(freshBuild()).toMatchObject({
      status: 'todo',
      stage: 'build',
      gateIndex: 0,
      sendBacks: 0,
      buildRunId: null,
      resumeRunId: null,
      runId: null,
      teamPhase: null,
    });
  });

  it('the new owner reads the handover note; any other note (a result, a failure) stays out of the task', () => {
    const note = handoverNote('Columbo', 'Take the Pensieve.');
    expect(handoverLine(note)).toBe('Handed over by Columbo: Take the Pensieve.');
    expect(handoverLine('tests are red')).toBe('');
    expect(handoverLine(null)).toBe('');
  });

  it('a run outlived its owner when its agent no longer holds the item', () => {
    expect(outlivedOwner(item({}), 'a-bob')).toBe(false);
    expect(outlivedOwner(item({}), 'a-columbo')).toBe(true);
    /* during a review the reviewer holds it: their run is theirs, not an old owner's */
    const inReview = item({
      stage: 'review',
      gateIndex: 0,
      gates: [{ reviewer: 'a-lint', kind: 'review', why: '' }],
    });
    expect(outlivedOwner(inReview, 'a-lint')).toBe(false);
  });
});
