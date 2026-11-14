/* Ports (G1): a studio service, not an agent — allocation is deterministic. Each project owns a stable block of
   BLOCK ports in 3100–3999, persisted: block[0] is its app's port (Run the app), the rest are spares that agent runs
   get as PORT (one per live run, so two agents smoke-testing side by side never collide). `listening` is a cheap
   local connect check, only asked for by GET /ports. */
import { connect } from 'node:net';
import type { Db } from '../db/connection.ts';
import { now, row, rows } from '../db/util.ts';

export const PORT_BASE = 3100;
export const PORT_SPAN = 900;
export const BLOCK = 5;
export type PortBlock = { app: number; spares: number[] };

/** Pure: F3's app port for a project id (3100–3999, stable). */
export function hashPort(projectId: string): number {
  let h = 0;
  for (const c of projectId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PORT_BASE + (h % PORT_SPAN);
}
/** Pure: the project's preferred block start — F3's app port (so existing apps keep theirs), kept inside the range. */
export const preferredBase = (projectId: string): number =>
  Math.min(hashPort(projectId), PORT_BASE + PORT_SPAN - BLOCK);

/** Pure: the first base from `preferred` (stepping by BLOCK, wrapping) whose block overlaps none of `taken`. */
export function freeBase(preferred: number, taken: readonly number[]): number {
  const last = PORT_BASE + PORT_SPAN - BLOCK;
  const clash = (b: number) => taken.some((t) => Math.abs(t - b) < BLOCK);
  for (let i = 0; i < PORT_SPAN; i++) {
    const b = PORT_BASE + ((preferred - PORT_BASE + i * BLOCK) % (last - PORT_BASE + 1));
    if (!clash(b)) return b;
  }
  throw new Error('No free port block left in 3100–3999');
}

/** Is something accepting connections on 127.0.0.1:port (or ::1)? Resolves within `ms`. */
export function listening(port: number, ms = 200): Promise<boolean> {
  const one = (host: string) =>
    new Promise<boolean>((resolve) => {
      const s = connect({ host, port });
      const done = (v: boolean) => {
        s.destroy();
        resolve(v);
      };
      s.setTimeout(ms, () => done(false));
      s.once('connect', () => done(true));
      s.once('error', () => done(false));
    });
  return Promise.all([one('127.0.0.1'), one('::1')]).then(([a, b]) => a || b);
}

export function createPorts(db: Db) {
  const toBlock = (base: number): PortBlock => ({
    app: base,
    spares: Array.from({ length: BLOCK - 1 }, (_, i) => base + i + 1),
  });
  /** runId → the spare it holds */
  const held = new Map<string, { projectId: string; port: number }>();

  const svc = {
    /** The project's block, allocated (and persisted) on first ask. */
    blockFor(projectId: string): PortBlock {
      const r = row<{ base: number }>(
        db.prepare('SELECT base FROM port_blocks WHERE project_id = ?').get(projectId),
      );
      if (r) return toBlock(r.base);
      const taken = rows<{ base: number }>(db.prepare('SELECT base FROM port_blocks').all()).map(
        (x) => x.base,
      );
      const base = freeBase(preferredBase(projectId), taken);
      db.prepare('INSERT INTO port_blocks (project_id, base, created_at) VALUES (?, ?, ?)').run(
        projectId,
        base,
        now(),
      );
      return toBlock(base);
    },

    /** A spare for this run: the first one no other live run of the project holds (all held → the first). */
    take(projectId: string, runId: string): { port: number; block: PortBlock } {
      const block = svc.blockFor(projectId);
      const busy = new Set([...held.values()].filter((h) => h.projectId === projectId).map((h) => h.port));
      const port = block.spares.find((p) => !busy.has(p)) ?? (block.spares[0] as number);
      held.set(runId, { projectId, port });
      return { port, block };
    },
    release: (runId: string) => held.delete(runId),
    /** Who holds which spare right now. */
    holders: (projectId: string) =>
      [...held.entries()]
        .filter(([, h]) => h.projectId === projectId)
        .map(([runId, h]) => ({ runId, port: h.port })),
  };
  return svc;
}
export type Ports = ReturnType<typeof createPorts>;
