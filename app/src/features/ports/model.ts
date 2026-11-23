/* The Switchboard, pure (spec-ux-G2 §3): GET /ports → one row per project with a folder (on set first,
   then the back lot, each A–Z), and the one-line summary the health board's App details show. Read-only:
   the studio allocates the ports; "Free" was cut (the server has no stop-a-listener route). */
import type { Agent, PortsView, Project } from '../../api/types';
import { isOnSet, nickOf } from '../projects/model';

export type PortRow = {
  projectId: string;
  name: string;
  tile: Project['tile'] | null;
  /** The project's office icon (shown instead of the tile). */
  imageUrl: string | null;
  muted: boolean;
  /** "3290–3294" */
  block: string;
  app: { port: number; running: boolean };
  /** "3291 Captain" — other ports in the block that answer, or that a running agent holds. */
  others: { port: number; who: string | null; listening: boolean }[];
};

type Proj = PortsView['projects'][number];

export const blockLabel = (b: Proj['block']): string => `${b.app}–${b.spares.at(-1) ?? b.app}`;

/** Ports in the block other than the app's that answer or are held (the app port counts when the app isn't the listener). */
export function othersOf(p: Proj, agentName: (id: string) => string | null) {
  return p.ports
    .filter((x) =>
      x.role === 'app' ? x.listening && p.app.status !== 'running' : x.listening || x.heldBy !== null,
    )
    .map((x) => ({
      port: x.port,
      who: x.heldBy?.agentId ? agentName(x.heldBy.agentId) : null,
      listening: x.listening,
    }));
}

export function portRows(view: PortsView, projects: Project[], agents: Agent[], now = Date.now()): PortRow[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const agentName = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ? nickOf(a) : null;
  };
  const rows = view.projects
    .filter((x) => byId.get(x.projectId)?.folder)
    .map((x): PortRow & { onSet: boolean } => {
      const p = byId.get(x.projectId) as Project;
      const onSet = isOnSet(p, now);
      return {
        projectId: x.projectId,
        name: x.name,
        tile: p.tile ?? null,
        imageUrl: p.imageUrl ?? null,
        muted: !onSet,
        onSet,
        block: blockLabel(x.block),
        app: { port: x.block.app, running: x.app.status === 'running' },
        others: othersOf(x, agentName),
      };
    });
  rows.sort(
    (a, b) =>
      Number(b.onSet) - Number(a.onSet) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
  return rows.map(({ onSet: _, ...r }) => r);
}

/** "3291 Captain" · "3292 held by Pete" (held, nothing answering yet) · "3290" */
export const otherLabel = (o: PortRow['others'][number]): string =>
  o.who ? (o.listening ? `${o.port} ${o.who}` : `${o.port} held by ${o.who}`) : String(o.port);

/** The health board's App details line: "Ports 3290–3294 · app on 3290 · 3291 also listening". */
export function portsLine(p: Proj): string {
  const others = p.ports.filter((x) => x.role === 'spare' && x.listening).map((x) => x.port);
  const bits = [`Ports ${blockLabel(p.block)}`, `app on ${p.block.app}`];
  if (others.length) bits.push(`${others.join(', ')} also listening`);
  return bits.join(' · ');
}
