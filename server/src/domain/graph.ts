/* A workflow drawn as a graph (updates/2026-11-17 WORKFLOWS, shape agreed with Jony for the visual editor).
   Pure — shape (zod), integrity issues (every one, by path, so the editor can mark them all at once) and the
   review gates it implies.

   - Nodes: an agent (the same agent may sit on several nodes — a reviewer often shows up twice) or a decision
     (a question). `x` / `y`: the editor's layout, integer logical px, stored as-is.
   - `start` / `end`: the first and final agent node, explicit (loops make them ambiguous to infer).
   - Edges: arrows with a `why`. Arrows leaving a decision carry a `branch` ("yes" / "no") and may skip the why.
     An arrow with `signoff` IS a review gate: `to` signs off `from`'s work. A plain arrow is a hand-off.

   Not an engine: the gates feed the board as they always did; the rest is read by the people who work by it. */
import { z } from 'zod';
import { GATE_KINDS, type Gate, MAX_GATES } from './gates.ts';

export const MAX_NODES = 16;
export const MAX_EDGES = 32;

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/, 'a slug: lowercase letters, digits and dashes (1–40)');
const coord = z.number().int().min(-100_000).max(100_000);

const AgentNode = z.strictObject({
  id: slug,
  type: z.literal('agent'),
  agent: z.string().trim().min(1).max(80),
  x: coord,
  y: coord,
});
const DecisionNode = z.strictObject({
  id: slug,
  type: z.literal('decision'),
  question: z.string().trim().min(1).max(120),
  x: coord,
  y: coord,
});

const EdgeSchema = z.strictObject({
  id: slug,
  from: slug,
  to: slug,
  why: z.string().trim().max(200).default(''),
  branch: z.string().trim().min(1).max(40).optional(),
  signoff: z.enum(GATE_KINDS).optional(),
});

export const GraphSchema = z.strictObject({
  nodes: z.array(z.discriminatedUnion('type', [AgentNode, DecisionNode])).min(1).max(MAX_NODES),
  start: slug,
  end: slug,
  edges: z.array(EdgeSchema).max(MAX_EDGES).default([]),
});
export type WorkflowGraph = z.output<typeof GraphSchema>;
export type GraphNode = WorkflowGraph['nodes'][number];
export type Issue = { path: string; message: string };

/** Who may stand on an agent node: on the project, on the team, or in the temporary crew. */
export type GraphRules = { allowed: (agentId: string) => boolean; who: string };

function duplicateIds(list: readonly { id: string }[], at: string): Issue[] {
  const seen = new Set<string>();
  return list.flatMap((x, i) => {
    const dup = seen.has(x.id);
    seen.add(x.id);
    return dup ? [{ path: `${at}.${i}.id`, message: `'${x.id}' is used twice` }] : [];
  });
}

