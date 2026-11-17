/* The workflow editor's pure model (WORKFLOWS Phase 5b). The saved shape is the server's
   (server/src/domain/workflow-drawing.ts, wiki "The editor's shape"): a workflow's `gates` are its
   sign-off arrows, `steps` its hand-offs, `first` / `final` who starts and who signs last, `layout`
   where each node sits. A branch is a `when` on any arrow — no decision nodes.
   Inside the editor that is one small graph: nodes keyed by the agent (or team) id, arrows in the
   order they are saved (hand-offs first, then sign-offs — gates run in that order). `toGraph` and
   `toDrawing` turn one into the other; a saved drawing reloads exactly as drawn. */
import type { Gate, GateKind, Step, Workflow } from '../../../api';

export type FlowNode = { id: string; x: number; y: number };
/** `signoff` set = a gate (`to` signs off `from`'s work); `from === ANY` = a gate on every change. */
export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  why: string;
  when?: string;
  signoff?: GateKind;
};
export type Graph = { nodes: FlowNode[]; edges: FlowEdge[]; first: string | null; final: string | null };
/** The fields a drawing writes back into its workflow. */
export type Drawing = Pick<Workflow, 'gates' | 'first' | 'final' | 'steps' | 'layout'>;

/** A gate on "every change": listed under the canvas, never drawn as an arrow. */
export const ANY = '*';
export const MAX_NODES = 24;
export const MAX_STEPS = 12;
export const MAX_GATES = 8;
export const BOUNDS = { x: 1000, y: 600 };
export const SIGNOFF_KINDS: GateKind[] = ['review', 'quality', 'user-test', 'crash-test', 'security'];
/** Where a new node lands and how far the arrow keys move one. */
export const GRID = { dx: 200, dy: 120, x0: 100, y0: 60, step: 20, big: 60 };

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));

const nextId = (taken: Iterable<string>, prefix: string): string => {
  const used = new Set(taken);
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
};

/** The next free spot: rows of four, inside the canvas bounds. */
export function freeSpot(nodes: readonly FlowNode[]): { x: number; y: number } {
  const taken = new Set(nodes.map((n) => `${n.x},${n.y}`));
  for (let i = 0; i < 40; i++) {
    const p = { x: GRID.x0 + (i % 4) * GRID.dx, y: GRID.y0 + (Math.floor(i / 4) % 5) * GRID.dy };
    if (!taken.has(`${p.x},${p.y}`)) return p;
  }
  return { x: GRID.x0, y: GRID.y0 };
}

/* ---------- workflow ⇄ graph */

/** Pure: who stands on the drawing — the same rule as the server's `nodesOf` (gate ends but "*",
    hand-off ends, the lead and crew), in a stable order. */
export function nodeIds(w: Pick<Workflow, 'gates' | 'steps' | 'lead' | 'crew'>): string[] {
  return [
    ...new Set([
      ...(w.lead ? [w.lead] : []),
      ...(w.crew ?? []),
      ...(w.steps ?? []).flatMap((s) => [s.from, s.to]),
      ...w.gates.flatMap((g) => (g.after === ANY ? [g.reviewer] : [g.after, g.reviewer])),
    ]),
  ];
}

/** Pure: a workflow as the editor draws it. Nodes without a saved position get the next free spot.
    A temporary workflow with nothing drawn shows its lead handing each crew member their part. */
export function toGraph(
  w: Pick<Workflow, 'gates' | 'steps' | 'lead' | 'crew' | 'first' | 'final' | 'layout'>,
): Graph | null {
  const ids = nodeIds(w);
  if (!ids.length) return null;
  const nodes: FlowNode[] = [];
  for (const id of ids) {
    const at = w.layout?.[id];
    nodes.push({ id, ...(at ? { x: clamp(at.x, BOUNDS.x), y: clamp(at.y, BOUNDS.y) } : freeSpot(nodes)) });
  }
  let edges: FlowEdge[] = [];
  const add = (e: Omit<FlowEdge, 'id'>) => {
    /* the same key order as an edit makes (`clean`), so a reload compares equal to the drawing */
    edges = [...edges, clean({ ...e, id: `e${edges.length + 1}` })];
  };
  const steps = w.steps ?? [];
  for (const s of steps) add({ from: s.from, to: s.to, why: s.why, ...(s.when ? { when: s.when } : {}) });
  if (w.lead && !steps.length)
    for (const c of w.crew ?? [])
      if (c !== w.lead) add({ from: w.lead, to: c, why: 'their part of the goal' });
  for (const g of w.gates)
    add({ from: g.after, to: g.reviewer, why: g.why, signoff: g.kind, ...(g.when ? { when: g.when } : {}) });
  const first = w.first ?? (w.lead || null);
  const final = w.final ?? (w.lead && w.gates.some((g) => g.reviewer === w.lead) ? w.lead : null);
  return { nodes, edges, first, final };
}

