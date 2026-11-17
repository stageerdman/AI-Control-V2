/* The editor's pure graph model (WORKFLOWS Phase 5b). */
import { describe, expect, it } from 'vitest';
import {
  addAgent,
  addDecision,
  addEdge,
  draftEdge,
  edgeReady,
  edgeWords,
  issueCount,
  newGraph,
  pinIssues,
  removeNode,
  seedFromGates,
  setEdge,
  setRole,
} from './model';

const names: Record<string, string> = { pete: 'Pete', semic: 'Semic', lint: 'Lint' };
const nameOf = (a: string) => names[a] ?? 'Someone';

describe('flow model', () => {
  it('a new drawing is one agent who starts and signs last', () => {
    const g = newGraph('pete');
    expect(g).toEqual({
      nodes: [{ id: 'n1', type: 'agent', agent: 'pete', x: 0, y: 0 }],
      start: 'n1',
      end: 'n1',
      edges: [],
    });
  });

  it('adds nodes on free spots with fresh ids', () => {
    const g = addDecision(addAgent(newGraph('pete'), 'semic'), 'Payments?');
    expect(g.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'd1']);
    expect(new Set(g.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(3);
  });

  it('only agents start or sign last', () => {
    const g = addDecision(addAgent(newGraph('pete'), 'semic'), 'Q');
    expect(setRole(g, 'n2', 'end').end).toBe('n2');
    expect(setRole(g, 'd1', 'start').start).toBe('n1');
  });

  it('removing a node drops its arrows; start / end fall back to the first agent', () => {
    let g = addAgent(newGraph('pete'), 'semic');
    g = setRole(g, 'n2', 'end');
    g = addEdge(g, { from: 'n1', to: 'n2', why: 'UI ready' });
    const r = removeNode(g, 'n2');
    expect(r.edges).toEqual([]);
    expect(r.end).toBe('n1');
  });

  it('a branch only out of a decision, a sign-off only between agents', () => {
    let g = addDecision(addAgent(newGraph('pete'), 'semic'), 'Payments?');
    g = addEdge(g, { from: 'd1', to: 'n2', why: '', branch: ' yes ', signoff: 'review' });
    g = addEdge(g, { from: 'n1', to: 'd1', why: 'x', branch: 'no', signoff: 'review' });
    expect(g.edges[0]).toEqual({ id: 'e1', from: 'd1', to: 'n2', why: '', branch: 'yes' });
    expect(g.edges[1]).toEqual({ id: 'e2', from: 'n1', to: 'd1', why: 'x' });
    g = setEdge(g, 'e2', { to: 'n2', signoff: 'quality' });
    expect(g.edges[1].signoff).toBe('quality');
  });

  it('a decision drafts yes, then no; an arrow needs a why (or a branch)', () => {
    let g = addDecision(addAgent(newGraph('pete'), 'semic'), 'Q');
    expect(draftEdge(g, 'd1', 'n1').branch).toBe('yes');
    g = addEdge(g, draftEdge(g, 'd1', 'n1'));
    expect(draftEdge(g, 'd1', 'n2').branch).toBe('no');
    expect(edgeReady(g, { from: 'n1', to: 'n2', why: ' ' })).toBe(false);
    expect(edgeReady(g, { from: 'n1', to: 'n2', why: 'go' })).toBe(true);
    expect(edgeReady(g, { from: 'n1', to: 'n1', why: 'go' })).toBe(false);
    expect(edgeReady(g, { from: 'd1', to: 'n2', why: '', branch: 'no' })).toBe(true);
  });

  it('seeds a drawing from agent gates and counts the ones it can’t draw', () => {
    const { graph, left } = seedFromGates(
      [
        { after: 'pete', reviewer: 'lint', kind: 'quality', why: 'clean' },
        { after: 'team-1', reviewer: 'lint', kind: 'review', why: 'team' },
        { after: '*', reviewer: 'lint', kind: 'review', why: 'every change' },
      ],
      (a) => a in names,
    );
    expect(left).toBe(2);
    expect(graph?.edges).toEqual([{ id: 'e1', from: 'n1', to: 'n2', why: 'clean', signoff: 'quality' }]);
  });

  it('seeds a temporary crew: the lead hands out and signs off', () => {
    const { graph } = seedFromGates([], () => true, { lead: 'pete', crew: ['semic'] });
    expect(graph?.start).toBe('n1');
    expect(graph?.end).toBe('n1');
    expect(graph?.edges.map((e) => edgeWords(graph, e, nameOf))).toEqual([
      'Pete hands work to Semic: their part of the goal',
      'Pete signs off Semic (review): the lead signs off',
    ]);
  });

  it('pins 422 details to the arrow / node that was sent, by id', () => {
    let g = addAgent(newGraph('pete'), 'semic');
    g = addEdge(g, { from: 'n1', to: 'n2', why: 'a' });
    g = addEdge(g, { from: 'n2', to: 'n1', why: 'b' });
    const p = pinIssues(
      g,
      [
        { path: 'workflows.0.graph.edges.1.why', message: 'say why' },
        { path: 'workflows.0.graph.nodes.0.agent', message: 'not on the project' },
        { path: 'workflows.0.graph.end', message: 'must be an agent' },
        { path: 'workflows.0.summary', message: 'required' },
      ],
      'workflows.0.graph',
    );
    expect(p.edges).toEqual({ e2: ['say why'] });
    expect(p.nodes).toEqual({ n1: ['not on the project'] });
    expect(p.general).toEqual(['Signs last: must be an agent', 'required']);
    expect(issueCount(p)).toBe(4);
    expect(pinIssues(g, undefined, '')).toEqual({ edges: {}, nodes: {}, general: [] });
  });

  it('reads arrows as plain words', () => {
    let g = addDecision(addAgent(newGraph('pete'), 'lint'), 'Payments?');
    g = addEdge(g, { from: 'n1', to: 'n2', why: 'keep it clean', signoff: 'quality' });
    g = addEdge(g, { from: 'd1', to: 'n2', why: '', branch: 'yes' });
    g = addEdge(g, { from: 'n1', to: 'd1', why: 'built' });
    expect(g.edges.map((e) => edgeWords(g, e, nameOf))).toEqual([
      'Lint signs off Pete (quality): keep it clean',
      'Payments? — if yes → Lint',
      'Pete hands work to Payments?: built',
    ]);
  });
});