function reachable(g: WorkflowGraph): Set<string> {
  const seen = new Set<string>([g.start]);
  const queue = [g.start];
  for (let at = queue.shift(); at !== undefined; at = queue.shift())
    for (const e of g.edges)
      if (e.from === at && !seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
  return seen;
}

function endpointIssues(g: WorkflowGraph, node: (id: string) => GraphNode | undefined): Issue[] {
  return (['start', 'end'] as const).flatMap((k) => {
    const n = node(g[k]);
    if (!n) return [{ path: k, message: `'${g[k]}' is not a node` }];
    return n.type === 'agent' ? [] : [{ path: k, message: `the ${k} must be an agent, not a decision` }];
  });
}

function edgeIssues(g: WorkflowGraph, node: (id: string) => GraphNode | undefined): Issue[] {
  return g.edges.flatMap((e, i): Issue[] => {
    const at = `edges.${i}`;
    const from = node(e.from);
    const to = node(e.to);
    const out: Issue[] = [];
    if (!from) out.push({ path: `${at}.from`, message: `'${e.from}' is not a node` });
    if (!to) out.push({ path: `${at}.to`, message: `'${e.to}' is not a node` });
    if (e.from === e.to) out.push({ path: at, message: 'an arrow must point at another node' });
    const fromDecision = from?.type === 'decision';
    if (!fromDecision && !e.why) out.push({ path: `${at}.why`, message: 'say why the work goes this way' });
    if (!fromDecision && e.branch !== undefined)
      out.push({ path: `${at}.branch`, message: 'only arrows leaving a decision have a branch' });
    if (fromDecision && e.branch === undefined)
      out.push({ path: `${at}.branch`, message: 'an arrow leaving a decision needs a branch ("yes", "no", …)' });
    if (e.signoff && (from?.type === 'decision' || to?.type === 'decision'))
      out.push({ path: `${at}.signoff`, message: 'a sign-off goes from one agent to another, not via a decision' });
    else if (e.signoff && from?.type === 'agent' && to?.type === 'agent' && from.agent === to.agent)
      out.push({ path: `${at}.signoff`, message: "nobody signs off their own work" });
    return out;
  });
}

function decisionIssues(g: WorkflowGraph): Issue[] {
  return g.nodes.flatMap((n, i): Issue[] => {
    if (n.type !== 'decision') return [];
    const out = g.edges.filter((e) => e.from === n.id);
    const branches = out.flatMap((e) => (e.branch ? [e.branch.toLowerCase()] : []));
    if (out.length < 2) return [{ path: `nodes.${i}`, message: 'a decision needs at least two ways out' }];
    return new Set(branches).size < branches.length
      ? [{ path: `nodes.${i}`, message: 'each way out of a decision needs its own branch' }]
      : [];
  });
}

/** Pure: everything wrong with a graph, each by path (no first-only: the editor marks them all). */
export function graphIssues(g: WorkflowGraph, rules: GraphRules): Issue[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const node = (id: string) => byId.get(id);
  const seen = endpointIssues(g, node).some((x) => x.path === 'start') ? null : reachable(g);
  const nodes = g.nodes.flatMap((n, i): Issue[] => {
    const out: Issue[] = [];
    if (n.type === 'agent' && !rules.allowed(n.agent))
      out.push({ path: `nodes.${i}.agent`, message: `'${n.agent}' is not ${rules.who}` });
    if (seen && !seen.has(n.id))
      out.push({ path: `nodes.${i}`, message: 'no arrow leads here from the start' });
    return out;
  });
  const signoffs = gatesFromGraph(g).length;
  return [
    ...duplicateIds(g.nodes, 'nodes'),
    ...duplicateIds(g.edges, 'edges'),
    ...endpointIssues(g, node),
    ...nodes,
    ...edgeIssues(g, node),
    ...decisionIssues(g),
    ...(signoffs > MAX_GATES
      ? [{ path: 'edges', message: `at most ${MAX_GATES} different sign-offs (this has ${signoffs})` }]
      : []),
  ];
}

/** Pure: the review gates a graph implies — each sign-off arrow between two agents, once, in arrow order. */
export function gatesFromGraph(g: WorkflowGraph): Gate[] {
  const agentOf = new Map(g.nodes.flatMap((n) => (n.type === 'agent' ? [[n.id, n.agent] as const] : [])));
  const seen = new Set<string>();
  return g.edges.flatMap((e): Gate[] => {
    const after = agentOf.get(e.from);
    const reviewer = agentOf.get(e.to);
    if (!e.signoff || !after || !reviewer || after === reviewer) return [];
    const key = `${after}\u0000${reviewer}\u0000${e.signoff}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ after, reviewer, kind: e.signoff, why: e.why || `${e.signoff} sign-off` }];
  });
}

/** Prefix each issue's path (a graph inside a bigger body: `workflows.2.graph`). */
export const under = (at: string, issues: readonly Issue[]): Issue[] =>
  issues.map((x) => ({ path: `${at}.${x.path}`, message: x.message }));