/** Pure: the graph as the workflow's drawn fields + gates (what a PUT sends). */
export function toDrawing(g: Graph | null): Drawing {
  if (!g) return { gates: [] };
  const steps: Step[] = g.edges
    .filter((e) => !e.signoff)
    .map((e) => ({ from: e.from, to: e.to, why: e.why, ...(e.when ? { when: e.when } : {}) }));
  const gates: Gate[] = g.edges
    .filter((e) => e.signoff)
    .map((e) => ({
      after: e.from,
      reviewer: e.to,
      kind: e.signoff as GateKind,
      why: e.why,
      ...(e.when ? { when: e.when } : {}),
    }));
  return {
    gates,
    ...(steps.length ? { steps } : {}),
    ...(g.first ? { first: g.first } : {}),
    ...(g.final ? { final: g.final } : {}),
    layout: Object.fromEntries(g.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
  };
}

/** Pure: a workflow with the drawing written in (the old drawn fields replaced, nothing else touched). */
export function withDrawing<W extends Workflow>(w: W, g: Graph | null): W {
  const { first: _f, final: _l, steps: _s, layout: _p, ...rest } = w;
  return { ...rest, ...toDrawing(g) } as W;
}

/** Has the workflow been drawn (anything beyond plain gates)? */
export const isDrawn = (w: Pick<Workflow, 'steps' | 'layout' | 'first' | 'final'>): boolean =>
  !!(w.steps?.length || w.first || w.final || (w.layout && Object.keys(w.layout).length));

/* ---------- edits */

/** Hand-offs first, then sign-offs (each in drawing order): the order the server stores them in. */
const ordered = (edges: readonly FlowEdge[]) => [
  ...edges.filter((e) => !e.signoff),
  ...edges.filter((e) => e.signoff),
];

/** A one-node drawing: the first person starts. */
export const newGraph = (id: string): Graph => ({
  nodes: [{ id, ...freeSpot([]) }],
  edges: [],
  first: id,
  final: null,
});

export function addNode(g: Graph, id: string): Graph {
  if (g.nodes.some((n) => n.id === id)) return g;
  return { ...g, nodes: [...g.nodes, { id, ...freeSpot(g.nodes) }] };
}

/** Drop a node and every arrow touching it (an "every change" gate it reviews too). */
export function removeNode(g: Graph, id: string): Graph {
  return {
    nodes: g.nodes.filter((n) => n.id !== id),
    edges: g.edges.filter((e) => e.from !== id && e.to !== id),
    first: g.first === id ? null : g.first,
    final: g.final === id ? null : g.final,
  };
}

/** Positions stay inside the saved bounds (x 0..1000, y 0..600). */
export const moveNode = (g: Graph, id: string, x: number, y: number): Graph => ({
  ...g,
  nodes: g.nodes.map((n) => (n.id === id ? { ...n, x: clamp(x, BOUNDS.x), y: clamp(y, BOUNDS.y) } : n)),
});

/** Toggle who starts / who signs last (pressing it again clears it). Only agents sign last. */
export function setRole(
  g: Graph,
  id: string,
  role: 'first' | 'final',
  isTeam: (id: string) => boolean,
): Graph {
  if (!g.nodes.some((n) => n.id === id)) return g;
  if (role === 'final' && isTeam(id)) return g;
  return { ...g, [role]: g[role] === id ? null : id };
}

export function addEdge(g: Graph, e: Omit<FlowEdge, 'id'>): Graph {
  const id = nextId(
    g.edges.map((x) => x.id),
    'e',
  );
  return { ...g, edges: ordered([...g.edges, clean({ ...e, id })]) };
}

export const setEdge = (g: Graph, id: string, patch: Partial<Omit<FlowEdge, 'id'>>): Graph => ({
  ...g,
  edges: ordered(g.edges.map((e) => (e.id === id ? clean({ ...e, ...patch }) : e))),
});

export const removeEdge = (g: Graph, id: string): Graph => ({
  ...g,
  edges: g.edges.filter((e) => e.id !== id),
});

function clean(e: FlowEdge): FlowEdge {
  const when = e.when?.trim();
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    why: e.why.trim(),
    ...(when ? { when } : {}),
    ...(e.signoff ? { signoff: e.signoff } : {}),
  };
}

