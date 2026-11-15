import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config.ts';
import { type Db, dbHealthy } from '../db/connection.ts';
import type { BuildReport } from '../self-install/self-install.ts';
import { VERSION } from '../version.ts';

/** `build` is reported only by a backend that keeps the Mac app current (the main checkout on a Mac). */
export const healthRoutes =
  ({
    config,
    db,
    build,
  }: {
    config: Config;
    db: Db;
    build?: (() => BuildReport) | null;
  }): FastifyPluginAsync =>
  async (app) => {
    app.get('/health', async (_req, reply) => {
      const dbOk = dbHealthy(db);
      return reply.status(dbOk ? 200 : 503).send({
        ok: dbOk,
        version: VERSION,
        paths: {
          home: config.home,
          sandbox: config.sandbox,
          controlHome: config.controlHome,
          db: config.dbPath,
        },
        db: { ok: dbOk },
        ...(build ? { build: build() } : {}),
      });
    });
  };
