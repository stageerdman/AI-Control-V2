/* Studio-wide settings: `githubByDefault` (G1: new projects get a GitHub repo at setup) and
   `autoApprove` (AGENTS: the studio answers agents' yes/no permission checks itself). Both default on. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { MetaFlag } from '../db/settings.ts';
import { parse } from '../errors.ts';
import type { Github } from '../github/github.ts';

const SettingsPatch = z.strictObject({
  githubByDefault: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
});

export const settingsRoutes =
  ({ github, autoApprove }: { github: Github; autoApprove: MetaFlag }): FastifyPluginAsync =>
  async (app) => {
    const view = () => ({
      githubByDefault: github.settings.githubByDefault(),
      autoApprove: autoApprove.get(),
    });
    app.get('/settings', async () => view());
    app.patch('/settings', async (req) => {
      const body = parse(SettingsPatch, req.body);
      if (body.githubByDefault !== undefined) github.settings.setGithubByDefault(body.githubByDefault);
      if (body.autoApprove !== undefined) autoApprove.set(body.autoApprove);
      return view();
    });
  };
