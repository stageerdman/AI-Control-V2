/* GitHub (G1): publish a project (the user's button), the public/private switch, and the studio-wide
   status. The studio runs gh; agents push to their own origin (git-guard.ts). (GET/PATCH /settings: routes/settings.ts.) */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Github } from '../github/github.ts';
import { IdParams } from './schemas.ts';

const Visibility = z.enum(['private', 'public']);
const PublishBody = z.strictObject({
  name: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,100}$/, 'Use letters, digits, . _ and - (a GitHub repo name)')
    .optional(),
  visibility: Visibility.default('private'),
});
const VisibilityBody = z.strictObject({ visibility: Visibility });

export const githubRoutes =
  ({ github }: { github: Github }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/github', async (req) => {
      const { id } = parse(IdParams, req.params);
      return github.projectView(id);
    });
    app.post('/projects/:id/github/publish', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      return reply.status(201).send(await github.publish(id, parse(PublishBody, req.body ?? {})));
    });
    app.post('/projects/:id/github/push', async (req) => github.pushNow(parse(IdParams, req.params).id));
    app.patch('/projects/:id/github', async (req) => {
      const { id } = parse(IdParams, req.params);
      return github.setVisibility(id, parse(VisibilityBody, req.body).visibility);
    });
    app.get('/github/status', async () => github.status());
  };
