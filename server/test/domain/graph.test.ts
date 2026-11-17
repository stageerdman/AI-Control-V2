import { describe, expect, it } from 'vitest';
import { gatesFromGraph, GraphSchema, graphIssues, type GraphRules, under } from '../../src/domain/graph.ts';

const anyone: GraphRules = { allowed: () => true, who: 'on the project' };
const agent = (id: string, who: string) => ({ id, type: 'agent', agent: who, x: 0, y: 0 });
const decision = (id: string) => ({ id, type: 'decision', question: 'Ready?', x: 10, y: -10 });
const edge = (id: string, from: string, to: string, more: object = {}) => ({ id, from, to, why: 'next', ...more });
const graph = (more: object = {}) =>
  GraphSchema.parse({
    nodes: [agent('build', 'a-bob'), agent('check', 'a-elon'), agent('ship', 'a-bob')],
    start: 'build',
    end: 'ship',
    edges: [edge('e1', 'build', 'check', { signoff: 'quality' }), edge('e2', 'check', 'ship')],
    ...more,
  });
const paths = (g = graph(), rules = anyone) => graphIssues(g, rules).map((x) => x.path);

describe('workflow graphs (pure)', () => {
  it('a clean graph has no issues, even with the same agent on two nodes', () => {
    expect(graphIssues(graph(), anyone)).toEqual([]);
  });

  it('schema: strict, integer coords, why defaults to empty', () => {
    expect(() => graph({ nodes: [{ ...agent('build', 'a-bob'), x: 1.5 }] })).toThrow();
    expect(() => graph({ colour: 'red' })).toThrow();
    expect(graph({ edges: [{ id: 'e1', from: 'build', to: 'check' }] }).edges[0]?.why).toBe('');
  });

  it('returns every issue at once, each by path', () => {
    const g = graph({
      nodes: [agent('build', 'a-bob'), agent('build', 'a-x'), decision('ok'), agent('lost', 'a-elon')],
      start: 'ok',
      end: 'nowhere',
      edges: [
        edge('e1', 'build', 'ghost', { why: '' }),
        edge('e1', 'ok', 'build'),
        edge('e3', 'build', 'build', { branch: 'yes' }),
      ],
    });
    expect(paths(g, { allowed: (a) => a !== 'a-x', who: 'on the team' })).toEqual([
      'nodes.1.id',
      'edges.1.id',
      'start',
      'end',
      'nodes.1.agent',
      'edges.0.to',
      'edges.0.why',
      'edges.1.branch',
      'edges.2',
      'edges.2.branch',
      'nodes.2',
    ]);
  });

  it('flags nodes the start cannot reach', () => {
    const g = graph({ nodes: [...graph().nodes, agent('island', 'a-x')] });
    expect(paths(g)).toEqual(['nodes.3']);
  });

  it('decisions: arrows out need distinct branches and may skip the why', () => {
    const nodes = [agent('build', 'a-bob'), decision('ok'), agent('ship', 'a-elon')];
    const out = (a: string, b: string) => [
      edge('e1', 'build', 'ok'),
      edge('e2', 'ok', 'ship', { why: '', branch: a }),
      edge('e3', 'ok', 'build', { why: '', branch: b }),
    ];
    expect(paths(graph({ nodes, end: 'ship', edges: out('yes', 'no') }))).toEqual([]);
    expect(paths(graph({ nodes, end: 'ship', edges: out('yes', 'YES') }))).toEqual(['nodes.1']);
  });

  it('sign-offs: never via a decision, never your own work', () => {
    const nodes = [agent('build', 'a-bob'), decision('ok'), agent('ship', 'a-bob'), agent('x', 'a-elon')];
    const edges = [
      edge('e1', 'build', 'ok', { signoff: 'review' }),
      edge('e2', 'ok', 'ship', { branch: 'yes' }),
      edge('e3', 'ok', 'x', { branch: 'no' }),
      edge('e4', 'build', 'ship', { signoff: 'review' }),
    ];
    expect(paths(graph({ nodes, end: 'ship', edges }))).toEqual(['edges.0.signoff', 'edges.3.signoff']);
  });

  it('gatesFromGraph: one gate per agent pair and kind, in arrow order', () => {
    const g = graph({
      nodes: [...graph().nodes, agent('check2', 'a-elon')],
      edges: [
        edge('e1', 'build', 'check', { signoff: 'quality', why: '' }),
        edge('e2', 'check', 'ship'),
        edge('e3', 'ship', 'check2', { signoff: 'quality' }),
        edge('e4', 'ship', 'check2', { signoff: 'security', why: 'safe' }),
      ],
    });
    expect(gatesFromGraph(g)).toEqual([
      { after: 'a-bob', reviewer: 'a-elon', kind: 'quality', why: 'quality sign-off' },
      { after: 'a-bob', reviewer: 'a-elon', kind: 'security', why: 'safe' },
    ]);
  });

  it('under prefixes paths', () => {
    expect(under('workflows.0.graph', [{ path: 'edges.1.to', message: 'm' }])).toEqual([
      { path: 'workflows.0.graph.edges.1.to', message: 'm' },
    ]);
  });
});
