import type { FastifyPluginAsync } from 'fastify';
import { modulesDir, readModules } from '../blueprint/modules.ts';
import type { Config } from '../config.ts';
import { SCAFFOLD_TREE } from '../setter/scaffold.ts';

export const blueprintRoutes =
  ({ config }: { config: Config }): FastifyPluginAsync =>
  async (app) => {
    /* the modules every new project's CLAUDE.md is compiled from + what the Setter creates */
    app.get('/blueprint', async () => ({
      modulesDir: modulesDir(config.controlHome),
      modules: readModules(config.controlHome).map(({ name, description }) => ({ name, description })),
      tree: SCAFFOLD_TREE,
    }));
  };
