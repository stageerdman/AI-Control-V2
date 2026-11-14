import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { readModules } from '../blueprint/modules.ts';
import type { Config } from '../config.ts';
import type { Store } from '../db/store.ts';
import { conflict, parse } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import type { Github } from '../github/github.ts';
import { finishDraft, localDate, setupDraft } from '../setter/finish.ts';
import { isRepo } from '../setter/git.ts';
import { inspect } from '../setter/scaffold.ts';
import { IdParams } from './schemas.ts';

const SetupBody = z.strictObject({ github: z.boolean().optional() });

export const setterRoutes =
  ({
    store,
    config,
    events,
    github,
  }: {
    store: Store;
    config: Config;
    events: EventLog;
    github?: Github;
  }): FastifyPluginAsync =>
  async (app) => {
    const deps = {
      store,
      events,
      sandbox: config.sandbox,
      controlHome: config.controlHome,
      modules: () => readModules(config.controlHome),
      today: () => localDate(),
      ...(github ? { github } : {}),
    };

    /* the Project Setter sets the draft's folder up (new or adopt); steps stream on GET /drafts/:id/events.
       Idempotent: again = only what's missing. The draft owns the folder from then on. */
    app.post('/drafts/:id/setup', async (req) => {
      const { id } = parse(IdParams, req.params);
      /* G1: `{github: false}` = no GitHub repo for this project (default: the studio setting, on) */
      const body = parse(SetupBody, req.body ?? {});
      if (body.github !== undefined) store.drafts.update(id, { github: body.github });
      return setupDraft(deps, id);
    });

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