export const draftEdge = (from: string, to: string): Omit<FlowEdge, 'id'> => ({ from, to, why: '' });

/** What the arrow form may offer: a hand-off unless that pair already hands off (or 12 are drawn),
    a sign-off only by an agent and unless 8 are drawn. `self` = the arrow being changed. */
export function edgeRoom(
  g: Graph,
  e: Omit<FlowEdge, 'id'> & { id?: string },
  isTeam: (id: string) => boolean,
) {
  const others = g.edges.filter((x) => x.id !== e.id);
  const hands = others.filter((x) => !x.signoff);
  const signs = others.filter((x) => x.signoff);
  return {
    handoff: hands.length < MAX_STEPS && !hands.some((x) => x.from === e.from && x.to === e.to),
    signoff: signs.length < MAX_GATES && !isTeam(e.to),
  };
}

/** Ready to add: an arrow to someone else, with a why, of a kind there is room for. */
export function edgeReady(
  g: Graph,
  e: Omit<FlowEdge, 'id'> & { id?: string },
  isTeam: (id: string) => boolean,
): boolean {
  if (e.from === e.to || !e.why.trim()) return false;
  const room = edgeRoom(g, e, isTeam);
  return e.signoff ? room.signoff : room.handoff;
}

/* ---------- checks before saving (so nothing silently drops out on the server) */

/** Pure: what the server would refuse or drop, pinned the same way as its answers. */
export function localIssues(g: Graph | null, _nameOf?: (id: string) => string): Pinned {
  const out: Pinned = { edges: {}, nodes: {}, general: [] };
  if (!g) return out;
  const touched = new Set(g.edges.flatMap((e) => [e.from, e.to]));
  for (const n of g.nodes)
    if (!touched.has(n.id)) out.nodes[n.id] = ['has no arrow yet — connect them or remove them'];
  /* no "Signs last must be a reviewer" check: `final` only orders sign-offs, so a final who signs
     nothing is a harmless no-op (a team's default way sets final = captain with no sign-offs) */
  return out;
}

/* ---------- server problems → the thing they're about */
export type Issue = { path: string; message: string };
export type Pinned = {
  /** edge id → messages (shown on its row in the arrow list). */
  edges: Record<string, string[]>;
  /** node id → messages (a red ring + the message under the canvas). */
  nodes: Record<string, string[]>;
  /** Starts here / signs last / the workflow as a whole. */
  general: string[];
};
export const NO_ISSUES: Pinned = { edges: {}, nodes: {}, general: [] };

/** Map 422 / 409 `details` (paths like `workflows.0.steps.2.to`, `workflow.gates.0.reviewer`) onto the
    graph that was sent: `steps.i` is the i-th hand-off, `gates.i` the i-th sign-off, `layout.<id>` that
    node. Marks are kept by id so they stay put while the user edits. `prefix` = the workflow's path. */
