/* requeuePatch: where a stopped item starts again. Failed in review → back to its builder, counts reset
   (Sea GPS: re-running the reviewer failed it again at once and the builder never saw the new brief). */
import { describe, expect, it } from 'vitest';
import { requeuePatch } from '../../src/crew/requeue.ts';
import type { ChecklistItem } from '../../src/db/work.ts';

const GATE = { reviewer: 'a-lint', kind: 'review', why: 'w' };
const item = (over: Partial<ChecklistItem>): ChecklistItem =>
  ({
    status: 'failed',
    stage: 'build',
    gates: [GATE],
    gateIndex: 0,
    sendBacks: 0,
    mergeTries: 0,
    runId: 'r-last',
    buildRunId: 'r-build',
    teamPhase: null,
    ...over,
  }) as ChecklistItem;
const always = () => true;

describe('requeuePatch', () => {
  it('a build carries on in its own last session', () => {
    expect(requeuePatch(item({}), always)).toMatchObject({ status: 'todo', resumeRunId: 'r-last', note: null });
    expect(requeuePatch(item({}), () => false).resumeRunId).toBeNull();
  });

  it('failed in review (sent back too often): back to the builder’s session, counts reset', () => {
    const p = requeuePatch(item({ stage: 'review', sendBacks: 2, gateIndex: 0 }), always);
    expect(p).toMatchObject({
      status: 'todo',
      stage: 'build',
      gateIndex: 0,
      sendBacks: 0,
      mergeTries: 0,
      resumeRunId: 'r-build',
    });
  });

  it('a merge fix carries on in its session; a merge that failed after the gates goes back to the builder', () => {
    expect(requeuePatch(item({ stage: 'merge', mergeTries: 3 }), always)).toMatchObject({ resumeRunId: 'r-last' });
    expect(requeuePatch(item({ stage: 'review', gateIndex: 1, mergeTries: 3 }), always)).toMatchObject({
      stage: 'build',
      mergeTries: 0,
    });
  });

  it('a review that was only interrupted starts its gate over', () => {
    const p = requeuePatch(item({ status: 'cancelled', stage: 'review', sendBacks: 1 }), always);
    expect(p).toEqual(expect.objectContaining({ status: 'todo', resumeRunId: null }));
    expect(p.stage).toBeUndefined();
    expect(p.sendBacks).toBeUndefined();
  });
});
