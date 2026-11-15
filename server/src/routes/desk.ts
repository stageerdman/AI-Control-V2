/* STUDIO LIFE: desk notes — what agents left themselves before they forgot (newest first). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import type { Desk } from '../office/desk.ts';
import { Id, IdParams } from './schemas.ts';

const Query = z.object({ agentId: Id.optional() });
const NoteParams = z.object({ id: Id, noteId: z.uuid() });

export const deskRoutes =
  ({ desk, store }: { desk: Desk; store: Store }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/desk-notes', async (req) => {
      const { id } = parse(IdParams, req.params);
      store.projects.require(id);
      return { notes: desk.list(id, parse(Query, req.query).agentId) };
    });
    app.get('/projects/:id/desk-notes/:noteId', async (req) => {
      const { id, noteId } = parse(NoteParams, req.params);
      return desk.get(id, noteId);
    });
  };
