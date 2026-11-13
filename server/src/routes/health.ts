import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config.ts';
import { type Db, dbHealthy } from '../db/connection.ts';
import { VERSION } from '../version.ts';

export const healthRoutes =
  ({ config, db }: { config: Config; db: Db }): FastifyPluginAsync =>
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
      });
    });
  };
