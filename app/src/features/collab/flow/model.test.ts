/* The editor's pure model on the server's shape (wiki "The editor's shape"): nodes from gates / steps /
   lead / crew, a round trip that reloads exactly as drawn, edits, first / final rules, layout defaults,
   the local check, and server issue paths → the arrow they are about. */
import { describe, expect, it } from 'vitest';
import type { Workflow } from '../../../api';
import {
  ANY,
  addEdge,
  addNode,
  edgeReady,
  edgeRoom,
  edgeWords,
  freeSpot,
  type Graph,
  isDrawn,
  localIssues,
  moveNode,
  newGraph,
  nodeIds,
  pinIssues,
  removeNode,
  setEdge,
  setRole,
  toDrawing,
  toGraph,
  withDrawing,
} from './model';

const name = (id: string) => ({ pete: 'Pete', semic: 'Semic', scar: 'Scar', lint: 'Lint' })[id] ?? id;
const isTeam = (id: string) => id.startsWith('t-');

const office: Workflow = {
  id: 'usual',
  name: 'Usual',
  when: 'everything',
  orchestratorTalksTo: 'captains',
  maxSendBacks: 2,
  summary: 'How we work.',
  gates: [
    { after: ANY, reviewer: 'lint', kind: 'quality', why: 'keep it clean' },
    { after: 'semic', reviewer: 'scar', kind: 'review', why: 'API sound', when: 'if it ships' },
  ],
  steps: [{ from: 'pete', to: 'semic', why: 'API first.', when: 'if it needs an endpoint' }],
  first: 'pete',
  final: 'scar',
  layout: { pete: { x: 10, y: 20 }, semic: { x: 400, y: 20 } },
};

describe('workflow ⇄ graph', () => {
  it('nodes are the lead, crew, hand-off ends and gate ends — never "*"', () => {
    expect(nodeIds(office)).toEqual(['pete', 'semic', 'lint', 'scar']);
    expect(nodeIds({ gates: [], lead: 'elon', crew: ['bob'] })).toEqual(['elon', 'bob']);
  });

  it('a saved drawing reloads exactly as drawn', () => {
    const g = toGraph(office) as Graph;
    expect(g.first).toBe('pete');
    expect(g.final).toBe('scar');
    expect(g.nodes.find((n) => n.id === 'pete')).toEqual({ id: 'pete', x: 10, y: 20 });
    const back = withDrawing(office, g);
    expect(back).toEqual({ ...office, layout: Object.fromEntries(g.nodes.map((n) => [n.id, { x: n.x, y: n.y }])) });
    expect(toGraph(back)).toEqual(g);
    /* the "every change" gate keeps its place in the gate order */
    expect(back.gates.map((x) => x.after)).toEqual([ANY, 'semic']);
  });

  it('nodes without a position get the next free spot inside the canvas', () => {
    const g = toGraph(office) as Graph;
    const lint = g.nodes.find((n) => n.id === 'lint');
    const scar = g.nodes.find((n) => n.id === 'scar');
    expect(lint).toBeTruthy();
    expect(scar).toBeTruthy();
    expect(`${lint?.x},${lint?.y}`).not.toBe(`${scar?.x},${scar?.y}`);
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1000);
      expect(n.y).toBeLessThanOrEqual(600);
    }
  });

  it('plain gates only: not drawn yet, but already a drawing of sign-offs', () => {
    const plain = { ...office, steps: undefined, first: undefined, final: undefined, layout: undefined };
    expect(isDrawn(plain)).toBe(false);
    expect(isDrawn(office)).toBe(true);
    expect(toGraph(plain)?.edges.every((e) => e.signoff)).toBe(true);
    expect(toGraph({ gates: [] })).toBeNull();
  });

  it('a temporary way with nothing drawn: the lead hands each crew member their part, starts and signs last', () => {
    const g = toGraph({
      gates: [{ after: 'bob', reviewer: 'elon', kind: 'review', why: 'the lead signs off' }],
      lead: 'elon',
      crew: ['bob'],
    }) as Graph;
    expect(g.first).toBe('elon');
    expect(g.final).toBe('elon');
    expect(g.edges.map((e) => edgeWords(e, (x) => x))).toEqual([
      'elon hands work to bob: their part of the goal',
      'elon signs off bob (review): the lead signs off',
    ]);
  });
});

