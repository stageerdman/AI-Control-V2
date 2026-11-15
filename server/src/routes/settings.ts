/* Studio-wide settings: `githubByDefault` (G1: new projects get a GitHub repo at setup) and
   `autoApprove` (AGENTS: the studio answers agents' yes/no permission checks itself). Both default on. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { MetaFlag } from '../db/settings.ts';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import type { Github } from '../github/github.ts';

const SettingsPatch = z.strictObject({
  githubByDefault: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  /** STUDIO LIFE: the project that is HQ (the studio's own repo); null = none. */
  hqProjectId: z.string().min(1).max(80).nullable().optional(),
});

export const settingsRoutes =
  ({
    github,
    autoApprove,
    hq,
    store,
  }: {
    github: Github;
    autoApprove: MetaFlag;
    hq: { get(): string | null; set(v: string | null): void };
    store: Store;
  }): FastifyPluginAsync =>
  async (app) => {
    const view = () => ({
      githubByDefault: github.settings.githubByDefault(),
      autoApprove: autoApprove.get(),
      hqProjectId: hq.get() && store.projects.get(hq.get() as string) ? hq.get() : null,
    });
    app.get('/settings', async () => view());
    app.patch('/settings', async (req) => {
      const body = parse(SettingsPatch, req.body);
      if (body.githubByDefault !== undefined) github.settings.setGithubByDefault(body.githubByDefault);
      if (body.autoApprove !== undefined) autoApprove.set(body.autoApprove);
      if (body.hqProjectId !== undefined) {
        if (body.hqProjectId) store.projects.require(body.hqProjectId);
        hq.set(body.hqProjectId);
      }
      return view();
    });
  };