export function pinIssues(g: Graph, details: unknown, prefix: string): Pinned {
  const out: Pinned = { edges: {}, nodes: {}, general: [] };
  if (!Array.isArray(details)) return out;
  const push = (m: Record<string, string[]>, k: string, msg: string) => {
    m[k] = [...(m[k] ?? []), msg];
  };
  const hands = g.edges.filter((e) => !e.signoff);
  const signs = g.edges.filter((e) => e.signoff);
  for (const d of details as Issue[]) {
    const msg = String(d?.message ?? '');
    let path = String(d?.path ?? '');
    if (prefix && (path === prefix || path.startsWith(`${prefix}.`))) path = path.slice(prefix.length + 1);
    const m = /^(steps|gates)\.(\d+)/.exec(path);
    const edge = m ? (m[1] === 'steps' ? hands : signs)[Number(m[2])] : undefined;
    const node = /^layout\.(.+?)(\.[xy])?$/.exec(path)?.[1];
    if (edge) push(out.edges, edge.id, msg);
    else if (node && g.nodes.some((n) => n.id === node)) push(out.nodes, node, msg);
    else if (path === 'first') out.general.push(`Starts here: ${msg}`);
    else if (path === 'final') out.general.push(`Signs last: ${msg}`);
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

/** "Pete hands work to Semic, only if it needs an endpoint: API first" ·
    "Scar signs off Pete (quality): keep it clean" · "Lint signs off every change (quality): …". */
/** "it touches payments" → "only when it touches payments"; "if it ships" stays "only if it ships". */
export function onlyWhen(when: string): string {
  const w = when.trim().replace(/^only\s+/i, '');
  if (/^unless\b/i.test(w)) return w;
  return /^(if|when|while|for|after|before)\b/i.test(w) ? `only ${w}` : `only when ${w}`;
}

export function edgeWords(e: FlowEdge, nameOf: (id: string) => string): string {
  const why = e.why ? `: ${e.why}` : '';
  const when = e.when ? `, ${onlyWhen(e.when)}` : '';
  if (e.signoff) {
    const whose = e.from === ANY ? 'every change' : nameOf(e.from);
    return `${nameOf(e.to)} signs off ${whose} (${kindLabel(e.signoff)})${when}${why}`;
  }
  return `${nameOf(e.from)} hands work to ${nameOf(e.to)}${when}${why}`;
}

export const sameGraph = (a: Graph | null, b: Graph | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

type Pt = { x: number; y: number };
/** Pure: does the straight line a → b run through another node (within `clear` of its centre)?
    Then the arrow bows out instead (a chain's way back over its forward arrows reads as a loop). */
export function blocked(a: Pt, b: Pt, others: readonly Pt[], clear: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return false;
  return others.some((o) => {
    const t = ((o.x - a.x) * dx + (o.y - a.y) * dy) / len2;
    if (t <= 0.05 || t >= 0.95) return false;
    return Math.hypot(a.x + t * dx - o.x, a.y + t * dy - o.y) < clear;
  });
}

/** Pure: the arrow a → b as a path. `bow` = how far its middle bows out (0 = straight), always to the
    left of the travel direction, so a way back and its way there bow apart. `cut` = how far each end
    stops short of the node centre. Returns the path, where its middle is, and the angle at its tip. */
export function arrowPath(a: Pt, b: Pt, bow: number, cut: (dx: number, dy: number) => Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  if (!bow) {
    const s = cut(dx, dy);
    const p1 = { x: a.x + s.x, y: a.y + s.y };
    const p2 = { x: b.x - s.x, y: b.y - s.y };
    return {
      d: `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`,
      mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      end: p2,
      angle: Math.atan2(dy, dx),
    };
  }
  /* quadratic curve: the control point sits 2×bow off the middle, so the curve's middle sits bow off */
  const nx = dy / len;
  const ny = -dx / len;
  const c = { x: (a.x + b.x) / 2 + nx * bow * 2, y: (a.y + b.y) / 2 + ny * bow * 2 };
  const s1 = cut(c.x - a.x, c.y - a.y);
  const s2 = cut(b.x - c.x, b.y - c.y);
  const p1 = { x: a.x + s1.x, y: a.y + s1.y };
  const p2 = { x: b.x - s2.x, y: b.y - s2.y };
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    d: `M${r(p1.x)} ${r(p1.y)}Q${r(c.x)} ${r(c.y)} ${r(p2.x)} ${r(p2.y)}`,
    mid: { x: (p1.x + 2 * c.x + p2.x) / 4, y: (p1.y + 2 * c.y + p2.y) / 4 },
    end: p2,
    angle: Math.atan2(p2.y - c.y, p2.x - c.x),
  };
}

/** The canvas frame: every node inside (positions are 0..1000 × 0..600), room for a node card around each. */
export function frame(nodes: readonly FlowNode[], pad = { x: 80, y: 50 }) {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(GRID.x0, ...xs) - pad.x;
  const minY = Math.min(GRID.y0, ...ys) - pad.y;
  const maxX = Math.max(GRID.x0 + 3 * GRID.dx, ...xs) + pad.x;
  const maxY = Math.max(GRID.y0 + GRID.dy, ...ys) + pad.y;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}
