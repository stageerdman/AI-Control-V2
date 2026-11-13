import type { FastifyPluginAsync } from 'fastify';
import { modulesDir, moduleTimes, readModules } from '../blueprint/modules.ts';
import type { Config } from '../config.ts';
import { SCAFFOLD_TREE } from '../setter/scaffold.ts';

export const blueprintRoutes =
  ({ config }: { config: Config }): FastifyPluginAsync =>
  async (app) => {
    /* the modules every new project's CLAUDE.md is compiled from + what the Setter creates */
    app.get('/blueprint', async () => {
      const times = moduleTimes(config.controlHome);
      return {
        modulesDir: modulesDir(config.controlHome),
        modules: readModules(config.controlHome).map((m) => ({ ...m, updatedAt: times[m.name] ?? null })),
        tree: SCAFFOLD_TREE,
      };
    });
  };
