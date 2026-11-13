import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { readModules } from '../blueprint/modules.ts';
import type { Config } from '../config.ts';
import type { Store } from '../db/store.ts';
import { conflict, parse } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { finishDraft, localDate, setupDraft } from '../setter/finish.ts';
import { isRepo } from '../setter/git.ts';
import { inspect } from '../setter/scaffold.ts';
import { IdParams } from './schemas.ts';

export const setterRoutes =
  ({ store, config, events }: { store: Store; config: Config; events: EventLog }): FastifyPluginAsync =>
  async (app) => {
    const deps = {
      store,
      events,
      sandbox: config.sandbox,
      controlHome: config.controlHome,
      modules: () => readModules(config.controlHome),
      today: () => localDate(),
    };

    /* the Project Setter sets the draft's folder up (new or adopt); steps stream on GET /drafts/:id/events.
       Idempotent: again = only what's missing. The draft owns the folder from then on. */
    app.post('/drafts/:id/setup', async (req) => setupDraft(deps, parse(IdParams, req.params).id));

    /* draft → project (from the set-up folder + the accepted plan); a never-set-up draft is set up first. */
    app.post('/drafts/:id/finish', async (req, reply) =>
      reply.status(201).send(await finishDraft(deps, parse(IdParams, req.params).id)),
    );

    /* what's on disk vs what the scaffold expects */
    app.get('/projects/:id/scaffold', async (req) => {
      const p = store.projects.require(parse(IdParams, req.params).id);
      if (!p.folder) throw conflict(`Project '${p.id}' has no folder yet`);
      return inspect(config.sandbox, p.folder);
    });

    /* top-level sandbox folders not yet under AI Studio — the Adopt picker */
    app.get('/sandbox/folders', async () => {
      const taken = new Set(
        [...store.projects.list().map((p) => p.folder), ...store.drafts.setUpFolders()].map(
          (f) => f?.split('/')[0],
        ),
      );
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
