import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { readModules } from '../blueprint/modules.ts';
import type { Config } from '../config.ts';
import type { Store } from '../db/store.ts';
import { conflict, parse } from '../errors.ts';
import { finishDraft, localDate } from '../setter/finish.ts';
import { isRepo } from '../setter/git.ts';
import { inspect } from '../setter/scaffold.ts';
import { IdParams } from './schemas.ts';

export const setterRoutes =
  ({ store, config }: { store: Store; config: Config }): FastifyPluginAsync =>
  async (app) => {
    const deps = {
      store,
      sandbox: config.sandbox,
      controlHome: config.controlHome,
      modules: () => readModules(config.controlHome),
      today: () => localDate(),
    };

    /* the Project Setter runs: draft → project + scaffold on disk. Steps come back in order (B4 streams them). */
    app.post('/drafts/:id/finish', async (req, reply) =>
      reply.status(201).send(finishDraft(deps, parse(IdParams, req.params).id)),
    );

    /* what's on disk vs what the scaffold expects */
    app.get('/projects/:id/scaffold', async (req) => {
      const p = store.projects.require(parse(IdParams, req.params).id);
      if (!p.folder) throw conflict(`Project '${p.id}' has no folder yet`);
      return inspect(config.sandbox, p.folder);
    });

    /* top-level sandbox folders not yet under AI Studio — the Adopt picker */
    app.get('/sandbox/folders', async () => {
      const taken = new Set(store.projects.list().map((p) => p.folder?.split('/')[0]));
      if (!existsSync(config.sandbox)) return [];
      return readdirSync(config.sandbox, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !taken.has(d.name))
        .map((d) => {
          const abs = join(config.sandbox, d.name);
          return { folder: d.name, git: isRepo(abs), marked: existsSync(join(abs, '.project')) };
        })
        .sort((a, b) => a.folder.localeCompare(b.folder));
    });
  };
