/* WayThumb (design/workflows/way-thumb.md): a small, live picture of a way — faces and arrows, nothing
   else. Positions come from the editor's own `toGraph` + `frame`, so the thumb and the canvas always match.
   Decorative (aria-hidden): the button around it carries the words. Sizes: sm (Quest Board header),
   md (Other ways row), lg (team panel). */
import type { Workflow } from '../../../api';
import { Hero } from '../../../characters';
import { ANY, arrowPath, blocked, type FlowNode, frame, type Graph, toGraph } from './model';
import type { Person } from './WorkflowEditor';
import './way-thumb.css';

export type ThumbSize = 'sm' | 'md' | 'lg';
export type ThumbWay = Pick<Workflow, 'gates' | 'steps' | 'lead' | 'crew' | 'first' | 'final' | 'layout'>;

/** Box (px) and face (px) per size. lg is a fixed stage centred in a full-width box. */
export const THUMB: Record<ThumbSize, { w: number; h: number; face: number }> = {
  sm: { w: 64, h: 36, face: 14 },
  md: { w: 120, h: 68, face: 18 },
  lg: { w: 360, h: 132, face: 28 },
};

export type ThumbNode = { id: string; x: number; y: number };
export type ThumbEdge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The arrow's path (a straight line, or a curve when it would cross someone's face). */
  d: string;
  mid: { x: number; y: number };
  /** Direction at the tip (radians). */
  angle: number;
  signoff: boolean;
};

/** Pure: the graph fitted into a box — node centres and arrow ends in box pixels. Same frame as the editor. */
export function thumbLayout(g: Graph, size: ThumbSize, extra: readonly FlowNode[] = []) {
  const box = THUMB[size];
  const all = [...g.nodes, ...extra];
  /* tighter padding than the editor's: a thumb has no name labels or badges to make room for */
  const f = frame(all, { x: 40, y: 40 });
  const r = box.face / 2 + 2;
  const s = Math.min((box.w - 2 * r) / f.width, (box.h - 2 * r) / f.height);
  const ox = (box.w - f.width * s) / 2;
  const oy = (box.h - f.height * s) / 2;
  const at = (n: FlowNode): ThumbNode => ({
    id: n.id,
    x: Math.round((ox + (n.x - f.minX) * s) * 10) / 10,
    y: Math.round((oy + (n.y - f.minY) * s) * 10) / 10,
  });
  const nodes = g.nodes.map(at);
  const ghosts = extra.map(at);
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: ThumbEdge[] = [];
  const pairs = new Map<string, string[]>();
  for (const e of g.edges) {
    if (e.from === ANY) continue;
    const k = [e.from, e.to].sort().join('|');
    pairs.set(k, [...(pairs.get(k) ?? []), e.id]);
  }
  for (const e of g.edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b || e.from === ANY) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    /* opposite / parallel arrows between one pair sit side by side */
    const same = pairs.get([e.from, e.to].sort().join('|')) ?? [e.id];
    const k = same.indexOf(e.id) - (same.length - 1) / 2;
    const sign = e.from < e.to ? 1 : -1;
    const off = Math.max(2, box.face / 5);
    const ox2 = (-dy / len) * k * off * sign;
    const oy2 = (dx / len) * k * off * sign;
    const pa = { x: a.x + ox2, y: a.y + oy2 };
    const pb = { x: b.x + ox2, y: b.y + oy2 };
    /* a line through someone else's face (a chain's way back) bows out, so the loop reads as a loop */
    const others = nodes.filter((n) => n.id !== e.from && n.id !== e.to);
    const bow = blocked(pa, pb, others, r + 2) ? r * 1.6 : 0;
    const p = arrowPath(pa, pb, bow, (x, y) => {
      const l = Math.hypot(x, y) || 1;
      return { x: (x / l) * r, y: (y / l) * r };
    });
    edges.push({
      id: e.id,
      x1: pa.x + dx * (r / len),
      y1: pa.y + dy * (r / len),
      x2: p.end.x,
      y2: p.end.y,
      d: p.d,
      mid: p.mid,
      angle: p.angle,
      signoff: !!e.signoff,
    });
  }
  return { box, nodes, ghosts, edges };
}

