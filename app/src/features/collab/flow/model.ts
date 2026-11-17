/* The workflow editor's pure model (WORKFLOWS Phase 5b). The shape is the server's
   (server/src/domain/graph.ts, wiki "Graphs (as built)"): agent and decision nodes, an explicit
   start and end (both agents), arrows with a why; arrows out of a decision carry a branch; an
   arrow with `signoff` is a review gate (`to` signs off `from`'s work).
   Everything here is a plain function of a graph, so the editor is a thin view over it. */
import type { Gate, GateKind, GraphEdge, GraphNode, WorkflowGraph } from '../../../api';

export type FlowNode = GraphNode;
export type FlowEdge = GraphEdge;
export type Graph = WorkflowGraph;

export const MAX_NODES = 16;
export const MAX_EDGES = 32;
export const SIGNOFF_KINDS: GateKind[] = ['review', 'quality', 'user-test', 'crash-test', 'security'];
/** Where a new node lands and how far the arrow keys move one. */
export const GRID = { dx: 200, dy: 120, step: 20, big: 60 };

const nextId = (taken: Iterable<string>, prefix: string): string => {
  const used = new Set(taken);
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
};

/** The next free spot: a row of four, then the next row. */
export function freeSpot(nodes: readonly FlowNode[]): { x: number; y: number } {
  const taken = new Set(nodes.map((n) => `${n.x},${n.y}`));
  for (let i = 0; ; i++) {
    const p = { x: (i % 4) * GRID.dx, y: Math.floor(i / 4) * GRID.dy };
    if (!taken.has(`${p.x},${p.y}`)) return p;
  }
}

/** A drawing to start from when a workflow has none: its agent-to-agent gates as sign-off arrows
    (team / "every change" gates can't be drawn — `left` counts them so the editor can say so). */
export function seedFromGates(
  gates: readonly Gate[],
  isAgent: (id: string) => boolean,
  opts: { lead?: string; crew?: readonly string[] } = {},
): { graph: Graph | null; left: number } {
  const box: { g: Graph | null } = { g: null };
  const nodeFor = (agent: string): string => {
    const at = box.g?.nodes.find((n) => n.type === 'agent' && n.agent === agent);
    if (at) return at.id;
    const g = box.g ? addAgent(box.g, agent) : newGraph(agent);
    box.g = g;
    return g.nodes[g.nodes.length - 1].id;
  };
  if (opts.lead) {
    nodeFor(opts.lead);
    for (const c of opts.crew ?? []) nodeFor(c);
  }
  let left = 0;
  for (const gate of gates) {
    if (!isAgent(gate.after) || !isAgent(gate.reviewer) || gate.after === gate.reviewer) {
      left++;
      continue;
    }
    const from = nodeFor(gate.after);
    const to = nodeFor(gate.reviewer);
    const g = box.g as Graph;
    if (!g.edges.some((e) => e.from === from && e.to === to && e.signoff === gate.kind))
      box.g = addEdge(g, { from, to, why: gate.why, signoff: gate.kind });
  }
  /* a temporary crew: the lead hands each one their part and signs it off */
  if (opts.lead && box.g) {
    let g = box.g;
    const lead = g.nodes[0].id;
    for (const n of g.nodes.slice(1)) {
      if (!g.edges.some((e) => e.from === lead && e.to === n.id))
        g = addEdge(g, { from: lead, to: n.id, why: 'their part of the goal' });
      if (!g.edges.some((e) => e.from === n.id && e.to === lead && e.signoff))
        g = addEdge(g, { from: n.id, to: lead, why: 'the lead signs off', signoff: 'review' });
    }
    box.g = { ...g, start: lead, end: lead };
  }
  return { graph: box.g, left };
}

/** A one-node drawing: the first agent both starts and signs last. */
export const newGraph = (agent: string): Graph => ({
  nodes: [{ id: 'n1', type: 'agent', agent, x: 0, y: 0 }],
  start: 'n1',
  end: 'n1',
  edges: [],
});

export function addAgent(g: Graph, agent: string): Graph {
  const id = nextId(
    g.nodes.map((n) => n.id),
    'n',
  );
  return { ...g, nodes: [...g.nodes, { id, type: 'agent', agent, ...freeSpot(g.nodes) }] };
}

export function addDecision(g: Graph, question: string): Graph {
  const id = nextId(
    g.nodes.map((n) => n.id),
    'd',
  );
  return { ...g, nodes: [...g.nodes, { id, type: 'decision', question, ...freeSpot(g.nodes) }] };
}

/** Drop a node and every arrow touching it; start / end fall back to the first agent left. */
export function removeNode(g: Graph, id: string): Graph {
  const nodes = g.nodes.filter((n) => n.id !== id);
  const firstAgent = nodes.find((n) => n.type === 'agent')?.id ?? '';
  return {
    nodes,
    start: g.start === id ? firstAgent : g.start,
    end: g.end === id ? firstAgent : g.end,
    edges: g.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export const moveNode = (g: Graph, id: string, x: number, y: number): Graph => ({
  ...g,
  nodes: g.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)),
});

export const setNode = (g: Graph, id: string, patch: { agent?: string; question?: string }): Graph => ({
  ...g,
  nodes: g.nodes.map((n) =>
    n.id !== id ? n : n.type === 'agent' ? { ...n, agent: patch.agent ?? n.agent } : { ...n, question: patch.question ?? n.question },
  ),
});

/** Only agents start or sign last. */
export function setRole(g: Graph, id: string, role: 'start' | 'end'): Graph {
  const n = g.nodes.find((x) => x.id === id);
  return n?.type === 'agent' ? { ...g, [role]: id } : g;
}

