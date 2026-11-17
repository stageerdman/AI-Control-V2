/* A team's way (v2 S2–S4): the derived default, the chain the split follows, pruning after leavers. */
import { describe, expect, it } from 'vitest';
import { orderedSubtasks } from '../../src/crew/team.ts';
import {
  chainOrder,
  defaultTeamWay,
  pruneWay,
  WAY_SHAPES,
  type WayShape,
} from '../../src/domain/team-way.ts';
import { teamStaffing, type Workflow, workflowIssues } from '../../src/domain/workflows.ts';

const crewOf = (n: number, captainId: string | null = 'm0') => ({
  captainId,
  members: Array.from({ length: n }, (_, i) => `m${i}`),
});
const sure = (w: Workflow | null): Workflow => {
  if (!w) throw new Error('expected a way');
  return w;
};
const way = (crew: ReturnType<typeof crewOf>, shape: WayShape) => sure(defaultTeamWay(crew, shape));
const arrows = (w: Workflow) => (w.steps ?? []).map((s) => `${s.from}>${s.to}`);
const issues = (w: Workflow, members: readonly string[]) =>
  workflowIssues(
    w,
    teamStaffing({ id: 't', name: 'T', members }, (id) => id),
    { temporary: false },
  );

describe('defaultTeamWay', () => {
  it.each(WAY_SHAPES.flatMap((shape) => [2, 3, 7].map((n) => [shape, n] as const)))(
    '%s shape with %i members is a valid way, gate-free, at most 12 arrows',
    (shape, n) => {
      const crew = crewOf(n);
      const w = way(crew, shape);
      expect(issues(w, crew.members)).toEqual([]);
      expect(w.gates).toEqual([]);
      expect(arrows(w).length).toBeLessThanOrEqual(12);
      expect(w).toMatchObject({ first: 'm0', final: 'm0' });
      expect(Object.keys(w.layout ?? {}).sort()).toEqual([...crew.members].sort());
    },
  );

  it('captain shape: out and back to each member; chain shape: one closed loop', () => {
    expect(arrows(way(crewOf(3), 'captain'))).toEqual(['m0>m1', 'm1>m0', 'm0>m2', 'm2>m0']);
    expect(arrows(way(crewOf(3), 'chain'))).toEqual(['m0>m1', 'm1>m2', 'm2>m0']);
  });

  it('the captain leads wherever they sit; no captain → the first member leads', () => {
    expect(way({ captainId: 'm2', members: ['m0', 'm1', 'm2'] }, 'chain').first).toBe('m2');
    expect(way(crewOf(3, null), 'chain').first).toBe('m0');
  });

  it('fewer than two members: no way', () => {
    expect(defaultTeamWay(crewOf(1), 'captain')).toBeNull();
    expect(defaultTeamWay(crewOf(0, null), 'chain')).toBeNull();
  });
});

describe('chainOrder', () => {
  it('a chain gives its order from who starts; the captain shape and branches give null', () => {
    expect(chainOrder(way(crewOf(3), 'chain'))).toEqual(['m0', 'm1', 'm2']);
    expect(chainOrder(way(crewOf(3), 'captain'))).toBeNull();
    const chain = way(crewOf(3), 'chain');
    const branched = { ...chain, steps: (chain.steps ?? []).map((s) => ({ ...s, when: 'if it ships' })) };
    expect(chainOrder(branched)).toBeNull();
  });

  it('an open line (no way back) is not a chain', () => {
    const steps = [
      { from: 'a', to: 'b', why: 'x' },
      { from: 'b', to: 'c', why: 'x' },
    ];
    expect(chainOrder({ steps, first: 'a' })).toBeNull();
  });
});

describe('pruneWay', () => {
  const own = (): Workflow => ({
    ...way(crewOf(3), 'chain'),
    gates: [{ after: 'm1', reviewer: 'm2', kind: 'quality', why: 'Test it.' }],
  });

  it('drops every arrow, gate and position touching the leavers', () => {
    const w = sure(pruneWay(own(), new Set(['m2']), 'm0'));
    expect(w.gates).toEqual([]);
    expect(arrows(w)).toEqual(['m0>m1']);
    expect(Object.keys(w.layout ?? {})).toEqual(['m0', 'm1']);
    expect(w.first).toBe('m0');
  });

  it('who signs last falls to the captain when they left', () => {
    const w = sure(pruneWay({ ...own(), final: 'm2', gates: [] }, new Set(['m2']), 'm0'));
    expect(w.final).toBe('m0');
  });

  it('a start whose arrows all went is dropped', () => {
    const w = sure(pruneWay(own(), new Set(['m0']), null));
    expect(w.first).toBeUndefined();
    expect(arrows(w)).toEqual(['m1>m2']);
  });

  it('nothing left → null (back on the default)', () => {
    expect(pruneWay(own(), new Set(['m1', 'm2']), 'm0')).toBeNull();
  });
});

describe('orderedSubtasks (the split follows a chain)', () => {
  const parts = [
    { assignee: 'm0', parallel: true },
    { assignee: 'm2', parallel: true },
    { assignee: 'm1', parallel: true },
  ];

  it('chain: in chain order, one after another, the lead’s part last', () => {
    expect(orderedSubtasks(way(crewOf(3), 'chain'), parts)).toEqual([
      { assignee: 'm1', parallel: false },
      { assignee: 'm2', parallel: false },
      { assignee: 'm0', parallel: false },
    ]);
  });

  it('captain shape or no way: untouched', () => {
    expect(orderedSubtasks(way(crewOf(3), 'captain'), parts)).toEqual(parts);
    expect(orderedSubtasks(null, parts)).toEqual(parts);
  });
});
