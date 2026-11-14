/* The Ports room (G1): every project's block, who holds which port, what's listening right now. */
import type { FastifyPluginAsync } from 'fastify';
import type { AppRunner } from '../apps/app-runner.ts';
import { listening, type Ports } from '../apps/ports.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';

export const portRoutes =
  ({ store, ports, apps, db }: { store: Store; ports: Ports; apps: AppRunner; db: Db }): FastifyPluginAsync =>
  async (app) => {
    app.get('/ports', async () => {
      const projects = store.projects.list();
      const agentOf = new Map(
        rows<{ id: string; agent_id: string }>(
          db.prepare("SELECT id, agent_id FROM runs WHERE status = 'running'").all(),
        ).map((r) => [r.id, r.agent_id]),
      );
      const out = await Promise.all(
        projects.map(async (p) => {
          const block = ports.blockFor(p.id);
          let appView: { status: string; port: number | null; url: string | null } = {
            status: 'stopped',
            port: null,
            url: null,
          };
          try {
            const v = apps.view(p.id);
            appView = { status: v.status, port: v.port, url: v.url };
          } catch {
            /* no folder yet: the app can't run */
          }
          const holders = ports.holders(p.id);
          const all = [block.app, ...block.spares];
          const live = await Promise.all(all.map((port) => listening(port)));
          return {
            projectId: p.id,
            name: p.name,
            block: { app: block.app, spares: block.spares },
            app: appView,
            ports: all.map((port, i) => {
              const h = holders.find((x) => x.port === port);
              return {
                port,
                role: i === 0 ? 'app' : 'spare',
                listening: live[i] as boolean,
                heldBy: h ? { runId: h.runId, agentId: agentOf.get(h.runId) ?? null } : null,
              };
            }),
          };
        }),
      );
      return { range: { from: 3100, to: 3999 }, projects: out };
    });
  };