export function addEdge(g: Graph, e: Omit<FlowEdge, 'id'>): Graph {
  const id = nextId(
    g.edges.map((x) => x.id),
    'e',
  );
  return { ...g, edges: [...g.edges, clean({ ...e, id }, g)] };
}

export const setEdge = (g: Graph, id: string, patch: Partial<Omit<FlowEdge, 'id'>>): Graph => ({
  ...g,
  edges: g.edges.map((e) => (e.id === id ? clean({ ...e, ...patch }, g) : e)),
});

export const removeEdge = (g: Graph, id: string): Graph => ({ ...g, edges: g.edges.filter((e) => e.id !== id) });

/** What the arrow may carry, given its ends: a branch only out of a decision, a sign-off only agent → agent. */
function clean(e: FlowEdge, g: Graph): FlowEdge {
  const from = g.nodes.find((n) => n.id === e.from);
  const to = g.nodes.find((n) => n.id === e.to);
  const out: FlowEdge = { id: e.id, from: e.from, to: e.to, why: (e.why ?? '').trim() };
  if (from?.type === 'decision') out.branch = (e.branch ?? '').trim();
  else if (e.signoff && to?.type === 'agent') out.signoff = e.signoff;
  return out;
}

/** What a new arrow out of `from` starts with: a decision's next branch ("yes", then "no"). */
export function draftEdge(g: Graph, from: string, to: string): Omit<FlowEdge, 'id'> {
  const n = g.nodes.find((x) => x.id === from);
  if (n?.type !== 'decision') return { from, to, why: '' };
  const used = new Set(g.edges.filter((e) => e.from === from).map((e) => e.branch?.toLowerCase()));
  return { from, to, why: '', branch: ['yes', 'no'].find((b) => !used.has(b)) ?? '' };
}

/** Ready to add: an arrow to a different node, a why (or a branch out of a decision). */
export function edgeReady(g: Graph, e: Omit<FlowEdge, 'id'>): boolean {
  if (e.from === e.to) return false;
  const from = g.nodes.find((n) => n.id === e.from);
  return from?.type === 'decision' ? !!e.branch?.trim() : !!e.why?.trim();
}

/* ---------- server problems → the thing they're about */
export type Issue = { path: string; message: string };
export type Pinned = {
  /** edge id → messages (shown on its row in the arrow list). */
  edges: Record<string, string[]>;
  /** node id → messages (a red ring + the message under the canvas). */
  nodes: Record<string, string[]>;
  /** Start / end / the drawing as a whole. */
  general: string[];
};

/** Map 422 `details` (paths like `workflows.0.graph.edges.2.why`) onto the graph that was sent,
    by id, so the marks stay put while the user edits. `prefix` = the graph's path in the body. */
export function pinIssues(g: Graph, details: unknown, prefix: string): Pinned {
  const out: Pinned = { edges: {}, nodes: {}, general: [] };
  if (!Array.isArray(details)) return out;
  const push = (m: Record<string, string[]>, k: string, msg: string) => {
    m[k] = [...(m[k] ?? []), msg];
  };
  for (const d of details as Issue[]) {
    const msg = String(d?.message ?? '');
    let path = String(d?.path ?? '');
    if (prefix && path.startsWith(prefix)) path = path.slice(prefix.length).replace(/^\./, '');
    const m = /^(edges|nodes)\.(\d+)/.exec(path);
    const list = m ? (m[1] === 'edges' ? g.edges : g.nodes) : null;
    const item = m && list ? list[Number(m[2])] : undefined;
    if (m && item) push(m[1] === 'edges' ? out.edges : out.nodes, item.id, msg);
    else if (path === 'start') out.general.push(`Starts here: ${msg}`);
    else if (path === 'end') out.general.push(`Signs last: ${msg}`);
    else out.general.push(msg);
  }
  return out;
}

export const issueCount = (p: Pinned): number =>
  p.general.length + Object.values(p.edges).flat().length + Object.values(p.nodes).flat().length;

/* ---------- words (the arrow list, screen readers) */
const KIND: Record<string, string> = {
  quality: 'quality',
  'user-test': 'user test',
  'crash-test': 'crash test',
  security: 'security',
  review: 'review',
};
export const kindLabel = (k: string): string => KIND[k] ?? k;

export function nodeLabel(n: FlowNode | undefined, nameOf: (agent: string) => string): string {
  if (!n) return 'Gone';
  return n.type === 'agent' ? nameOf(n.agent) : n.question;
}

/** "Pete hands work to Semic: UI ready" · "Lint signs off Pete (quality): keep it clean" · "If yes → Scar". */
export function edgeWords(g: Graph, e: FlowEdge, nameOf: (agent: string) => string): string {
  const at = (id: string) => nodeLabel(g.nodes.find((n) => n.id === id), nameOf);
  const why = e.why ? `: ${e.why}` : '';
  if (e.branch !== undefined) return `${at(e.from)} — if ${e.branch || '…'} → ${at(e.to)}${why}`;
  if (e.signoff) return `${at(e.to)} signs off ${at(e.from)} (${kindLabel(e.signoff)})${why}`;
  return `${at(e.from)} hands work to ${at(e.to)}${why}`;
}

export const sameGraph = (a: Graph | null, b: Graph | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The canvas frame: every node inside, with room for a node card around each position. */
export function frame(nodes: readonly FlowNode[], pad = { x: 80, y: 60 }) {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(0, ...xs) - pad.x;
  const minY = Math.min(0, ...ys) - pad.y;
  const maxX = Math.max(600, ...xs) + pad.x;
  const maxY = Math.max(240, ...ys) + pad.y;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}