describe('edits', () => {
  it('hand-offs stay before sign-offs (the saved order); changing the kind moves the arrow', () => {
    let g = addNode(newGraph('pete'), 'semic');
    g = addEdge(g, { from: 'pete', to: 'semic', why: 'check', signoff: 'review' });
    g = addEdge(g, { from: 'pete', to: 'semic', why: 'build' });
    expect(g.edges.map((e) => e.why)).toEqual(['build', 'check']);
    g = setEdge(g, g.edges[1].id, { signoff: undefined, when: '  ' });
    expect(g.edges[1]).toEqual({ id: g.edges[1].id, from: 'pete', to: 'semic', why: 'check' });
  });

  it('removing a node drops its arrows and its badges', () => {
    const g = removeNode(toGraph(office) as Graph, 'scar');
    expect(g.final).toBeNull();
    expect(g.edges.some((e) => e.to === 'scar' || e.from === 'scar')).toBe(false);
    expect(removeNode(toGraph(office) as Graph, 'lint').edges.some((e) => e.from === ANY)).toBe(false);
  });

  it('first / final toggle; a team may start but never signs last', () => {
    const g = addNode(newGraph('pete'), 't-ship');
    expect(g.first).toBe('pete');
    expect(setRole(g, 'pete', 'first', isTeam).first).toBeNull();
    expect(setRole(g, 't-ship', 'first', isTeam).first).toBe('t-ship');
    expect(setRole(g, 't-ship', 'final', isTeam).final).toBeNull();
    expect(setRole(g, 'pete', 'final', isTeam).final).toBe('pete');
  });

  it('moves stay inside x 0..1000, y 0..600', () => {
    const g = moveNode(newGraph('pete'), 'pete', -40, 900);
    expect(g.nodes[0]).toMatchObject({ x: 0, y: 600 });
    expect(freeSpot(g.nodes)).not.toEqual({ x: 0, y: 600 });
  });

  it('room: one hand-off per pair, sign-offs only by an agent, a why always', () => {
    const g = addEdge(addNode(newGraph('pete'), 'semic'), { from: 'pete', to: 'semic', why: 'x' });
    expect(edgeRoom(g, { from: 'pete', to: 'semic', why: '' }, isTeam)).toEqual({ handoff: false, signoff: true });
    expect(edgeRoom(g, { from: 'pete', to: 't-ship', why: '' }, isTeam).signoff).toBe(false);
    expect(edgeReady(g, { from: 'semic', to: 'pete', why: ' ' }, isTeam)).toBe(false);
    expect(edgeReady(g, { from: 'semic', to: 'pete', why: 'ok' }, isTeam)).toBe(true);
    expect(edgeReady(g, { from: 'pete', to: 'pete', why: 'ok' }, isTeam)).toBe(false);
    /* changing an arrow doesn't count itself */
    expect(edgeReady(g, { ...g.edges[0], why: 'y' }, isTeam)).toBe(true);
  });
});

describe('checks and problems', () => {
  it('locally: a card with no arrow, and a final who signs nothing off', () => {
    const g = setRole(addNode(toGraph(office) as Graph, 'pete'), 'pete', 'final', isTeam);
    const lone = addNode(g, 'alone');
    const p = localIssues(lone, name);
    expect(Object.keys(p.nodes)).toEqual(['alone']);
    expect(p.general).toEqual(['Signs last: Pete signs nothing off here — pick one of the reviewers']);
    expect(localIssues(toGraph(office), name)).toEqual({ edges: {}, nodes: {}, general: [] });
  });

  it('server paths: steps.i → the i-th hand-off, gates.i → the i-th sign-off, layout.<id> → that node', () => {
    const g = toGraph(office) as Graph;
    const p = pinIssues(
      g,
      [
        { path: 'workflows.2.steps.0.to', message: 'a' },
        { path: 'workflows.2.gates.1.reviewer', message: 'b' },
        { path: 'workflows.2.first', message: 'c' },
        { path: 'workflows.2.layout.semic.x', message: 'd' },
        { path: 'workflows.2', message: 'e' },
      ],
      'workflows.2',
    );
    const step = g.edges.find((e) => !e.signoff)?.id as string;
    const gate = g.edges.filter((e) => e.signoff)[1].id;
    expect(p.edges).toEqual({ [step]: ['a'], [gate]: ['b'] });
    expect(p.nodes).toEqual({ semic: ['d'] });
    expect(p.general).toEqual(['Starts here: c', 'e']);
    expect(pinIssues(g, [{ path: 'workflow.gates.0.why', message: 'x' }], 'workflow').edges).toEqual({
      [g.edges.filter((e) => e.signoff)[0].id]: ['x'],
    });
  });

  it('words: hand-off, sign-off, every change, only when', () => {
    const g = toGraph(office) as Graph;
    expect(g.edges.map((e) => edgeWords(e, name))).toEqual([
      'Pete hands work to Semic, only if it needs an endpoint: API first.',
      'Lint signs off every change (quality): keep it clean',
      'Scar signs off Semic (review), only if it ships: API sound',
    ]);
  });

  it('toDrawing leaves out what is not drawn', () => {
    expect(toDrawing(null)).toEqual({ gates: [] });
    expect(toDrawing({ ...newGraph('pete'), first: null })).toEqual({
      gates: [],
      layout: { pete: freeSpot([]) },
    });
  });
});
