/* G1 ports: a stable, persisted, non-overlapping block per project; spares handed to runs; GET /ports. */
import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { portFor } from '../../src/apps/app-runner.ts';
import { BLOCK, createPorts, freeBase, hashPort, listening, preferredBase } from '../../src/apps/ports.ts';
import { openDb } from '../../src/db/connection.ts';
import { testApp } from '../helpers.ts';

describe('ports', () => {
  it('blocks start at the F3 app port, never overlap, and persist', () => {
    expect(preferredBase('aurora')).toBe(hashPort('aurora'));
    expect(portFor('aurora', new Set())).toBe(hashPort('aurora')); // F3's apps keep their port
    expect(freeBase(3200, [3200])).toBe(3205);
    expect(freeBase(3200, [3203])).toBe(3210); // 3205–3209 would still overlap 3203–3207
    expect(freeBase(3995, [3995])).toBe(3104); // wraps around the range
    const db = openDb(':memory:');
    db.exec(
      `INSERT INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES ('o', 'orchestrator', 'O', '{}', 0, '', '');`,
    );
    const ins = db.prepare(
      "INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at) VALUES (?, ?, 'live', 'o', '{}', 0, '', '')",
    );
    const ids = Array.from({ length: 60 }, (_, i) => `p${i}`);
    for (const id of ids) ins.run(id, id);
    const ports = createPorts(db);
    const blocks = ids.map((id) => ports.blockFor(id));
    const all = blocks.flatMap((b) => [b.app, ...b.spares]);
    expect(new Set(all).size).toBe(all.length); // no port in two blocks
    expect(all.every((p) => p >= 3100 && p <= 3999)).toBe(true);
    expect(blocks[0]?.spares).toHaveLength(BLOCK - 1);
    expect(createPorts(db).blockFor('p7')).toEqual(blocks[7]); // persisted
    /* spares: one per live run, released when it ends */
    const a = ports.take('p1', 'run-a');
    const b = ports.take('p1', 'run-b');
    expect([a.port, b.port]).toEqual([blocks[1]?.spares[0], blocks[1]?.spares[1]]);
    ports.release('run-a');
    expect(ports.take('p1', 'run-c').port).toBe(blocks[1]?.spares[0]);
    expect(
      ports
        .holders('p1')
        .map((h) => h.runId)
        .sort(),
    ).toEqual(['run-b', 'run-c']);
    db.close();
  });

  describe('GET /ports', () => {
    let h: ReturnType<typeof testApp>;
    afterEach(() => h.close());
    it('lists every project: block, app, and what is listening', async () => {
      h = testApp({ seed: true });
      const block = createPorts(h.db).blockFor('aurora');
      const srv = createServer().listen(block.spares[1], '127.0.0.1');
      await new Promise((r) => srv.once('listening', r));
      try {
        expect(await listening(block.spares[1] as number)).toBe(true);
        const r = await h.call('GET', '/ports');
        expect(r.status).toBe(200);
        expect(r.body.range).toEqual({ from: 3100, to: 3999 });
        const aurora = r.body.projects.find((p: { projectId: string }) => p.projectId === 'aurora');
        expect(aurora).toMatchObject({
          name: 'Aurora Storefront',
          block,
          app: { status: 'stopped', port: null, url: null },
        });
        expect(aurora.ports).toEqual([
          { port: block.app, role: 'app', listening: false, heldBy: null },
          ...block.spares.map((port) => ({
            port,
            role: 'spare',
            listening: port === block.spares[1],
            heldBy: null,
          })),
        ]);
        expect(r.body.projects).toHaveLength(h.store.projects.list().length);
      } finally {
        srv.close();
      }
    });
  });
});
