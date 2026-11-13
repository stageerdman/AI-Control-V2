import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';

const TokenParams = z.object({ token: z.uuid() });

export const trashRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    /* undo a delete: the token comes from DELETE /agents|roles|teams|drafts/:id */
    app.post('/trash/:token/restore', async (req) =>
      store.trash.restore(parse(TokenParams, req.params).token),
    );
  };
