import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { TeamWorkflows } from '../crew/team-workflow.ts';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';

const TokenParams = z.object({ token: z.uuid() });

/* `teamWays.watch`: a restored agent back in its teams redraws their default way */
export const trashRoutes =
  ({ store, teamWays }: { store: Store; teamWays: Pick<TeamWorkflows, 'watch'> }): FastifyPluginAsync =>
  async (app) => {
    /* the Cast's "Recently deleted": agents still restorable, newest first */
    app.get('/trash/agents', async () => ({ items: store.trash.deletedAgents() }));

    /* undo a delete: the token comes from DELETE /agents|roles|teams|drafts/:id */
    app.post('/trash/:token/restore', async (req) =>
      teamWays.watch(() => store.trash.restore(parse(TokenParams, req.params).token)),
    );
  };
