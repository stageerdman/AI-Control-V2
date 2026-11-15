import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from '../../src/db/work.ts';
import { DEFAULT_LOOK } from '../../src/domain/look.ts';
import { type FindAgent, presentTask } from '../../src/whiteboard/present.ts';

const LOOK = { ...DEFAULT_LOOK, hue: 'teal' };
const find: FindAgent = (id) => (id === 'gone' ? null : { name: `Name of ${id}`, look: LOOK });

const item = (over: Partial<ChecklistItem> = {}): ChecklistItem =>
  ({
    id: 'i1',
    agentId: 'builder',
    status: 'running',
    stage: 'build',
    gates: [],
    gateIndex: 0,
    teamPhase: null,
    subtasks: [],
    note: null,
    ...over,
  }) as ChecklistItem;

describe('presentTask: each task carries its people', () => {
  it('a running build: the builder is on it', () => {
    expect(presentTask(item(), find)).toMatchObject({
      workingNow: [{ id: 'builder', name: 'Name of builder', look: LOOK }],
      finishedBy: null,
      problem: null,
    });
  });

  it('during a review: the reviewer holds it', () => {
    const it = item({
      stage: 'review',
      gates: [{ reviewer: 'rev', kind: 'review', why: '' }] as ChecklistItem['gates'],
    });
    expect(presentTask(it, find).workingNow.map((p) => p.id)).toEqual(['rev']);
  });

  it('a split team item: the members on running parts (once each), and the parts carry their own people', () => {
    const sub = (agentId: string, status: ChecklistItem['status']) => item({ id: agentId, agentId, status });
    const it = item({
      agentId: 'captain',
      teamPhase: 'members',
      subtasks: [sub('m1', 'running'), sub('m2', 'done'), sub('m1', 'running'), sub('m3', 'todo')],
    });
    const v = presentTask(it, find);
    expect(v.workingNow.map((p) => p.id)).toEqual(['m1']);
    expect(v.subtasks[1]?.finishedBy?.id).toBe('m2');
  });

  it('done: who finished it; queued: nobody yet', () => {
    expect(presentTask(item({ status: 'done' }), find)).toMatchObject({
      workingNow: [],
      finishedBy: { id: 'builder' },
    });
    expect(presentTask(item({ status: 'todo' }), find)).toMatchObject({ workingNow: [], finishedBy: null });
  });

  it('someone no longer in the studio still shows, with a default avatar', () => {
    expect(presentTask(item({ agentId: 'gone', status: 'done' }), find).finishedBy).toEqual({
      id: 'gone',
      name: 'Someone who left',
      look: DEFAULT_LOOK,
    });
  });

  it('a stopped task gets its plain message', () => {
    const v = presentTask(item({ status: 'failed', note: 'Stopped: reached the turn cap (30)' }), find);
    expect(v.problem?.message).toBe('Ran out of steps. The work is saved and can continue.');
  });
});