export function WayThumb({
  way,
  people,
  size,
  temporary,
  loading,
  ghosts,
}: {
  way: ThumbWay | null | undefined;
  people: Person[];
  size: ThumbSize;
  temporary?: boolean;
  loading?: boolean;
  /** Team members not on the drawing yet (lg only): faint dashed rings at these spots. */
  ghosts?: FlowNode[];
}) {
  const cls = `wt wt-${size}${temporary ? ' temp' : ''}`;
  if (loading) return <span className={`${cls} wt-skel`} aria-hidden="true" data-testid="wt-skel" />;
  const g = way ? toGraph(way) : null;
  if (!g) return <EmptyMark cls={cls} size={size} />;
  const L = thumbLayout(g, size, size === 'lg' ? (ghosts ?? []) : []);
  const byId = new Map(people.map((p) => [p.id, p]));
  const face = L.box.face;
  const tip = size === 'sm' ? 3 : 4;
  return (
    <span className={cls} aria-hidden="true">
      <span className="wt-stage" style={{ width: L.box.w, height: L.box.h }}>
        <svg width={L.box.w} height={L.box.h} className="wt-arrows" aria-hidden="true">
          {L.edges.map((e) => {
            const ang = e.angle;
            const hx = e.x2 - Math.cos(ang - 0.5) * tip;
            const hy = e.y2 - Math.sin(ang - 0.5) * tip;
            const kx = e.x2 - Math.cos(ang + 0.5) * tip;
            const ky = e.y2 - Math.sin(ang + 0.5) * tip;
            return (
              <g key={e.id} className={`wt-edge${e.signoff ? ' signoff' : ''}`} data-edge={e.id}>
                <path d={e.d} />
                <path className="wt-tip" d={`M${hx} ${hy}L${e.x2} ${e.y2}L${kx} ${ky}`} />
                {e.signoff && size === 'lg' && (
                  <g transform={`translate(${e.mid.x} ${e.mid.y})`}>
                    <circle r="6" className="wt-check-bg" />
                    <path d="M-2.6 0.3l1.7 1.7L2.8-2" className="wt-check" />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {L.ghosts.map((n) => (
          <span
            key={`ghost-${n.id}`}
            className="wt-ghost"
            style={{ left: n.x - face / 2, top: n.y - face / 2, width: face, height: face }}
          />
        ))}
        {L.nodes.map((n) => {
          const who = byId.get(n.id);
          return (
            <span
              key={n.id}
              className={`wt-face${who?.team ? ' team' : ''}`}
              data-node={n.id}
              style={{ left: n.x - face / 2, top: n.y - face / 2, width: face, height: face }}
            >
              {who?.team ? (
                <b style={{ fontSize: Math.round(face * 0.55) }}>{who.name.slice(0, 1).toUpperCase()}</b>
              ) : who?.look ? (
                <Hero agent={{ name: who.name, look: who.look }} size={face} />
              ) : (
                <Hero ghost size={face} />
              )}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** Nothing drawn: three faint dots joined by one faint arrow — a generic "way" mark. */
function EmptyMark({ cls, size }: { cls: string; size: ThumbSize }) {
  const { w, h } = THUMB[size];
  const r = Math.max(2.5, h / 12);
  const y = h / 2;
  const xs = [w * 0.25, w * 0.5, w * 0.75];
  return (
    <span className={`${cls} wt-none`} aria-hidden="true" data-testid="wt-empty">
      <span className="wt-stage" style={{ width: w, height: h }}>
        <svg width={w} height={h} aria-hidden="true">
          <path className="wt-faint" d={`M${xs[0] + r + 2} ${y}L${xs[1] - r - 2} ${y}`} />
          {xs.map((x) => (
            <circle key={x} cx={x} cy={y} r={r} className="wt-dot" />
          ))}
        </svg>
      </span>
    </span>
  );
}
